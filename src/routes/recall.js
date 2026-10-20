import { Router } from 'express';
import { searchMemories, getVectorCount } from '../vectorStore.js';
import { createEmbedding, extractAndEmbedMemories } from '../ai.js';
import { getHistory } from '../store.js';

export const recallRoutes = Router();

/**
 * POST /api/recall
 * Takes a query string, embeds it, searches the Second Brain vector store,
 * and returns the top matching memories.
 * 
 * Used by the WhatsApp bot to inject personal context into conversations.
 * 
 * Body: { query: string, topK?: number }
 * Returns: { memories: [{ text, date, score }], count: number }
 */
recallRoutes.post('/recall', async (req, res) => {
  try {
    const { query, topK = 5, userId = 'default' } = req.body;
    if (typeof query !== 'string' || !query.trim()) return res.status(400).json({ error: 'Query required' });
    if (typeof userId !== 'string' || !userId.trim()) return res.status(400).json({ error: 'userId required' });
    if (!Number.isInteger(topK) || topK < 1 || topK > 100) return res.status(400).json({ error: 'topK must be an integer from 1 to 100' });

    const vectorCount = getVectorCount(userId);
    if (vectorCount === 0) {
      return res.json({ memories: [], count: 0 });
    }

    // Embed the query and search
    const queryVector = await createEmbedding(query);
    const matches = searchMemories(queryVector, topK, userId);

    // Only return memories with a reasonable similarity score (> 0.5)
    const relevant = matches
      .filter(m => m.score > 0.5)
      .map(m => ({
        text: m.text,
        date: m.metadata?.date || 'unknown',
        score: Math.round(m.score * 100) / 100
      }));

    res.json({ memories: relevant, count: vectorCount });
  } catch (e) {
    console.error('Recall endpoint error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/recall/extract
 * Force extracts memories from the user's history immediately
 */
recallRoutes.post('/recall/extract', async (req, res) => {
  try {
    const userId = req.body.userId || 'default';
    const history = getHistory(userId);
    const todayStr = new Date().toISOString().split('T')[0];
    const added = await extractAndEmbedMemories(history, todayStr, userId);
    res.json({ success: true, added });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
