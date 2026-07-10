// skills/excel-analyzer/scripts/run.js
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { getGlobalConfig } = require('../../../users/store');
const { getUserFilePath } = require('../../../services/userPath');
// 在 handler 中，需要写临时文件时：
const reportPath = getUserFilePath(args.userId || 'anonymous', 'excel-report', '.json');

module.exports = {
  name: 'excel_analyze',
  description: `分析 Excel 文件并返回摘要、统计信息和 AI 洞察。
  输入参数：
    - filePath: Excel 文件的绝对路径（必填）
    - analysisType: 分析类型，可选 "summary" / "stats" / "ai" / "all"（默认 "all"）
    - sheetName: 指定工作表名称（可选，不填则分析全部工作表）
  返回：结构化分析结果，包含数据摘要、统计信息、AI 洞察报告`,

  parameters: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Excel 文件的绝对路径，例如 /tmp/data.xlsx'
      },
      analysisType: {
        type: 'string',
        enum: ['summary', 'stats', 'ai', 'all'],
        description: '分析类型：summary=数据摘要，stats=统计信息，ai=AI深度分析，all=全部'
      },
      sheetName: {
        type: 'string',
        description: '指定要分析的工作表名称，不填则分析全部'
      }
    },
    required: ['filePath']
  },

  handler: async (args) => {
    try {
      const filePath = args.filePath;
      const analysisType = args.analysisType || 'all';
      const targetSheet = args.sheetName || null;

      // ========== 1. 检查文件 ==========
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: `文件不存在: ${filePath}`,
          suggestion: '请确认文件路径正确，或将文件上传到服务器后再试'
        };
      }

      // 检查文件扩展名
      const ext = path.extname(filePath).toLowerCase();
      if (!['.xlsx', '.xls', '.csv'].includes(ext)) {
        return {
          success: false,
          error: `不支持的文件格式: ${ext}`,
          suggestion: '请提供 .xlsx、.xls 或 .csv 格式的文件'
        };
      }

      // ========== 2. 读取 Excel 文件 ==========
      const workbook = XLSX.readFile(filePath);
      const result = {
        fileName: path.basename(filePath),
        fileSize: (fs.statSync(filePath).size / 1024).toFixed(2) + ' KB',
        sheetCount: workbook.SheetNames.length,
        sheetNames: workbook.SheetNames,
        sheets: [],
        totalRows: 0,
        analyzedAt: new Date().toISOString(),
      };

      // 确定要分析的工作表
      const sheetsToAnalyze = targetSheet
        ? workbook.SheetNames.filter(s => s === targetSheet)
        : workbook.SheetNames;

      if (sheetsToAnalyze.length === 0 && targetSheet) {
        return {
          success: false,
          error: `工作表 "${targetSheet}" 不存在`,
          availableSheets: workbook.SheetNames
        };
      }

      // ========== 3. 分析每个工作表 ==========
      for (const sheetName of sheetsToAnalyze) {
        const worksheet = workbook.Sheets[sheetName];

        // 转换为二维数组（限制 5000 行用于分析）
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        const headers = (rawData[0] || []).map(h => String(h));
        const rows = rawData.slice(1, 5001);

        const sheetInfo = {
          name: sheetName,
          headers: headers,
          rowCount: rows.length,
          columnCount: headers.length,
          emptyColumns: 0,
          dataTypes: {},
        };

        // 分析每列的数据类型
        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
          const values = rows.map(r => r[colIdx]).filter(v => v !== '' && v !== null && v !== undefined);
          if (values.length === 0) {
            sheetInfo.emptyColumns++;
            sheetInfo.dataTypes[headers[colIdx] || `列${colIdx + 1}`] = 'empty';
            continue;
          }

          const numberCount = values.filter(v => typeof v === 'number' || (!isNaN(Number(v)) && v !== '')).length;
          const ratio = numberCount / values.length;

          if (ratio > 0.8) {
            sheetInfo.dataTypes[headers[colIdx] || `列${colIdx + 1}`] = 'number';
          } else if (ratio > 0.3) {
            sheetInfo.dataTypes[headers[colIdx] || `列${colIdx + 1}`] = 'mixed';
          } else {
            sheetInfo.dataTypes[headers[colIdx] || `列${colIdx + 1}`] = 'text';
          }
        }

        // 摘要分析
        if (analysisType === 'summary' || analysisType === 'all') {
          sheetInfo.summary = {
            totalRows: sheetInfo.rowCount,
            totalColumns: sheetInfo.columnCount,
            emptyColumns: sheetInfo.emptyColumns,
            dataTypes: sheetInfo.dataTypes,
            sampleData: rows.slice(0, 5),
          };
        }

        // 统计分析
        if (analysisType === 'stats' || analysisType === 'all') {
          const statistics = {};
          for (let colIdx = 0; colIdx < headers.length; colIdx++) {
            const colName = headers[colIdx] || `列${colIdx + 1}`;
            const values = rows
              .map(r => r[colIdx])
              .filter(v => v !== '' && v !== null && v !== undefined)
              .map(v => Number(v))
              .filter(v => !isNaN(v));

            if (values.length > 0) {
              values.sort((a, b) => a - b);
              const sum = values.reduce((a, b) => a + b, 0);
              const avg = sum / values.length;
              const median = values.length % 2 === 0
                ? (values[values.length / 2 - 1] + values[values.length / 2]) / 2
                : values[Math.floor(values.length / 2)];
              const variance = values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length;
              const stdDev = Math.sqrt(variance);

              statistics[colName] = {
                count: values.length,
                sum: Number(sum.toFixed(2)),
                average: Number(avg.toFixed(2)),
                median: Number(median.toFixed(2)),
                min: values[0],
                max: values[values.length - 1],
                range: Number((values[values.length - 1] - values[0]).toFixed(2)),
                standardDeviation: Number(stdDev.toFixed(2)),
              };
            }
          }
          sheetInfo.statistics = statistics;
        }

        result.sheets.push(sheetInfo);
        result.totalRows += sheetInfo.rowCount;
      }

      // ========== 4. AI 深度分析 ==========
      if (analysisType === 'ai' || analysisType === 'all') {
        try {
          const cfg = getGlobalConfig();
          if (!cfg.apiKey) {
            result.aiInsights = '⚠️ 未配置 API Key，无法生成 AI 洞察。请在模型配置页面填写密钥。';
          } else {
            const templatePath = path.join(__dirname, '..', 'templates', 'report_template.md');
            let reportTemplate = '';
            if (fs.existsSync(templatePath)) {
              reportTemplate = fs.readFileSync(templatePath, 'utf-8');
            }

            const dataSummary = JSON.stringify({
              fileName: result.fileName,
              totalSheets: result.sheetCount,
              totalRows: result.totalRows,
              sheets: result.sheets.map(s => ({
                name: s.name,
                headers: s.headers,
                rowCount: s.rowCount,
                columnCount: s.columnCount,
                dataTypes: s.dataTypes,
                sampleData: (s.summary?.sampleData || []).slice(0, 3),
                statistics: s.statistics || {},
              })),
            }, null, 2);

            const prompt = `你是一个专业的数据分析师。请根据以下 Excel 文件的结构化摘要，生成一份中文数据分析报告。

${reportTemplate}

数据摘要：
${dataSummary.slice(0, 4000)}

请严格按照报告模板的格式输出分析结果。`;

            const chatBaseUrl = (cfg.apiUrl || '').replace(/\/chat\/completions$/, '');
            const response = await axios.post(
              `${chatBaseUrl}/chat/completions`,
              {
                model: cfg.modelName || 'hunyuan-standard',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 2000,
              },
              {
                headers: {
                  'Authorization': `Bearer ${cfg.apiKey}`,
                  'Content-Type': 'application/json',
                },
                timeout: 60000,
              }
            );

            result.aiInsights = response.data.choices[0].message.content;
          }
        } catch (aiErr) {
          result.aiInsights = `AI 分析失败: ${aiErr.message}`;
        }
      }

      // ========== 5. 返回结果 ==========
      return {
        success: true,
        result: result,
        summary: `📊 Excel 文件分析完成：
- 文件名: ${result.fileName}
- 大小: ${result.fileSize}
- 工作表数量: ${result.sheetCount} (${result.sheetNames.join(', ')})
- 总数据行数: ${result.totalRows}
${result.aiInsights ? '\n✅ 已生成 AI 深度分析报告' : ''}`,
      };

    } catch (err) {
      return {
        success: false,
        error: `分析失败: ${err.message}`,
        suggestion: '请检查文件是否损坏，或尝试使用其他 Excel 文件'
      };
    }
  }
};