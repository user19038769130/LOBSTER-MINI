const { RunStatus, DisconnectMode } = require('./schemas');
const { now_iso } = require('./time');
const { v4: uuid } = require('uuid');

class Mutex {
  constructor() { this._locked = false; this._queue = []; }
  async runExclusive(fn) {
    return new Promise((resolve, reject) => {
      const exec = async () => {
        try { this._locked = true; resolve(await fn()); } catch (e) { reject(e); }
        finally { this._locked = false; if (this._queue.length) { const next = this._queue.shift(); next(); } }
      };
      if (!this._locked) { this._locked = true; exec(); }
      else { this._queue.push(exec); }
    });
  }
}

class RunRecord {
  constructor({ run_id, thread_id, assistant_id = null, status = RunStatus.pending, on_disconnect = DisconnectMode.cancel, multitask_strategy = 'reject', metadata = {}, kwargs = {}, created_at = '', updated_at = '', task = null, abort_event = null, abort_action = 'interrupt', error = null, model_name = null, store_only = false }) {
    this.run_id = run_id; this.thread_id = thread_id; this.assistant_id = assistant_id; this.status = status;
    this.on_disconnect = on_disconnect; this.multitask_strategy = multitask_strategy;
    this.metadata = metadata; this.kwargs = kwargs; this.created_at = created_at; this.updated_at = updated_at;
    this.task = task; this.abort_event = abort_event || new AbortController();
    this.abort_action = abort_action; this.error = error; this.model_name = model_name; this.store_only = store_only;
  }
}

class RunManager {
  constructor(store = null) {
    this._runs = new Map();
    this._lock = new Mutex();
    this._store = store;
  }

  async _persistToStore(record) {
    if (!this._store) return;
    try {
      await this._store.put(record.run_id, {
        thread_id: record.thread_id, assistant_id: record.assistant_id,
        status: record.status, multitask_strategy: record.multitask_strategy,
        metadata: record.metadata, kwargs: record.kwargs, error: record.error,
        created_at: record.created_at, model_name: record.model_name,
      });
    } catch (e) { console.warn('持久化失败', e); }
  }

  async _persistStatus(run_id, status, error = null) {
    if (!this._store) return;
    try { await this._store.update_status(run_id, status, { error }); } catch (e) { console.warn(e); }
  }

  async updateRunCompletion(run_id, completion) {
    if (this._store) try { await this._store.update_run_completion(run_id, completion); } catch (e) { console.warn(e); }
  }

  async create(thread_id, assistant_id = null, options = {}) {
    const run_id = uuid(); const now = now_iso();
    const record = new RunRecord({ run_id, thread_id, assistant_id, status: RunStatus.pending, on_disconnect: options.on_disconnect || DisconnectMode.cancel, multitask_strategy: options.multitask_strategy || 'reject', metadata: options.metadata || {}, kwargs: options.kwargs || {}, created_at: now, updated_at: now });
    await this._lock.runExclusive(() => this._runs.set(run_id, record));
    await this._persistToStore(record);
    return record;
  }

  async get(run_id, user_id = null) {
    let record;
    await this._lock.runExclusive(() => { record = this._runs.get(run_id); });
    if (record) return record;
    if (!this._store) return null;
    const row = await this._store.get(run_id, { user_id });
    if (!row) return null;
    await this._lock.runExclusive(() => { record = this._runs.get(run_id); });
    if (record) return record;
    return this._recordFromStore(row);
  }

  _recordFromStore(row) {
    return new RunRecord({ run_id: row.run_id, thread_id: row.thread_id, assistant_id: row.assistant_id, status: row.status, on_disconnect: row.on_disconnect || DisconnectMode.cancel, multitask_strategy: row.multitask_strategy || 'reject', metadata: row.metadata || {}, kwargs: row.kwargs || {}, created_at: row.created_at, updated_at: row.updated_at, error: row.error, model_name: row.model_name, store_only: true });
  }

  async aget(run_id, user_id = null) { return this.get(run_id, user_id); }

