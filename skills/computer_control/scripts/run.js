cd /home/ubuntu/lobster-mini
cat > skills/computer_control/scripts/run.js << 'EOF'
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs');
const path = require('path');

async function handler(args) {
  console.log('[computer_control] 收到的原始 args:', JSON.stringify(args, null, 2));

  const userMsg = args.userMessage || '';
  const userId = args.userId;

  if (!userId) {
    console.error('[computer_control] userId 缺失');
    return { success: false, error: '缺少 userId 参数' };
  }

  let action = '';
  let target = '';

  // 解析 action
  const openBrowserMatch = userMsg.match(/open_browser\s+(https?:\/\/[^\s]+)/i);
  if (openBrowserMatch) {
    action = 'open_browser';
    target = openBrowserMatch[1];
  }

  if (!action && /snapshot/i.test(userMsg)) {
    action = 'snapshot';
  }

  if (!action && /click/i.test(userMsg)) {
    action = 'click';
  }

  if (!action) {
    const moveMatch = userMsg.match(/move\s+(\d+)\s*,\s*(\d+)/i);
    if (moveMatch) {
      action = 'move';
      target = `${moveMatch[1]},${moveMatch[2]}`;
    }
  }

  if (!action) {
    const typeMatch = userMsg.match(/type\s+(.+)/i);
    if (typeMatch) {
      action = 'type';
      target = typeMatch[1];
    }
  }

  if (!action) {
    const keyMatch = userMsg.match(/key\s+([a-zA-Z0-9_]+)/i);
    if (keyMatch) {
      action = 'key';
      target = keyMatch[1];
    }
  }

  if (!action) {
    return { success: false, error: `无法从消息中解析操作: ${userMsg.substring(0, 50)}...` };
  }

  console.log(`[computer_control] 最终: 用户=${userId}, 操作=${action}, 目标=${target || '无'}`);

  const userDir = path.join('/home/ubuntu/lobster-mini/user_data', userId, 'screenshots');
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  const containerCmd = (cmd) => {
    return `docker exec ai-vnc-sandbox bash -c "export DISPLAY=:99 && ${cmd}"`;
  };

  switch (action) {
    case 'snapshot': {
      const timestamp = Date.now();
      const filename = `screenshot_${timestamp}.png`;
      const localPath = path.join(userDir, filename);

      try {
        await execPromise(containerCmd('xwd -root -display :99 > /tmp/screenshot.xwd 2>/dev/null && convert /tmp/screenshot.xwd /tmp/screenshot.png 2>/dev/null'));
        await execPromise(`docker cp ai-vnc-sandbox:/tmp/screenshot.png ${localPath}`);

        // 读取图片并转为 base64
        const imageData = fs.readFileSync(localPath);
        const base64Image = imageData.toString('base64');
        const dataUrl = `data:image/png;base64,${base64Image}`;

        const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3003';
        const url = `${baseUrl}/user_data/${userId}/screenshots/${filename}`;

        return {
          success: true,
          url: url,
          file_path: localPath,
          image: dataUrl,
          message: '截图已保存'
        };
      } catch (err) {
        return { success: false, error: `截图失败: ${err.message}` };
      }
    }

    case 'open_browser': {
      if (!target) return { success: false, error: '请提供网址' };
      const cmd = `firefox --new-window ${target} 2>/dev/null &`;
      try {
        await execPromise(containerCmd(cmd));
        return { success: true, result: `已打开浏览器并访问：${target}` };
      } catch (err) {
        return { success: false, error: `打开浏览器失败: ${err.message}` };
      }
    }

    case 'move': {
      if (!target) return { success: false, error: '请提供坐标' };
      const coords = target.replace(',', ' ');
      const cmd = `xdotool mousemove ${coords}`;
      try {
        await execPromise(containerCmd(cmd));
        return { success: true, result: `鼠标已移动到: ${target}` };
      } catch (err) {
        return { success: false, error: `移动鼠标失败: ${err.message}` };
      }
    }

    case 'click': {
      await execPromise(containerCmd('xdotool click 1'));
      return { success: true, result: '已点击' };
    }

    case 'type': {
      if (!target) return { success: false, error: '请提供文本' };
      const escapedText = target.replace(/"/g, '\\"');
      const cmd = `echo "${escapedText}" | xdotool type --clearmodifiers --file - 2>/dev/null || xdotool type --clearmodifiers "${escapedText}"`;
      try {
        await execPromise(containerCmd(cmd));
        return { success: true, result: `已输入: ${target}` };
      } catch (err) {
        return { success: false, error: `输入失败: ${err.message}` };
      }
    }

    case 'key': {
      if (!target) return { success: false, error: '请提供按键名' };
      await execPromise(containerCmd(`xdotool key ${target}`));
      return { success: true, result: `已按键: ${target}` };
    }

    case 'open': {
      if (!target) return { success: false, error: '请提供应用名' };
      await execPromise(containerCmd(`${target} &`));
      return { success: true, result: `已打开: ${target}` };
    }

    default:
      return { success: false, error: `未知操作: ${action}` };
  }
}

module.exports = {
  name: 'computer_control',
  description: '控制电脑：截图、移动鼠标、点击、键盘输入、打开应用、打开浏览器访问指定网站等',
  handler,
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['snapshot', 'move', 'click', 'type', 'key', 'open', 'open_browser'], description: '操作类型' },
      target: { type: 'string', description: '目标（坐标、应用名、按键名、网址）' },
      text: { type: 'string', description: '要输入的文本' },
      userId: { type: 'string', description: '用户ID' }
    },
    required: ['action', 'userId']
  }
};
EOF