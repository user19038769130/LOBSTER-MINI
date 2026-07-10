const { DynamicTool } = require('@langchain/core/tools');
function convertSkillsToTools(skillObjects, store, userId) {
  return skillObjects.map(skill => new DynamicTool({
    name: skill.name,
    description: skill.description || '',
    func: async (input) => {
      const start = Date.now();
      let args, success = true, result = '';
      try {
        args = JSON.parse(input);
        // 【新增这一行】
        args.userId = userId; // 所有技能都能拿到当前用户 ID
        result = await skill.handler(args);
        return typeof result === 'string' ? result : JSON.stringify(result);
      } catch (err) {
        success = false;
        result = err.message;
        return 'Error: ' + err.message;
      } finally {
        if (store) store.addAuditLog(userId, { skillName: skill.name, args: args || {}, success, result: result.substring(0, 500), durationMs: Date.now() - start });
      }
    }
  }));
}
module.exports = { convertSkillsToTools };