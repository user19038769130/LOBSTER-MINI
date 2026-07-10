class RunJournal {
  constructor({ runId, threadId, eventStore, trackTokenUsage = true }) {
    this.runId = runId;
    this.threadId = threadId;
    this.eventStore = eventStore;
    this.trackTokenUsage = trackTokenUsage;
    this._stats = {
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_tokens: 0,
      llm_call_count: 0,
      lead_agent_tokens: 0,
      subagent_tokens: 0,
      middleware_tokens: 0,
      message_count: 0,
      last_ai_message: null,
      first_human_message: null,
    };
    this._messages = [];
  }
  onLLMEnd(tokenUsage) {
    if (!this.trackTokenUsage) return;
    this._stats.total_input_tokens += tokenUsage.promptTokens || 0;
    this._stats.total_output_tokens += tokenUsage.completionTokens || 0;
    this._stats.total_tokens += (tokenUsage.promptTokens || 0) + (tokenUsage.completionTokens || 0);
    this._stats.llm_call_count++;
  }
  addMessage(msg) { this._messages.push(msg); }
  async flush() {}
  getCompletionData() {
    const aiMsgs = this._messages.filter(m => m.role === 'assistant');
    const humanMsgs = this._messages.filter(m => m.role === 'user');
    return {
      ...this._stats,
      last_ai_message: aiMsgs.length ? aiMsgs[aiMsgs.length - 1].content : null,
      first_human_message: humanMsgs.length ? humanMsgs[0].content : null,
      message_count: this._messages.length,
    };
  }
}
module.exports = { RunJournal };