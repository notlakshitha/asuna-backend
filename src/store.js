import NodeCache from 'node-cache';
import fs from 'fs';
import path from 'path';
import { dataDirectory } from './config.js';

// File persistence
const DATA_DIR = dataDirectory();
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const STORE_FILE = path.join(DATA_DIR, 'store.json');

export const store = new NodeCache({ stdTTL: 0 }); // No auto-expiry — data is persisted to disk

// Load from file on start
try {
  if (fs.existsSync(STORE_FILE)) {
    const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    Object.keys(data).forEach(key => store.set(key, data[key]));
    console.log('Loaded store from file');
  }
} catch (e) {
  console.error('Failed to load store:', e);
}

function saveStore() {
  try {
    const keys = store.keys();
    const data = {};
    keys.forEach(key => data[key] = store.get(key));
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to save store:', e);
  }
}

// Save periodically
setInterval(saveStore, 60 * 1000).unref(); // Every minute; don't hold test/CLI processes open

export function getHistory(userId) {
  return store.get(`history:${userId}`) || [];
}

export function addHistory(userId, items) {
  const existing = getHistory(userId);
  const seen = new Set(existing.map(i => (i.url || '') + '_' + (i.lastVisitTime || i.timestamp || '')));
  const newItems = items.filter(i => !seen.has((i.url || '') + '_' + (i.lastVisitTime || i.timestamp || '')));
  const merged = [...existing, ...newItems]
    .sort((a, b) => (b.lastVisitTime || b.timestamp || 0) - (a.lastVisitTime || a.timestamp || 0))
    .slice(0, 2000);
  store.set(`history:${userId}`, merged);
  saveStore(); // Save immediately on sync
  return merged;
}

export function setHistory(userId, items) {
  store.set(`history:${userId}`, items);
  saveStore();
}

export function getDiary(userId) {
  return store.get(`diary:${userId}`) || { entries: [] };
}

export function setDiary(userId, diary) {
  store.set(`diary:${userId}`, diary);
  saveStore();
}

export function addDiaryEntries(userId, newEntries) {
  const current = getDiary(userId);
  const existingEntries = current.entries || [];

  // Create a map of existing entries by date for easy lookup/update
  const entryMap = new Map(existingEntries.map(e => [e.date, e]));

  // Merge new entries
  newEntries.forEach(entry => {
    // If entry for date exists, we might want to append or replace. 
    // For now, let's append content if it exists, or just replace/add.
    // The requirement is to "make a long detailed diary entry". 
    // If we are regenerating for a day, we probably want to *replace* that day's entry or *append* to it.
    // Let's go with replacement/update strategy: if it exists, replace it with the new generation (which should be comprehensive).
    // Or, if the user manually edited it, maybe we shouldn't overwrite?
    // User said "it regenerates all the previous entries aswell fix it".
    // So we should ONLY touch the dates we are generating for.
    entryMap.set(entry.date, entry);
  });

  const mergedEntries = Array.from(entryMap.values()).sort((a, b) => new Date(b.date) - new Date(a.date));

  const newDiary = { ...current, entries: mergedEntries };
  setDiary(userId, newDiary);
  return newDiary;
}

// Update specific diary entry by index or date
export function updateDiaryEntry(userId, id, newContent) {
  const diary = getDiary(userId);
  const index = parseInt(id);
  if (index >= 0 && index < diary.entries.length) {
    diary.entries[index].content = newContent;
    diary.entries[index].updatedAt = Date.now();
    setDiary(userId, diary);
    return diary.entries[index];
  }
  return null;
}

// Delete diary entry
export function deleteDiaryEntry(userId, id) {
  const diary = getDiary(userId);
  const index = parseInt(id);
  if (index >= 0 && index < diary.entries.length) {
    diary.entries.splice(index, 1);
    setDiary(userId, diary);
    return true;
  }
  return false;
}

export function getInterests(userId) {
  return store.get(`interests:${userId}`) || { interests: [], suggestions: [] };
}

export function setInterests(userId, data) {
  store.set(`interests:${userId}`, data);
  saveStore();
}

// Analysis history (one per day)
export function getInterestsHistory(userId) {
  return store.get(`interests_history:${userId}`) || [];
}

export function addInterestsHistory(userId, analysis) {
  const history = getInterestsHistory(userId);
  const date = analysis.date || new Date().toISOString().split('T')[0];

  // Remove existing entry for same day (keep one per day)
  const filtered = history.filter(h => h.date !== date);
  filtered.unshift(analysis);

  // Keep last 30 days
  const trimmed = filtered.slice(0, 30);
  store.set(`interests_history:${userId}`, trimmed);
  saveStore();
  return trimmed;
}

export function getMagazines(userId) {
  return store.get(`magazines:${userId}`) || [];
}

export function addMagazine(userId, magazine) {
  const mags = getMagazines(userId);
  // Keep the latest 52 magazines (about a year)
  const filtered = mags.filter(m => m.weekStartDate !== magazine.weekStartDate);
  filtered.unshift(magazine);
  const trimmed = filtered.slice(0, 52);
  store.set(`magazines:${userId}`, trimmed);
  saveStore();
  return trimmed;
}
