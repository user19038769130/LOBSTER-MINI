const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getGlobalConfig } = require('../../../users/store');

module.exports = {
  name: 'poster_generator',
  description: '根据需求从内置模板生成专业海报。参数: style, product_name, slogan',
  parameters: {
    type: 'object',
    properties: {
      style: { type: 'string', description: '海报风格: tech, food, travel, education, realestate, beauty, fitness, music, pet, holiday, business, ecommerce, minimal' },
      product_name: { type: 'string', description: '产品名称' },
      slogan: { type: 'string', description: '宣传语' }
    },
    required: ['style', 'product_name', 'slogan']
  },
  handler: async (args) => {
    try {
      const cfg = getGlobalConfig();
      const apiKey = cfg.apiKey;
      if (!apiKey) return { success: false, error: 'API Key 未配置' };

      const imageModel = cfg.imageModelName || 'hunyuan-standard';
      const imageApiUrl = cfg.imageApiUrl || 'https://api.hunyuan.cloud.tencent.com/v1/images/generations';

      // 读取模板
      const templatePath = path.join(__dirname, '..', 'templates', `${args.style}.json`);
      if (!fs.existsSync(templatePath)) {
        return { success: false, error: `模板不存在: ${args.style}` };
      }
      const template = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));

      // 构建 prompt
      const prompt = `${template.base_prompt} Product: ${args.product_name}. Slogan: ${args.slogan}. ${template.style_elements || ''}. Layout: ${template.layout || ''}`;

      // 调用 API
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

      const outputDir = '/tmp/ppt-images';
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      const outputFile = path.join(outputDir, `poster-${Date.now()}.jpg`);

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