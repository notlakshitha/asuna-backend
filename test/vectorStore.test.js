import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVectorStore } from '../src/vectorStore.js';

test('vector recall, counts and duplicate detection are scoped to each user', () => {
  const store = createVectorStore();
  assert.equal(store.addMemory('same text', [1, 0], { userId: 'alice' }), true);
  assert.equal(store.addMemory('same text', [0, 1], { userId: 'bob' }), true);
  assert.equal(store.addMemory('same text', [1, 0], { userId: 'alice' }), false);
  assert.equal(store.getVectorCount('alice'), 1);
  assert.equal(store.getVectorCount('bob'), 1);
  assert.equal(store.getVectorCount(), 0);
  assert.deepEqual(store.searchMemories([1, 0], 5, 'charlie'), []);
  assert.equal(store.searchMemories([1, 0], 5, 'alice')[0].score, 1);
  assert.equal(store.searchMemories([1, 0], 5, 'bob')[0].score, 0);
});

test('incompatible dimensions are skipped; invalid embeddings and limits are rejected', () => {
  const store = createVectorStore();
  store.addMemory('old model', [1, 0, 1]);
  store.addMemory('current model', [1, 0]);
  store.addMemory('zero vector', [0, 0]);
  const matches = store.searchMemories([1, 0]);
  assert.deepEqual(matches.map(row => row.text), ['current model', 'zero vector']);
  assert.throws(() => store.addMemory('invalid', [NaN]));
  assert.throws(() => store.searchMemories([]));
  assert.throws(() => store.searchMemories([1, 0], -1));
  assert.throws(() => store.searchMemories([1, 0], 1.5));
});

test('legacy untagged vectors are available only in the default namespace', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asuna-vectors-'));
  try {
    const filePath = path.join(dir, 'vectors.json');
    fs.writeFileSync(filePath, JSON.stringify([{ id: 'legacy', text: 'old memory', embedding: [1, 0], metadata: {} }]));
    const store = createVectorStore({ filePath });
    assert.equal(store.getVectorCount(), 1);
    assert.equal(store.getVectorCount('alice'), 0);
    store.addMemory('new', [1, 0], { userId: 'alice' });
    const restored = createVectorStore({ filePath });
    assert.equal(restored.searchMemories([1, 0], 5, 'alice')[0].text, 'new');
    assert.equal(restored.getVectorCount(), 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
