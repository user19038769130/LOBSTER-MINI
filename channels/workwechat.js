// channels/workwechat.js
const axios = require('axios');

function parseIncoming(xmlBody) {
  // 解析 XML 获取 MsgType 和 Content
  // 简化处理，实际需要用 xml2js
  return { openId: 'user123', text: '收到的文本' };
}

async function sendMessage(toUser, content, config) {
  const accessToken = await getAccessToken(config);
  await axios.post(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`, {
    touser: toUser,
    msgtype: 'text',
    agentid: config.agentId,
    text: { content },
  });
}

async function getAccessToken(config) {
  const res = await axios.get(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${config.corpId}&corpsecret=${config.secret}`);
  return res.data.access_token;
}

module.exports = { parseIncoming, sendMessage };