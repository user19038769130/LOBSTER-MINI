class RunStore {
  async put(run_id, params) { throw new Error("Not implemented"); }
  async get(run_id, params) { throw new Error("Not implemented"); }
  async list_by_thread(thread_id, params) { throw new Error("Not implemented"); }
  async update_status(run_id, status, params) { throw new Error("Not implemented"); }
  async delete(run_id) { throw new Error("Not implemented"); }
  async update_model_name(run_id, model_name) { throw new Error("Not implemented"); }
  async update_run_completion(run_id, params) { throw new Error("Not implemented"); }
  async list_pending(params) { throw new Error("Not implemented"); }
  async aggregate_tokens_by_thread(thread_id) { throw new Error("Not implemented"); }
}

module.exports = { RunStore };