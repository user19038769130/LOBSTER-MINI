---
name: generate_ppt
description: 将幻灯片图片合成 PPTX 文件
version: 1.0.0
trigger: 用户请求生成 PPT 或演示文稿时
params:
  plan:
    type: string
    description: JSON 格式的演示文稿计划
  slideImages:
    type: string
    description: JSON 数组格式的图片路径
---

## 工作流
1. 解析 plan JSON
2. 读取 slideImages 数组
3. 调用 pptGenerator 服务合成 PPTX
4. 返回文件路径