Lobster.init = function() {
  Lobster.UI.init();
  Lobster.Chat.init();
  Lobster.Agents.init();
  Lobster.Skills.init();
  Lobster.Audit.init();
  Lobster.Behavior.init();
  Lobster.Debate.init();
  Lobster.Model.init();
  Lobster.Channel.init();

  Lobster.Agents.load();
  Lobster.Skills.load();
  Lobster.Audit.load();
  Lobster.Behavior.load();
  Lobster.Channel.load();
};

window.onload = function() {
  Lobster.init();
};