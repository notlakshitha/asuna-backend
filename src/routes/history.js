import { Router } from 'express';
import { addHistory, getHistory } from '../store.js';
import { answerFromHistory, extractAndEmbedMemories, answerFromSecondBrain } from '../ai.js';
import { getVectorCount } from '../vectorStore.js';
import { proactiveEnabled } from '../config.js';

const BOT_URL = process.env.BOT_URL || 'http://127.0.0.1:3847';

export const historyRoutes = Router();

// Helper to detect heavy browsing sessions on a single topic
function detectProactiveTrigger(newItems) {
  if (newItems.length < 5) return null; // Need some volume
  
  // Very basic counting - replace with NLP/LLM topic extraction if desired later
  const keywords = newItems.map(i => i.title?.toLowerCase() || '').join(' ');
  
  // Basic heuristic: are they stuck on a bug or planning a trip?
  if (keywords.match(/stackoverflow|error|typeerror|exception|debug/g)?.length >= 4) {
    return { type: 'debugging', context: newItems.slice(0, 5).map(i => i.title).join(', ') };
  }
  if (keywords.match(/flight|hotel|booking|airbnb|trip|travel/g)?.length >= 4) {
    return { type: 'travel', context: newItems.slice(0, 5).map(i => i.title).join(', ') };
  }
  return null;
}

// Chrome extension sends history here
historyRoutes.post('/history/sync', async (req, res) => {
  const { userId = 'default', items = [] } = req.body;
  const merged = addHistory(userId, items);
  
  // Check for proactive triggers
  const trigger = detectProactiveTrigger(items);
  if (trigger && proactiveEnabled()) {
    console.log(`[Proactive] Trigger detected: ${trigger.type}`);
    try {
      // Assuming whatsapp-bot runs on 3847 locally
      await fetch(`${BOT_URL}/api/proactive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, trigger })
      });
    } catch(e) {
      console.error('[Proactive] Failed to trigger whatsapp bot:', e.message);
    }
  }

  res.json({ ok: true, total: merged.length });
});

historyRoutes.get('/history', (req, res) => {
  const userId = req.query.userId || 'default';
  const history = getHistory(userId);
  res.json({ history });
});

historyRoutes.post('/history/query', async (req, res) => {
  try {
    const { userId = 'default', query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    // Use Second Brain if we have memories, otherwise fallback to recent history
    const vectorCount = getVectorCount(userId);
    let answer;
    
    if (vectorCount > 0) {
       console.log(`[Second Brain] Searching ${vectorCount} embedded memories...`);
       answer = await answerFromSecondBrain(query, userId);
    } else {
       console.log(`[Second Brain] Empty. Falling back to recent history search...`);
       const history = getHistory(userId);
       answer = await answerFromHistory(history, query);
    }

    res.json({ answer, source: vectorCount > 0 ? 'second_brain' : 'recent_history' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Consolidate Memory: Triggers the embedding feature
historyRoutes.post('/history/consolidate', async (req, res) => {
  try {
    const userId = req.body.userId || 'default';
    const history = getHistory(userId);
    
    if (!history || history.length === 0) {
      return res.status(400).json({ error: 'No history to consolidate' });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    console.log(`[Second Brain] Consolidating memories for ${todayStr}...`);
    
    // We only embed the top X latest things since we don't have delta-tracking yet
    // In production, we'd flag items that have already been embedded.
    const addedCount = await extractAndEmbedMemories(history, todayStr, userId);
    
    res.json({ success: true, added: addedCount, totalMemories: getVectorCount(userId) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});
