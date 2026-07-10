const { generatePpt } = require('../../../services/pptGenerator');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');

module.exports = {
  name: 'generate_ppt',
  description: '将幻灯片图片合成为 PPTX 文件。参数: plan (JSON计划), slideImages (图片路径数组)',
  parameters: {
    type: 'object',
    properties: {
      plan: { type: 'string', description: 'JSON 格式的演示文稿计划' },
      slideImages: { type: 'string', description: 'JSON 数组格式的图片路径' }
    },
    required: ['plan', 'slideImages']
  },
  handler: async (args) => {
    try {
      const planObj = JSON.parse(args.plan);
      const images = JSON.parse(args.slideImages);

      const tmpPlan = path.join('/tmp', `ppt-plan-${uuid()}.json`);
      fs.writeFileSync(tmpPlan, JSON.stringify(planObj));

      const outputFile = path.join('/tmp', `ppt-${uuid()}.pptx`);
      const result = await generatePpt(tmpPlan, images, outputFile);

      return { success: true, message: result, file_path: outputFile };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
};