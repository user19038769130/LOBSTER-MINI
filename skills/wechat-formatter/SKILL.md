---
name: wechat_formatter
description: 根据用户提供的文章内容或主题，自动生成符合微信公众号排版规范的 HTML 代码，支持多种风格模板。
trigger: 用户要求排版公众号文章、美化推文、生成公众号代码时
params:
  content:
    type: string
    description: 文章正文内容（或主题）
  title:
    type: string
    description: 文章标题
  style:
    type: string
    enum: [tech, literary, business, cute]
    description: 排版风格，默认为 tech
  author:
    type: string
    description: 作者名称
---

## 工作流
1. 读取用户指定风格的模板 JSON
2. 将标题、正文、作者等信息注入模板
3. 调用大模型生成符合微信规范的 HTML 代码
4. 返回可直接复制粘贴的 HTML 字符串