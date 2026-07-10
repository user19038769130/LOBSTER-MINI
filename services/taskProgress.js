const redis = require('redis');
let client = null;

async function getRedisClient() {
  if (!client) {
    client = redis.createClient({ host: '127.0.0.1', port: 6379 });
    await client.connect();
    client.on('error', (err) => console.error('[Redis] 错误:', err));
  }
  return client;
}

async function initTask(taskId, totalSteps) {
  const r = await getRedisClient();
  const key = `task:${taskId}`;
  await r.set(`${key}:total`, totalSteps);
  await r.set(`${key}:current`, 0);
  await r.set(`${key}:status`, 'running');
  await r.expire(key, 3600);
  return taskId;
}

async function updateStep(taskId, stepNumber, stepName, status = 'running', detail = '') {
  const r = await getRedisClient();
  const key = `task:${taskId}`;
  const stepKey = `${key}:step:${stepNumber}`;
  await r.hSet(stepKey, {
    number: stepNumber,
    name: stepName,
    status: status,
    detail: detail || '',
    timestamp: Date.now()
  });
  await r.expire(key, 3600);
  if (status === 'done') {
    await r.incr(`${key}:current`);
  }
  const total = parseInt(await r.get(`${key}:total`) || '0');
  const current = parseInt(await r.get(`${key}:current`) || '0');
  if (current >= total && total > 0) {
    await r.set(`${key}:status`, 'done');
  }
}

async function getTaskStatus(taskId) {
  const r = await getRedisClient();
  const key = `task:${taskId}`;
  const total = parseInt(await r.get(`${key}:total`) || '0');
  const current = parseInt(await r.get(`${key}:current`) || '0');
  const status = await r.get(`${key}:status`) || 'unknown';
  const stepKeys = await r.keys(`${key}:step:*`);
  const steps = [];
  for (const stepKey of stepKeys) {
    const data = await r.hGetAll(stepKey);
    if (data && data.name) {
      steps.push({
        number: parseInt(data.number),
        name: data.name,
        status: data.status || 'pending',
        detail: data.detail || '',
        timestamp: parseInt(data.timestamp)
      });
    }
  }
  steps.sort((a, b) => a.number - b.number);
  return { total, current, status, steps };
}

module.exports = { initTask, updateStep, getTaskStatus };