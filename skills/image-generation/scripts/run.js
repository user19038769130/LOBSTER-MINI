const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getGlobalConfig } = require('../../../users/store');

module.exports = {
  name: 'image_generate',
  description: '使用 AI 生成高质量图片，支持多种风格模板。参数: prompt, style, aspect_ratio',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '图片描述文本' },
      style: { type: 'string', description: '模板风格名称' },
      aspect_ratio: { type: 'string', description: '宽高比: 1:1, 16:9, 4:3, 9:16' }
    },
    required: ['prompt']
  },
  handler: async (args) => {
    try {
      const cfg = getGlobalConfig();
      const apiKey = cfg.apiKey;
      if (!apiKey) return { success: false, error: 'API Key 未配置' };

      const imageModel = cfg.imageModelName || 'hunyuan-standard';
      const imageApiUrl = cfg.imageApiUrl || 'https://api.hunxxxxxxxxxxxxxxxxxxxxxxs';

      // 构建 prompt
      let prompt = args.prompt;
      if (args.style) {
        const templatePath = path.join(__dirname, '..', 'templates', `${args.style}.json`);
        if (fs.existsSync(templatePath)) {
          const template = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
          prompt = `${template.base_prompt} ${prompt}`;
          if (template.style_elements) prompt += ` ${template.style_elements}`;
          if (template.layout) prompt += ` Layout: ${template.layout}`;
        }
      }

      // 调用图像生成 API
      let response;
      if (imageApiUrl.includes('hunyuan')) {
        response = await axios.post(imageApiUrl, {
          model: imageModel, prompt, n: 1, size: '1024x1024'
        }, { headers: { 'Authorization': `Bearer ${apiKey}` }, timeout: 120000 });
      } else if (imageApiUrl.includes('dashscope')) {
        response = await axios.post(imageApiUrl, {
          model: imageModel, input: { prompt }, parameters: { size: '1024*1024' }
        }, { headers: { 'Authorization': `Bearer ${apiKey}` }, timeout: 120000 });
      } else {
        response = await axios.post(imageApiUrl, {
          model: imageModel, prompt, n: 1, size: '1024x1024'
        }, { headers: { 'Authorization': `Bearer ${apiKey}` }, timeout: 120000 });
      }

      // 保存图片
      const outputDir = '/tmp/ppt-images';
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      const outputFile = path.join(outputDir, `img-${Date.now()}.jpg`);

      const data = response.data.data?.[0] || response.data.output?.results?.[0];
      if (data.url) {
        const imgResp = await axios.get(data.url, { responseType: 'arraybuffer' });
        fs.writeFileSync(outputFile, imgResp.data);
      } else if (data.b64_json) {
        fs.writeFileSync(outputFile, Buffer.from(data.b64_json, 'base64'));
      }

      return { success: true, file_path: outputFile };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
};