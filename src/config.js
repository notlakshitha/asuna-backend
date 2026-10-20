import path from 'node:path';

export function researchMode() {
  return process.env.ASUNA_RESEARCH_MODE === 'true';
}

export function dataDirectory() {
  return path.resolve(process.env.ASUNA_DATA_DIR || (researchMode() ? 'data/research' : 'data'));
}

// Read on use, after dotenv initialization. Both automatic notification paths use this gate.
export function proactiveEnabled() {
  return !researchMode() && process.env.ASUNA_PROACTIVE_ENABLED !== 'false';
}
