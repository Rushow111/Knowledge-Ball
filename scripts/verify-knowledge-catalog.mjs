import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const catalog = JSON.parse(await readFile(new URL('../data/catalog/knowledge-starters.en.json', import.meta.url), 'utf8'));
assert.equal(catalog.language, 'en');
assert.equal(catalog.domainCount, 20);
const domains = new Map();
for (const node of catalog.nodes) {
  const nodes = domains.get(node.domain) ?? [];
  nodes.push(node);
  domains.set(node.domain, nodes);
}
assert.equal(domains.size, 20);
for (const [domain, nodes] of domains) {
  assert.ok(nodes.length >= 10 && nodes.length <= 20, `${domain} must contain 10–20 nodes`);
  for (const node of nodes) {
    for (const field of ['definition', 'reasoning', 'conclusion']) {
      assert.equal(typeof node[field], 'string', `${node.id}.${field} must be text`);
      assert.match(node[field], /[A-Za-z]/, `${node.id}.${field} must be English`);
    }
    assert.doesNotMatch(`${node.title}${node.definition}${node.reasoning}${node.conclusion}`, /[\u3400-\u9fff]/, `${node.id} contains CJK text`);
  }
}
console.log(`Knowledge catalog verified: ${domains.size} domains, ${catalog.nodes.length} English nodes.`);
