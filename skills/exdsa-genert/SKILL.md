---
name: excel_analyze
description: 读取 Excel 文件，提取数据、统计信息，并调用 AI 生成深度分析报告
version: 1.0.0
trigger: 用户请求分析 Excel 文件、查看表格数据、生成数据报告时
params:
  filePath:
    type: string
    description: Excel 文件的绝对路径，例如 /tmp/data.xlsx
  analysisType:
    type: string
    enum: [summary, stats, ai, all]
    description: 分析类型，summary=数据摘要，stats=统计信息，ai=AI深度分析，all=全部
  sheetName:
    type: string
    description: 指定要分析的工作表名称，不填则分析全部
---

## 工作流
1. 检查文件是否存在
2. 使用 xlsx 库读取 Excel 文件
3. 根据 analysisType 执行不同分析：
   - summary: 提取表头、行数、列数、示例数据
   - stats: 对数值列计算总和、平均值、最大值、最小值
   - ai: 将数据摘要发送给大模型，生成深度洞察报告
   - all: 依次执行以上所有分析
4. 返回结构化分析结果