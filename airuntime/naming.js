function resolve_root_run_name(config, assistant_id) {
  for (const containerName of ['context', 'configurable']) {
    const container = config[containerName];
    if (container && typeof container === 'object') {
      const agentName = container.agent_name;
      if (typeof agentName === 'string' && agentName.trim()) {
        return agentName;
      }
    }
  }
  return assistant_id || 'lead_agent';
}

module.exports = { resolve_root_run_name };