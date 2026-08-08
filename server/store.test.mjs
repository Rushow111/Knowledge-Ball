import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { KnowledgeStore } from './store.mjs';

test('a node saved by one client is visible to another', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'knowledge-ball-'));
  try {
    const file = join(dir, 'knowledge.json');
    const writer = new KnowledgeStore(file);
    const reader = new KnowledgeStore(file);
    const node = { id: 'shared-1', title: '共享节点' };
    await writer.save('public', node);
    assert.deepEqual(await reader.list('public'), [node]);
    assert.deepEqual(await reader.get('public', node.id), node);
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).namespaces.public.nodes[node.id], node);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('group event streams deduplicate events and advance a cursor', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'knowledge-ball-sync-'));
  try {
    const store = new KnowledgeStore(join(dir, 'knowledge.json'));
    const first = { id: 'event-1', timestamp: 1 };
    assert.deepEqual(await store.pushEvents('team-a', [first, first]), { cursor: '1' });
    assert.deepEqual(await store.pullEvents('team-a', 0), { events: [first], cursor: '1' });
    assert.deepEqual(await store.pullEvents('team-b', 0), { events: [], cursor: '0' });
    assert.deepEqual(await store.pullEvents('team-a', 1), { events: [], cursor: '1' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
