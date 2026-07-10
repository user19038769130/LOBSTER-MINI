const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getGlobalConfig } = require('../../../users/store');

module.exports = {
  name: 'wechat_formatter',
  description: `生成公众号排版 HTML。支持自定义图片路径、AI生成图片或手动占位符。
  参数:
    - title: 文章标题
    - content: 文章正文
    - image_paths: 已有图片路径的 JSON 数组，如 ["/tmp/cover.jpg","/tmp/img1.jpg"]
    - generate_images: 是否用 AI 生成图片（默认 false，不花钱）
    - image_style: AI 生成图片的风格
    - image_count: AI 生成图片数量`,
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '文章标题' },
      content: { type: 'string', description: '文章正文' },
      image_paths: { type: 'string', description: 'JSON 数组格式的已有图片路径，如 [\"/tmp/a.jpg\"]' },
      generate_images: { type: 'boolean', description: '是否用 AI 生成图片（默认 false）' },
      image_style: { type: 'string', description: 'AI 图片风格' },
      image_count: { type: 'number', description: 'AI 生成图片数量' },
    },
    required: ['title', 'content']
  },
  handler: async (args) => {
    try {
      const cfg = getGlobalConfig();
      if (!cfg.apiKey) return { success: false, error: '模型 API Key 未配置' };

      const chatModel = cfg.modelName || 'hunyuan-standard';
      const chatBaseUrl = (cfg.apiUrl || '').replace(/\/chat\/completions$/, '');

      let imageHTML = '';
      let imageSource = '占位符模式（手动替换图片）';

      // ========== 优先级1：用户指定了已有图片路径 ==========
      let imagePaths = [];
      if (args.image_paths) {
        try {
          imagePaths = JSON.parse(args.image_paths);
        } catch {
          // 兼容逗号分隔的字符串
          imagePaths = args.image_paths.split(',').map(p => p.trim()).filter(p => p);
        }

        const validPaths = imagePaths.filter(p => fs.existsSync(p));
        if (validPaths.length > 0) {
          imageSource = `使用 ${validPaths.length} 张已有图片`;
          validPaths.forEach((imgPath, idx) => {
            const imgBuffer = fs.readFileSync(imgPath);
            const base64 = imgBuffer.toString('base64');
            const isCover = idx === 0;
            imageHTML += isCover
              ? `< img src="data:image/jpeg;base64,${base64}" style="width:100%;border-radius:12px;margin-bottom:20px;" alt="封面图" />`
              : `< img src="data:image/jpeg;base64,${base64}" style="width:100%;border-radius:8px;margin:15px 0;" alt="插图${idx}" />`;
          });
        }
      }

      // ========== 优先级2：用户要求 AI 生成（需明确开启，且模型支持） ==========
      if (!imageHTML && args.generate_images === true) {
        try {
          const imageSkill = require('../image-generation/scripts/run.js');
          const style = args.image_style || '写实';
          const count = Math.min(args.image_count || 1, 3);

          for (let i = 0; i < count; i++) {
            const prompt = i === 0
              ? `公众号封面图，风格：${style}，标题：${args.title}，吸引眼球`
              : `公众号插图，风格：${style}，与内容相关：${args.content.substring(0, 80)}`;
            const imgResult = await imageSkill.handler({
              prompt,
              style: style.includes('写实') ? 'realistic' : 'anime',
              aspect_ratio: i === 0 ? '16:9' : '4:3',
            });
            if (imgResult.success && imgResult.file_path) {
              const imgBuffer = fs.readFileSync(imgResult.file_path);
              const base64 = imgBuffer.toString('base64');
              imageHTML += i === 0
                ? `< img src="data:image/jpeg;base64,${base64}" style="width:100%;border-radius:12px;margin-bottom:20px;" alt="AI生成封面" />`
                : `< img src="data:image/jpeg;base64,${base64}" style="width:100%;border-radius:8px;margin:15px 0;" alt="AI生成插图${i}" />`;
            }
          }
          if (imageHTML) imageSource = 'AI 生成图片';
        } catch (imgErr) {
          console.warn('AI 图片生成失败:', imgErr.message);
        }
      }

      // ========== 优先级3：都没有，使用占位符 ==========
      if (!imageHTML) {
        imageHTML = `<div style="background:#e2e8f0;border-radius:12px;height:200px;display:flex;align-items:center;justify-content:center;color:#94a3b8;margin-bottom:20px;font-size:14px;">📷 封面图片占位（可手动替换）</div>`;
        imageSource = '占位符模式（复制到编辑器后手动替换图片）';
      }

      // ========== 构建排版 prompt ==========
      const prompt = `你是微信公众号排版设计师。请生成可直接使用的 HTML 代码。
要求：
- 内联样式，适配手机屏幕。
- 标题 h1 居中，24px，颜色 #333，底部有渐变色装饰线。
- 正文 15px，行高 1.8，颜色 #444，段落间距 20px。
- 页面背景 #fafafa，内容区白色卡片，圆角 12px，最大宽度 600px，居中。
- 底部“关注我们”引导语，样式精致。
- 已经提供了图片 HTML，直接使用，不要修改：${imageHTML}
标题：${args.title}
正文：${args.content}
只输出 HTML 代码，不要任何解释。`;

      const response = await axios.post(
        `${chatBaseUrl}/chat/completions`,
        {
          model: chatModel,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 3000,
        },
        { headers: { 'Authorization': `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' }, timeout: 30000 }
      );

      let html = response.data.choices[0].message.content;
      html = html.replace(/```html|```/g, '').trim();

      return {
        success: true,
        html,
        image_source: imageSource,
        message: `排版完成（图片来源：${imageSource}），复制 HTML 即可使用`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
};