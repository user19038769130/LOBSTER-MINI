
const Queue = require('bull');
const { skillsMap } = require('../server'); // 需要导出 skillsMap

// 创建队列
const taskQueue = new Queue('lobster-tasks', {
  redis: { host: '127.0.0.1', port: 6379 }
});

// 处理任务
taskQueue.process(async (job) => {
  const { skillName, args } = job.data;
  console.log(`[任务队列] 开始处理 ${skillName}，任务ID: ${job.id}`);
  const skill = skillsMap.get(skillName);
  if (!skill) {
    throw new Error(`技能 ${skillName} 不存在`);
  }
  const result = await skill.handler(args);
  return result;
});

// 监听事件
taskQueue.on('completed', (job, result) => {
  console.log(`[任务队列] 任务 ${job.id} 完成`);
});

taskQueue.on('failed', (job, err) => {
  console.error(`[任务队列] 任务 ${job.id} 失败:`, err.message);
});

module.exports = { taskQueue };