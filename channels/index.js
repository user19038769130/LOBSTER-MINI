const workwechat = require('./workwechat');
const feishu = require('./feishu');

const channelConfigs = new Map();

function initChannels(store) {
  channelConfigs.set('workwechat', {
    enabled: false,
    corpId: '',
    agentId: '',
    secret: '',
    token: '',
    encodingAESKey: '',
  });
  channelConfigs.set('feishu', {
    enabled: false,
    appId: '',
    appSecret: '',
    verificationToken: '',
  });
}

function getChannelStatus() {
  return {
    workwechat: { enabled: channelConfigs.get('workwechat')?.enabled || false },
    feishu: { enabled: channelConfigs.get('feishu')?.enabled || false },
    messenger: { enabled: false },
    zalo: { enabled: false },
  };
}

async function handleChannelMessage(channel, rawPayload) {
  console.log(`收到渠道消息: ${channel}`, rawPayload);
}

module.exports = { initChannels, getChannelStatus, handleChannelMessage };