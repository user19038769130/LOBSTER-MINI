---
name: image_generate
description: 使用 AI 生成高质量图片，支持多种风格模板
version: 1.0.0
trigger: 用户请求生成图片、创作图像、想象画面时
params:
  prompt:
    type: string
    description: 图片描述文本（建议英文）
  style:
    type: string
    description: 模板风格，如 realistic, cartoon, anime
  aspect_ratio:
    type: string
    description: 宽高比，默认 1:1
---

## 工作流
1. 根据 style 参数读取 templates/ 下对应的 JSON 模板
2. 将用户 prompt 与模板内容组合
3. 调用当前配置的图像生成 API
4. 保存图片到 /tmp/ppt-images/
5. 返回图片路径