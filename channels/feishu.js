// channels/feishu.js
const axios = require('axios');

function parseIncoming(body) {
  const event = body?.event;
  return { openId: event?.sender?.sender_id?.open_id, text: event?.message?.content?.text };
}

async function sendMessage(openId, content, config) {
  const tenantToken = await getTenantAccessToken(config);
  await axios.post('https://open.feishu.cn/open-apis/im/v1/messages', {
    receive_id: openId,
    msg_type: 'text',
    content: JSON.stringify({ text: content }),
  }, {
    headers: { Authorization: `Bearer ${tenantToken}` },
    params: { receive_id_type: 'open_id' },
  });
}

async function getTenantAccessToken(config) {
  const res = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    app_id: config.appId,
    app_secret: config.appSecret,
  });
  return res.data.tenant_access_token;
}

module.exports = { parseIncoming, sendMessage };