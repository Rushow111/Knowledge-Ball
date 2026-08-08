import assert from 'node:assert/strict';
import { resolveDomainEventConflicts } from './SyncEngine';
import type { DomainEvent } from '../event/Event';

const event = (id: string, timestamp: number): DomainEvent => ({
  id, timestamp, schemaVersion: 1, type: 'NodeResolved', payload: { nodeId: 'node' },
});
const resolved = resolveDomainEventConflicts([event('b', 2), event('a', 2), event('old', 1), event('a', 2)]);
assert.deepEqual(resolved.map(item => item.id), ['old', 'a', 'b']);
console.log('sync regression passed');
