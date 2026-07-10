const RunStatus = Object.freeze({
  pending: "pending",
  running: "running",
  success: "success",
  error: "error",
  timeout: "timeout",
  interrupted: "interrupted",
});
const DisconnectMode = Object.freeze({ cancel: "cancel", continue_: "continue" });
module.exports = { RunStatus, DisconnectMode };