  async list_by_thread(thread_id, { user_id = null, limit = 100 } = {}) {
    let memoryRecords;
    await this._lock.runExclusive(() => { memoryRecords = [...this._runs.values()].filter(r => r.thread_id === thread_id); });
    if (!this._store) return memoryRecords.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
    const recordsById = new Map(memoryRecords.map(r => [r.run_id, r]));
    const rows = await this._store.list_by_thread(thread_id, { user_id, limit: Math.max(0, limit - memoryRecords.length) });
    for (const row of rows) {
      if (!recordsById.has(row.run_id)) recordsById.set(row.run_id, this._recordFromStore(row));
    }
    return [...recordsById.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  }

  async setStatus(run_id, status, { error = null } = {}) {
    await this._lock.runExclusive(() => {
      const record = this._runs.get(run_id);
      if (record) { record.status = status; record.updated_at = now_iso(); if (error != null) record.error = error; }
    });
    await this._persistStatus(run_id, status, error);
  }

  async updateModelName(run_id, model_name) {
    await this._lock.runExclusive(() => {
      const record = this._runs.get(run_id);
      if (record) { record.model_name = model_name; record.updated_at = now_iso(); }
    });
    if (this._store) await this._store.update_model_name(run_id, model_name);
  }

  async cancel(run_id, action = 'interrupt') {
    let ret = false;
    await this._lock.runExclusive(() => {
      const record = this._runs.get(run_id);
      if (!record) return;
      if (record.status === RunStatus.interrupted) { ret = true; return; }
      if (record.status !== RunStatus.pending && record.status !== RunStatus.running) return;
      record.abort_action = action;
      record.abort_event.abort();
      if (record.task && !record.task.done) record.task.abort();
      record.status = RunStatus.interrupted;
      record.updated_at = now_iso();
      ret = true;
    });
    if (ret) await this._persistStatus(run_id, RunStatus.interrupted);
    return ret;
  }

  async createOrReject(thread_id, assistant_id = null, options = {}) {
    const run_id = uuid(); const now = now_iso();
    const supported = ['reject', 'interrupt', 'rollback'];
    const { on_disconnect = DisconnectMode.cancel, metadata = {}, kwargs = {}, multitask_strategy = 'reject', model_name = null } = options;
    if (!supported.includes(multitask_strategy)) throw new Error(`不支持的多任务策略: ${multitask_strategy}`);
    const interruptedRunIds = [];
    await this._lock.runExclusive(() => {
      const inflight = [...this._runs.values()].filter(r => r.thread_id === thread_id && (r.status === RunStatus.pending || r.status === RunStatus.running));
      if (multitask_strategy === 'reject' && inflight.length > 0) throw new ConflictError(`Thread ${thread_id} 已有活跃运行`);
      if (['interrupt', 'rollback'].includes(multitask_strategy) && inflight.length > 0) {
        for (const r of inflight) {
          r.abort_action = multitask_strategy; r.abort_event.abort();
          if (r.task && !r.task.done) r.task.abort();
          r.status = RunStatus.interrupted; r.updated_at = now;
          interruptedRunIds.push(r.run_id);
        }
      }
      const record = new RunRecord({ run_id, thread_id, assistant_id, status: RunStatus.pending, on_disconnect, multitask_strategy, metadata, kwargs, created_at: now, updated_at: now, model_name });
      this._runs.set(run_id, record);
    });
    for (const id of interruptedRunIds) await this._persistStatus(id, RunStatus.interrupted);
    await this._persistToStore(this._runs.get(run_id));
    return this._runs.get(run_id);
  }

  async hasInflight(thread_id) {
    return this._lock.runExclusive(() => [...this._runs.values()].some(r => r.thread_id === thread_id && (r.status === RunStatus.pending || r.status === RunStatus.running)));
  }

  async cleanup(run_id, delay = 300) {
    if (delay > 0) await new Promise(r => setTimeout(r, delay * 1000));
    await this._lock.runExclusive(() => this._runs.delete(run_id));
  }
}

class ConflictError extends Error {}
class UnsupportedStrategyError extends Error {}

module.exports = { RunRecord, RunManager, ConflictError, UnsupportedStrategyError };