import { rankKnowledgeNodes, type InteractionNodeSummary } from './InteractionController';

function assertIds(actual: InteractionNodeSummary[], expected: string[]): void {
  const ids = actual.map(node => node.id);
  if (JSON.stringify(ids) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(ids)}`);
  }
}

const base = { type: 'fact', status: 'verified', mastery: 'none' } as const;
const nodes: InteractionNodeSummary[] = [
  { ...base, id: 'n-reason', title: '数学史', reasoning: '质数研究的发展' },
  { ...base, id: 'n-title', title: '质数的定义', reasoning: '自然数定义' },
  { ...base, id: 'prime-id', title: '数论', reasoning: '基础知识' },
];

assertIds(rankKnowledgeNodes(nodes, '质数'), ['n-title', 'n-reason']);
assertIds(rankKnowledgeNodes(nodes, '质数 定义'), ['n-title']);
assertIds(rankKnowledgeNodes(nodes, 'PRIME'), ['prime-id']);
assertIds(rankKnowledgeNodes(nodes, '   '), []);

console.log('InteractionController search ranking regression passed.');
