const { RunStatus } = require('./schemas');
const { resolve_root_run_name } = require('./naming');
const { RunJournal } = require('./journal');
const VALID_LG_MODES = new Set(['values', 'updates', 'checkpoints', 'tasks', 'debug', 'messages', 'custom']);

function serialize(chunk, mode) { return JSON.stringify(chunk); }
function inject_langfuse_metadata(config, opts) {}

class RunContext {
  constructor({ checkpointer, store, eventStore, runEventsConfig, threadStore, appConfig }) {
    this.checkpointer = checkpointer; this.store = store; this.eventStore = eventStore;
    this.runEventsConfig = runEventsConfig; this.threadStore = threadStore; this.appConfig = appConfig;
  }
}

async function run_agent(bridge, runManager, record, ctx, agentFactory, graphInput, config, streamModes = null, streamSubgraphs = false, interruptBefore = null, interruptAfter = null) {
  const checkpointer = ctx.checkpointer; const store = ctx.store; const eventStore = ctx.eventStore;
  const threadId = record.thread_id; const runId = record.run_id;

  const requestedModes = new Set(streamModes || ['values']);
  let journal = null;
  if (eventStore) journal = new RunJournal({ runId, threadId, eventStore, trackTokenUsage: ctx.runEventsConfig?.track_token_usage ?? true });

  try {
    await runManager.setStatus(runId, RunStatus.running);
    await bridge.publish(runId, 'metadata', { run_id: runId, thread_id: threadId });

    const agent = await agentFactory({ config, messages: graphInput.messages });
    if (checkpointer) agent.checkpointer = checkpointer;
    if (store) agent.store = store;
    if (interruptBefore) agent.interrupt_before_nodes = interruptBefore;
    if (interruptAfter) agent.interrupt_after_nodes = interruptAfter;

    const stream = await agent.astream(graphInput, {
      configurable: { thread_id: threadId },
      stream_mode: 'values',
      subgraphs: streamSubgraphs,
    });

    for await (const chunk of stream) {
      if (record.abort_event.signal.aborted) break;
      await bridge.publish(runId, 'values', serialize(chunk, 'values'));
      if (journal && chunk && chunk.messages) {
        chunk.messages.forEach(m => journal.addMessage(m));
      }
    }

    if (record.abort_event.signal.aborted) {
      await runManager.setStatus(runId, record.abort_action === 'rollback' ? RunStatus.error : RunStatus.interrupted, { error: 'Rolled back' });
    } else {
      await runManager.setStatus(runId, RunStatus.success);
    }
  } catch (err) {
    if (record.abort_event.signal.aborted) await runManager.setStatus(runId, RunStatus.interrupted);
    else {
      await runManager.setStatus(runId, RunStatus.error, { error: err.message });
      await bridge.publish(runId, 'error', { message: err.message });
    }
  } finally {
    if (journal) {
      try { await runManager.updateRunCompletion(runId, { status: record.status, ...journal.getCompletionData() }); } catch (e) {}
    }
    await bridge.publishEnd(runId);
    await bridge.cleanup(runId, 60);
  }
}

module.exports = { RunContext, run_agent };