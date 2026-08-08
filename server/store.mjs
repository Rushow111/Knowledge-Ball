import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class KnowledgeStore {
  constructor(file) {
    this.file = file;
    this.writeQueue = Promise.resolve();
  }

  async read() {
    try {
      return JSON.parse(await readFile(this.file, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return { namespaces: {} };
      throw error;
    }
  }

  async list(namespace) {
    const data = await this.read();
    return Object.values(data.namespaces[namespace]?.nodes ?? {});
  }

  async save(namespace, node) {
    this.writeQueue = this.writeQueue.then(async () => {
      const data = await this.read();
      const space = data.namespaces[namespace] ??= { nodes: {}, drafts: [] };
      space.nodes[node.id] = node;
      await this.write(data);
    });
    return this.writeQueue;
  }

  async saveDraft(namespace, draft) {
    this.writeQueue = this.writeQueue.then(async () => {
      const data = await this.read();
      const space = data.namespaces[namespace] ??= { nodes: {}, drafts: [] };
      (space.drafts ??= []).push(draft);
      await this.write(data);
    });
    return this.writeQueue;
  }

  async get(namespace, id) {
    const data = await this.read();
    return data.namespaces[namespace]?.nodes?.[id] ?? null;
  }

  async delete(namespace, id) {
    this.writeQueue = this.writeQueue.then(async () => {
      const data = await this.read();
      if (data.namespaces[namespace]?.nodes) delete data.namespaces[namespace].nodes[id];
      await this.write(data);
    });
    return this.writeQueue;
  }

  async pullEvents(group, cursor = 0) {
    const data = await this.read();
    const stream = data.eventGroups?.[group] ?? { cursor: 0, events: [] };
    return { events: stream.events.filter(item => item.cursor > cursor).map(item => item.event), cursor: String(stream.cursor) };
  }

  async pushEvents(group, events) {
    let result;
    this.writeQueue = this.writeQueue.then(async () => {
      const data = await this.read();
      const stream = (data.eventGroups ??= {})[group] ??= { cursor: 0, events: [] };
      const ids = new Set(stream.events.map(item => item.event.id));
      for (const event of events) {
        if (ids.has(event.id)) continue;
        ids.add(event.id);
        stream.events.push({ cursor: ++stream.cursor, event });
      }
      await this.write(data);
      result = { cursor: String(stream.cursor) };
    });
    await this.writeQueue;
    return result;
  }

  async write(data) {
    await mkdir(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(data, null, 2));
    await rename(temporary, this.file);
  }
}
