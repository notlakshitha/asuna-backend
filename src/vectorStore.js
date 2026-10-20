import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { dataDirectory } from './config.js';

function validateVector(vector) {
  if (!Array.isArray(vector) || !vector.length || !vector.every(Number.isFinite)) {
    throw new TypeError('Embedding must be a nonempty array of finite numbers');
  }
}

function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, x, i) => sum + x * b[i], 0);
  const norm = Math.sqrt(a.reduce((sum, x) => sum + x * x, 0) * b.reduce((sum, x) => sum + x * x, 0));
  return norm ? dot / norm : 0;
}

export function createVectorStore({ filePath } = {}) {
  let vectors = [];
  if (filePath && fs.existsSync(filePath)) {
    vectors = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(vectors)) throw new Error('Invalid vector store');
  }
  // Existing untagged vectors belong to the original single-user namespace only.
  const owner = vector => vector.metadata?.userId ?? 'default';
  function save() {
    if (!filePath) return;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(`${filePath}.tmp`, JSON.stringify(vectors));
    fs.renameSync(`${filePath}.tmp`, filePath);
  }
  return {
    addMemory(text, embedding, metadata = {}) {
      validateVector(embedding);
      if (typeof text !== 'string' || !text.trim()) throw new TypeError('Memory text required');
      const userId = metadata.userId ?? 'default';
      if (typeof userId !== 'string' || !userId.trim()) throw new TypeError('userId must be a nonempty string');
      if (vectors.some(v => owner(v) === userId && v.text === text)) return false;
      vectors.push({ id: randomUUID(), text, embedding: [...embedding], metadata: { ...metadata, userId } });
      save();
      return true;
    },
    getVectorCount(userId = 'default') { return vectors.filter(v => owner(v) === userId).length; },
    searchMemories(queryEmbedding, topK = 5, userId = 'default') {
      validateVector(queryEmbedding);
      if (!Number.isInteger(topK) || topK < 1 || topK > 100) throw new TypeError('topK must be an integer from 1 to 100');
      return vectors.filter(v => owner(v) === userId && Array.isArray(v.embedding) && v.embedding.length === queryEmbedding.length && v.embedding.every(Number.isFinite))
        .map(v => ({ id: v.id, text: v.text, metadata: structuredClone(v.metadata), score: cosineSimilarity(queryEmbedding, v.embedding) }))
        .sort((a, b) => b.score - a.score).slice(0, topK);
    },
  };
}

// Lazy initialization keeps pure tests from touching the application's data files.
let defaultStore;
const current = () => defaultStore ??= createVectorStore({ filePath: path.join(dataDirectory(), 'vectors.json') });
export const addMemory = (...args) => current().addMemory(...args);
export const getVectorCount = (...args) => current().getVectorCount(...args);
export const searchMemories = (...args) => current().searchMemories(...args);
