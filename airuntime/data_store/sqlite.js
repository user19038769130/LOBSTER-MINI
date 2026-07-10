// runtime/store/sqlite.js
const { RunStore } = require('./base');
const { now_iso } = require('../time');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class SQLiteRunStore extends RunStore {
  constructor(dbPath = null) {
    super();
    if (!dbPath) {
      const dataDir = path.join(__dirname, '..', '..', 'data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      dbPath = path.join(dataDir, 'lobster.db');
    }
    this.db = new Database(dbPath);
    this._init();
  }

  _init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        assistant_id TEXT,
        user_id TEXT,
        model_name TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        multitask_strategy TEXT NOT NULL DEFAULT 'reject',
        metadata TEXT DEFAULT '{}',
        kwargs TEXT DEFAULT '{}',
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        total_input_tokens INTEGER DEFAULT 0,
        total_output_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        llm_call_count INTEGER DEFAULT 0,
        lead_agent_tokens INTEGER DEFAULT 0,
        subagent_tokens INTEGER DEFAULT 0,
        middleware_tokens INTEGER DEFAULT 0,
        message_count INTEGER DEFAULT 0,
        last_ai_message TEXT,
        first_human_message TEXT
      );
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        points INTEGER DEFAULT 10,
        user_api_key TEXT DEFAULT '',
        agents TEXT DEFAULT '[]',
        custom_skills TEXT DEFAULT '[]',
        created_at TEXT,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS orders (
        order_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        points INTEGER NOT NULL,
        amount REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS global_config (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS behavior_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        user_message TEXT,
        assistant_reply TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        skill_name TEXT,
        args TEXT,
        success INTEGER DEFAULT 1,
        result TEXT,
        duration_ms INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_runs_thread ON runs(thread_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_behavior_user ON behavior_logs(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, created_at);
    `);

    const initCfg = this.db.prepare('INSERT OR IGNORE INTO global_config (key, value) VALUES (?, ?)');
    initCfg.run('modelName', process.env.DEFAULT_MODEL || 'gpt-3.5-turbo');
    initCfg.run('apiUrl', process.env.DEFAULT_API_URL || 'https://api.openai.com/v1/chat/completions');
    initCfg.run('apiKey', process.env.DEFAULT_API_KEY || '');
    initCfg.run('maxQuota', '1000');
    initCfg.run('defaultPoints', '10');
  }

  // ========== RunStore 抽象方法 ==========
  async put(run_id, {
    thread_id, assistant_id = null, user_id = null, model_name = null,
    status = "pending", multitask_strategy = "reject",
    metadata = null, kwargs = null, error = null, created_at = null,
  } = {}) {
    const now = now_iso();
    this.db.prepare(`
      INSERT INTO runs (run_id, thread_id, assistant_id, user_id, model_name, status,
        multitask_strategy, metadata, kwargs, error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(run_id, thread_id, assistant_id, user_id, model_name, status,
      multitask_strategy, JSON.stringify(metadata || {}), JSON.stringify(kwargs || {}),
      error, created_at || now, now);
  }

  async get(run_id, { user_id = null } = {}) {
    const row = user_id !== null
      ? this.db.prepare('SELECT * FROM runs WHERE run_id = ? AND user_id = ?').get(run_id, user_id)
      : this.db.prepare('SELECT * FROM runs WHERE run_id = ?').get(run_id);
    return row ? this._rowToDoc(row) : null;
  }

  _rowToDoc(row) {
    return {
      ...row,
      metadata: JSON.parse(row.metadata || '{}'),
      kwargs: JSON.parse(row.kwargs || '{}'),
    };
  }

  async list_by_thread(thread_id, { user_id = null, limit = 100 } = {}) {
    let sql = 'SELECT * FROM runs WHERE thread_id = ?';
    const params = [thread_id];
    if (user_id !== null) { sql += ' AND user_id = ?'; params.push(user_id); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    return this.db.prepare(sql).all(...params).map(row => this._rowToDoc(row));
  }

  async update_status(run_id, status, { error = null } = {}) {
    const now = now_iso();
    this.db.prepare('UPDATE runs SET status = ?, error = ?, updated_at = ? WHERE run_id = ?')
      .run(status, error, now, run_id);
  }

  async update_model_name(run_id, model_name) {
    const now = now_iso();
    this.db.prepare('UPDATE runs SET model_name = ?, updated_at = ? WHERE run_id = ?')
      .run(model_name, now, run_id);
  }

  async delete(run_id) {
    this.db.prepare('DELETE FROM runs WHERE run_id = ?').run(run_id);
  }

  async update_run_completion(run_id, {
    status, total_input_tokens = 0, total_output_tokens = 0, total_tokens = 0,
    llm_call_count = 0, lead_agent_tokens = 0, subagent_tokens = 0,
    middleware_tokens = 0, message_count = 0, last_ai_message = null,
    first_human_message = null, error = null,
  } = {}) {
    const now = now_iso();
    this.db.prepare(`
      UPDATE runs SET status=?, total_input_tokens=?, total_output_tokens=?,
      total_tokens=?, llm_call_count=?, lead_agent_tokens=?, subagent_tokens=?,
      middleware_tokens=?, message_count=?, last_ai_message=?, first_human_message=?,
      error=?, updated_at=? WHERE run_id=?
    `).run(status, total_input_tokens, total_output_tokens, total_tokens,
      llm_call_count, lead_agent_tokens, subagent_tokens, middleware_tokens,
      message_count, last_ai_message, first_human_message, error, now, run_id);
  }

  async list_pending({ before = null } = {}) {
    const now = before || now_iso();
    return this.db.prepare(
      'SELECT * FROM runs WHERE status = ? AND created_at <= ? ORDER BY created_at'
    ).all("pending", now).map(row => this._rowToDoc(row));
  }

  async aggregate_tokens_by_thread(thread_id) {
    const rows = this.db.prepare(
      "SELECT * FROM runs WHERE thread_id = ? AND status IN ('success','error')"
    ).all(thread_id);
    const completed = rows.map(r => this._rowToDoc(r));
    const by_model = {};
    for (const r of completed) {
      const model = r.model_name || "unknown";
      if (!by_model[model]) by_model[model] = { tokens: 0, runs: 0 };
      by_model[model].tokens += (r.total_tokens || 0);
      by_model[model].runs += 1;
    }
    return {
      total_tokens: completed.reduce((s, r) => s + (r.total_tokens || 0), 0),
      total_input_tokens: completed.reduce((s, r) => s + (r.total_input_tokens || 0), 0),
      total_output_tokens: completed.reduce((s, r) => s + (r.total_output_tokens || 0), 0),
      total_runs: completed.length,
      by_model,
      by_caller: {
        lead_agent: completed.reduce((s, r) => s + (r.lead_agent_tokens || 0), 0),
        subagent: completed.reduce((s, r) => s + (r.subagent_tokens || 0), 0),
        middleware: completed.reduce((s, r) => s + (r.middleware_tokens || 0), 0),
      },
    };
  }

  // ========== 业务方法 ==========
  getUser(userId) {
    let user = this.db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
    if (!user) {
      const defaultPoints = parseInt(
        (this.db.prepare('SELECT value FROM global_config WHERE key = ?').get('defaultPoints') || {}).value || '10'
      );
      const now = now_iso();
      this.db.prepare('INSERT INTO users (user_id, points, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run(userId, defaultPoints, now, now);
      user = this.db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
    }
    return {
      ...user,
      agents: JSON.parse(user.agents || '[]'),
      custom_skills: JSON.parse(user.custom_skills || '[]'),
    };
  }

  updateUser(userId, data) {
    const now = now_iso();
    this.db.prepare(`
      UPDATE users SET points=?, user_api_key=?, agents=?, custom_skills=?, updated_at=?
      WHERE user_id=?
    `).run(
      data.points, data.user_api_key || '',
      JSON.stringify(data.agents || []), JSON.stringify(data.custom_skills || []),
      now, userId
    );
  }

  getConfig() {
    const rows = this.db.prepare('SELECT key, value FROM global_config').all();
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }

  setConfig(key, value) {
    this.db.prepare('UPDATE global_config SET value = ? WHERE key = ?').run(value, key);
  }

  createOrder(orderId, userId, planId, points, amount) {
    const now = now_iso();
    this.db.prepare('INSERT INTO orders (order_id, user_id, plan_id, points, amount, status, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(orderId, userId, planId, points, amount, 'pending', now);
  }

  getOrder(orderId) {
    return this.db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId);
  }

  updateOrderStatus(orderId, status) {
    this.db.prepare('UPDATE orders SET status = ? WHERE order_id = ?').run(status, orderId);
  }

  // ========== 行为 & 审计日志 ==========
  addBehaviorLog(userId, userMessage, assistantReply) {
    const now = now_iso();
    this.db.prepare('INSERT INTO behavior_logs (user_id, user_message, assistant_reply, created_at) VALUES (?,?,?,?)')
      .run(userId, userMessage?.substring(0, 500), assistantReply?.substring(0, 500), now);
  }

  getBehaviorLogs(userId, { limit = 20, offset = 0 } = {}) {
    return this.db.prepare(
      'SELECT id, user_id, user_message, assistant_reply, created_at AS timestamp FROM behavior_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(userId, limit, offset);
  }

  addAuditLog(userId, { skillName, args, success = true, result, durationMs = 0 }) {
    const now = now_iso();
    this.db.prepare(
      'INSERT INTO audit_logs (user_id, skill_name, args, success, result, duration_ms, created_at) VALUES (?,?,?,?,?,?,?)'
    ).run(userId, skillName, JSON.stringify(args || {}), success ? 1 : 0, result?.substring(0, 500), durationMs, now);
  }

  getAuditLogs(userId, { limit = 20, offset = 0, skillName = null, success = null } = {}) {
    let sql = 'SELECT id, user_id, skill_name, args, success, result, duration_ms, created_at AS timestamp FROM audit_logs WHERE user_id = ?';
    const params = [userId];
    if (skillName) { sql += ' AND skill_name = ?'; params.push(skillName); }
    if (success !== null && success !== undefined) { sql += ' AND success = ?'; params.push(success ? 1 : 0); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    return this.db.prepare(sql).all(...params);
  }
}

module.exports = { SQLiteRunStore };