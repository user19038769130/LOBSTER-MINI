// services/skillRetriever.js
// 技能语义检索器。内部维护技能名称、描述、向量。
const { getEmbedding } = require('./embeddingService');

class SkillRetriever {
  constructor(skillsMap, embeddingFn = getEmbedding) {
    // skillsMap: Map<name, { description, handler, ... }>
    this.skillsMap = skillsMap;
    this.skillNames = [];
    this.vectors = [];          // 与 skillNames 一一对应
    this.embeddingsReady = false;
    this.embeddingFn = embeddingFn;
  }

  /**
   * 为所有技能生成向量（应在启动时调用一次）
   */
  async buildIndex() {
    const names = Array.from(this.skillsMap.keys());
    const vectors = [];
    for (const name of names) {
      const skill = this.skillsMap.get(name);
      const textToEmbed = `${skill.name}\n${skill.description}`;
      try {
        const vec = await this.embeddingFn(textToEmbed);
        vectors.push(vec);
      } catch (err) {
        console.warn(`生成技能 [${name}] 向量失败:`, err.message);
        // 用零向量占位，避免索引错位
        vectors.push(new Array(1536).fill(0));
      }
    }
    this.skillNames = names;
    this.vectors = vectors;
    this.embeddingsReady = true;
    console.log(`✅ 已为 ${names.length} 个技能生成向量索引`);
  }

  /**
   * 余弦相似度（处理零向量）
   */
  cosineSimilarity(vecA, vecB) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] ** 2;
      normB += vecB[i] ** 2;
    }
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    if (normA === 0 || normB === 0) return 0;
    return dot / (normA * normB);
  }

  /**
   * 根据用户查询，返回最相关的 Top‑K 技能（完整对象）
   * @param {string} query - 用户当前消息或历史总结
   * @param {number} topK - 返回技能数量（默认3）
   * @returns {Array<{name, description, handler, ...}>}
   */
  async retrieve(query, topK = 3) {
    if (!this.embeddingsReady) {
      throw new Error('向量索引尚未构建');
    }
    if (this.skillNames.length === 0) return [];

    // 生成查询向量
    const queryVec = await this.embeddingFn(query);
    const scores = this.vectors.map((vec, i) => ({
      idx: i,
      score: this.cosineSimilarity(queryVec, vec),
    }));
    scores.sort((a, b) => b.score - a.score);
    const top = scores.slice(0, Math.min(topK, scores.length));
    return top.map(({ idx }) => {
      const name = this.skillNames[idx];
      return this.skillsMap.get(name);
    });
  }
}

module.exports = { SkillRetriever };