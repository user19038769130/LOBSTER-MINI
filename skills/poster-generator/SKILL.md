---
name: poster_generator
description: 从内置模板生成专业海报，支持电商、科技、极简、美食等 13 种风格
version: 1.0.0
trigger: 用户请求生成海报、制作宣传图、设计广告时
params:
  style:
    type: string
    description: 海报风格 (tech, food, travel, education 等)
  product_name:
    type: string
    description: 产品名称
  slogan:
    type: string
    description: 宣传语
---

## 工作流
1. 根据 style 参数读取 templates/ 下对应的 JSON 模板
2. 将 product_name 和 slogan 填入模板
3. 调用图像生成 API 生成海报
4. 返回图片路径