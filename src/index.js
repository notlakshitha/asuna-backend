import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import { diaryRoutes } from './routes/diary.js';
import { interestsRoutes } from './routes/interests.js';
import { contentRoutes } from './routes/content.js';
import { historyRoutes } from './routes/history.js';
import { magazineRoutes } from './routes/magazine.js';
import { recallRoutes } from './routes/recall.js';
import { setupCronJobs } from './cron.js';
import { store } from './store.js';
import path from 'node:path';
import { researchMode, dataDirectory } from './config.js';
import { MemoryLedger } from './research/memory.js';
import { createResearchRouter } from './research/routes.js';

// Setup periodic tasks
if (!researchMode()) setupCronJobs();

const app = express();
const port = process.env.PORT || 3848;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health - Detailed check for persistence verification
app.get('/api/health', (req, res) => {
  const keys = store.keys();
  const historyKeys = keys.filter(k => k.startsWith('history:')).length;
  const interestsKeys = keys.filter(k => k.startsWith('interests:')).length;
  res.json({
    ok: true,
    service: 'asuna-backend',
    timestamp: new Date().toISOString(),
    storage: {
      totalKeys: keys.length,
      usersWithHistory: historyKeys,
      usersWithInterests: interestsKeys,
      storeFile: 'data/store.json'
    }
  });
});

// Mount routes
app.use('/api', diaryRoutes);
app.use('/api', interestsRoutes);
app.use('/api', contentRoutes);
app.use('/api', historyRoutes);
app.use('/api', magazineRoutes);
app.use('/api', recallRoutes);

if (researchMode()) {
  const ledger = new MemoryLedger({ filePath: path.join(dataDirectory(), 'research-ledger.json') });
  app.use('/api/research', createResearchRouter({ ledger, token: process.env.RESEARCH_API_TOKEN }));
}

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  console.error('Request failed:', error.message);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Asuna Backend running on http://0.0.0.0:${server.address().port}`);
});
