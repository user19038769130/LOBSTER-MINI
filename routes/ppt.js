
const express = require('express');
const router = express.Router();
const { generatePpt } = require('../services/pptGenerator');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');

// 生成 PPT
router.post('/generate', async (req, res) => {
  try {
    const { plan, slideImages } = req.body;
    if (!plan || !slideImages || !Array.isArray(slideImages)) {
      return res.status(400).json({ error: '需要 plan 和 slideImages 数组' });
    }

    // 将 plan 保存为临时 JSON 文件
    const planFile = path.join('/tmp', `ppt-plan-${uuid()}.json`);
    fs.writeFileSync(planFile, JSON.stringify(plan, null, 2));

    // 输出文件路径
    const outputFile = path.join('/tmp', `ppt-${uuid()}.pptx`);

    const msg = await generatePpt(planFile, slideImages, outputFile);
    res.json({ ok: true, message: msg, file: outputFile });
  } catch (err) {
    console.error('PPT 生成失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// 下载生成的 PPT 文件
router.get('/download', (req, res) => {
  const filePath = req.query.file;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send('文件不存在');
  }
  res.download(filePath, path.basename(filePath));
});

module.exports = router;