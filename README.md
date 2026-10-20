# Asuna Backend

## Research development

Asuna includes an evidence-preserving personal-memory ledger and an offline clarification-policy diagnostic. Start with [research/README.md](research/README.md) for reproducible commands and the protected researcher API, and [research/PROTOCOL.md](research/PROTOCOL.md) for the proposed study, related work, limitations, and remaining validation gates.

```bash
npm ci --ignore-scripts
npm test
npm run research:eval
```

The diagnostic needs no Gemini key and sends no messages. Its 15 synthetic development histories are regression fixtures, not evidence of research superiority. Set `ASUNA_RESEARCH_MODE=true` to disable cron/automatic notifications, isolate data, and enable the token-protected research API. Legacy manual AI endpoints still use Gemini. The existing mobile app continues using the original product APIs.

The central Node.js/Express backend powering the Asuna AI companion ecosystem. It processes browser history from the Chrome extension, generates diary entries, analyzes interests, creates weekly magazines, and maintains a **Second Brain** vector store for semantic memory recall.

## Features

- **History Sync & Storage**: Receives browsing history from the Chrome extension every 3 minutes. Stores up to 2000 items per user with disk persistence.
- **Daily Diary Generation**: Uses Gemini AI to write narrative diary entries from browsing activity, with time-of-day awareness and mood context.
- **Interest Analysis**: Analyzes browsing patterns to identify knowledge domains, rabbit holes, and learning trends.
- **Weekly Magazine**: Auto-generates a "Sunday Magazine" with weekly summary, top interests, sentiment, and AI-generated cover art.
- **Second Brain (Vector Store)**: Extracts key memories from browsing history, embeds them with `gemini-embedding-001`, and stores in a local vector file for cosine similarity search.
- **Proactive Triggers**: Detects when user is deep in debugging or travel planning and notifies the WhatsApp bot to send a helpful message.
- **Cron Jobs**: Automatic nightly memory consolidation, weekly magazine generation, periodic proactive checks.

## Prerequisites

- Node.js v20+
- Google Gemini API Key ([get one free](https://makersuite.google.com/app/apikey))

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Required
GEMINI_API_KEY=your_gemini_api_key_here

# Server port (default: 3848)
PORT=3848

# WhatsApp Bot URL for proactive triggers (default: http://127.0.0.1:3847)
BOT_URL=http://127.0.0.1:3847
```

### 3. Run the Server

```bash
# Production
npm start

# Development (auto-reload)
npm run dev
```

Server starts on `http://0.0.0.0:3848`.

## Data Persistence

All data is stored in `data/store.json` (browsing history, diary, interests, magazines) and `data/vectors.json` (Second Brain embeddings). Data persists across restarts — there is **no TTL expiry**.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check with storage stats |
| POST | `/api/history/sync` | Chrome extension sends browsing history |
| GET | `/api/history` | Get stored browsing history |
| POST | `/api/history/query` | Natural language query over history |
| POST | `/api/history/consolidate` | Extract & embed memories into Second Brain |
| GET | `/api/diary` | Get all diary entries |
| POST | `/api/diary/generate` | Generate diary entry for a specific date |
| PUT | `/api/diary/:id` | Update a diary entry |
| DELETE | `/api/diary/:id` | Delete a diary entry |
| POST | `/api/diary/rewrite` | AI-rewrite a diary entry with custom prompt |
| GET | `/api/interests` | Get current interest analysis |
| POST | `/api/interests/analyze` | Run a new interest analysis |
| GET | `/api/interests/history` | Get past analysis history (30 days) |
| GET | `/api/content/discover` | Get curated content suggestions |
| GET | `/api/magazine` | Get generated weekly magazines |
| POST | `/api/magazine/generate` | Force-generate a magazine now |
| POST | `/api/recall` | Semantic search the Second Brain |
| POST | `/api/recall/extract` | Force-extract memories from history |

## Cron Jobs

| Schedule | Job |
|----------|-----|
| Sunday 8:00 AM | Generate weekly magazine |
| Daily 11:59 PM | Consolidate day's memories into Second Brain |
| Every 3 hours | Check for proactive trigger conditions |

## DigitalOcean Deployment (PM2)

```bash
# On your droplet:
cd ~/asuna-backend
cp .env.example .env     # Edit with your API key
npm install
npm install -g pm2

# Start with PM2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup              # Auto-start on reboot
```

### PM2 Commands

```bash
pm2 logs asuna-backend    # View real-time logs
pm2 restart asuna-backend # Restart
pm2 stop asuna-backend    # Stop
pm2 monit                 # CPU/Memory dashboard
pm2 list                  # List all processes
```

### Updating

```bash
cd ~/asuna-backend
git pull origin main
npm install
pm2 restart asuna-backend
```
