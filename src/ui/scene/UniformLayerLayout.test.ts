import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import * as THREE from 'three';
import type { KnowledgeLayer } from '../../domain/KnowledgeLayerPolicy';
import type { KnowledgeLineageMeta } from '../../domain/KnowledgeLineage';
import {
  applyUniformLayerLayout,
  layoutBandForLayer,
  uniformLayerSlots,
  type UniformLayoutNode,
} from './UniformLayerLayout';
import {
  RADIAL_CHAIN_LAYOUT_RADIUS,
  RADIAL_CHAIN_LINK_LENGTH,
  RADIAL_CHAIN_PLANE_MIN_SPACING,
  radialTangentBasis,
  spreadOnRadialCap,
} from './RadialChainLayout';

type NonCoreLayer = Exclude<KnowledgeLayer, 'core'>;

function fixture(layer: NonCoreLayer, count: number, hiddenIndex = -1): UniformLayoutNode[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${layer}-${index}`,
    effectiveLayer: layer,
    hidden: index === hiddenIndex,
  }));
}

function xyz(node: UniformLayoutNode): [number, number, number] {
  assert(node.pos, `node ${node.id} is missing a layout position`);
  return [node.pos.x, node.pos.y, node.pos.z];
}

function nearestNeighbourCv(layer: NonCoreLayer, count: number): number {
  const points = uniformLayerSlots(layer, count);
  const nearest = points.map((point, index) => {
    let min = Number.POSITIVE_INFINITY;
    points.forEach((other, otherIndex) => {
      if (index === otherIndex) return;
      min = Math.min(min, point.distanceTo(other));
    });
    return min;
  });
  const mean = nearest.reduce((sum, value) => sum + value, 0) / nearest.length;
  const variance = nearest.reduce((sum, value) => sum + (value - mean) ** 2, 0) / nearest.length;
  return Math.sqrt(variance) / mean;
}

for (const [layer, count] of [['inner', 7], ['middle', 14], ['outer', 37]] as const) {
  const first = fixture(layer, count);
  const second = fixture(layer, count);
  applyUniformLayerLayout(first);
  applyUniformLayerLayout(second);

  assert.deepEqual(first.map(xyz), second.map(xyz), `${layer} layout must be deterministic`);

  const { rMin, rMax } = layoutBandForLayer(layer);
  const radii = first.map(node => node.pos!.length()).sort((a, b) => a - b);
  radii.forEach((radius, index) => {
    assert(radius >= rMin - 1e-9 && radius <= rMax + 1e-9, `${layer} node left its hard shell`);
    const actualQuantile = (radius ** 3 - rMin ** 3) / (rMax ** 3 - rMin ** 3);
    const expectedQuantile = (index + 0.5) / count;
    assert(Math.abs(actualQuantile - expectedQuantile) < 1e-9, `${layer} radial volume strata are not uniform`);
  });

  const positiveZ = first.filter(node => node.pos!.z > 0).length;
  const negativeZ = first.filter(node => node.pos!.z < 0).length;
  assert(positiveZ > 0 && negativeZ > 0, `${layer} layout must use both hemispheres`);
  assert(nearestNeighbourCv(layer, count) < 0.16, `${layer} nearest-neighbour spacing is too uneven`);
}

const visibleHistory = fixture('outer', 9, -1);
const hiddenHistory = fixture('outer', 9, 4);
applyUniformLayerLayout(visibleHistory);
applyUniformLayerLayout(hiddenHistory);
assert.deepEqual(
  visibleHistory.map(xyz),
  hiddenHistory.map(xyz),
  'hidden history must keep occupying its original uniform slot',
);
assert(hiddenHistory[4].pos, 'hidden node must receive a real position even though it is not rendered');

const cores: UniformLayoutNode[] = ['n1', 'n2', 'n16'].map(id => ({ id, effectiveLayer: 'core' }));
applyUniformLayerLayout(cores);
assert(cores.every(node => node.pos && Number.isFinite(node.pos.length())), 'core nodes must remain finite');

const sceneSource = readFileSync('src/ui/scene/KnowledgeScene.ts', 'utf8');
const physicsMatch = /const\s+physics\s*=/.exec(sceneSource);
const labelsMatch = /const\s+labels\s*=/.exec(sceneSource);
assert(physicsMatch && labelsMatch && labelsMatch.index > physicsMatch.index, 'scene physics implementation must remain discoverable');
const physicsSource = sceneSource.slice(physicsMatch.index, labelsMatch.index);
assert(/n\.pos!\.copy\(n\.homePos!\)/.test(physicsSource), 'ordinary nodes must return to their fixed uniform slot');
assert(!physicsSource.includes('neighborCount'), 'uniform layout must not be deformed by neighbour repulsion');
assert(!physicsSource.includes('n.premises'), 'uniform layout must not yet optimize relation-line length');
assert(!physicsSource.includes('twinGroup'), 'uniform layout must not yet optimize twin-line length');

const appSource = readFileSync('src/ui/app.ts', 'utf8');
assert(appSource.includes('layoutNodes = domainNodes.map'), 'layout must be built from every projected node before visibility filtering');
assert(appSource.includes('applyUniformLayerLayout(layoutNodes)'), 'all projected nodes must participate in one global uniform-layout pass');
assert(appSource.includes('renderNodes = layoutNodes.filter'), 'scene membership must be applied only after occupancy positions are assigned');
assert(appSource.includes('nodeBelongsInLineageScene(node)'), 'formal gray/red lineage balls must remain in scene data while rejected audit-only and legacy hidden records stay excluded');

// Phase-1 radial chain contract: L is exactly 5r and x defaults to one diameter.
assert.equal(RADIAL_CHAIN_LINK_LENGTH, RADIAL_CHAIN_LAYOUT_RADIUS * 5, 'single-chain link length must be L=5r');
assert.equal(RADIAL_CHAIN_PLANE_MIN_SPACING, RADIAL_CHAIN_LAYOUT_RADIUS * 2, 'single-chain plane spacing must default to x=2r');

// The cap formula must preserve fixed link length while spreading neighbours on
// one plane perpendicular to the radial chain direction.
const capCenter = new THREE.Vector3(80, 0, 0);
const capPoints = spreadOnRadialCap(capCenter, new THREE.Vector3(1, 0, 0), 4, true);
for (const point of capPoints) {
  assert(Math.abs(point.distanceTo(capCenter) - RADIAL_CHAIN_LINK_LENGTH) < 1e-9, 'cap neighbour must stay exactly L from its reasoning center');
}
for (let index = 0; index < capPoints.length; index++) {
  const next = capPoints[(index + 1) % capPoints.length];
  assert(capPoints[index].distanceTo(next) >= RADIAL_CHAIN_PLANE_MIN_SPACING - 1e-9, 'cap neighbours must keep at least x spacing when feasible');
}
const basis = radialTangentBasis(new THREE.Vector3(1, 0, 0));
const axialValues = capPoints.map(point => point.clone().sub(capCenter).dot(basis.radial));
assert(axialValues.every(value => Math.abs(value - axialValues[0]) < 1e-9), 'spread neighbours must share one plane perpendicular to the radial axis');

type ChainFixtureNode = UniformLayoutNode & {
  type: string;
  premises: string[];
  lineage?: KnowledgeLineageMeta;
};
const chainNodes: ChainFixtureNode[] = [
  { id: 'p1', type: 'fact', premises: [], effectiveLayer: 'inner' },
  { id: 'p2', type: 'definition', premises: [], effectiveLayer: 'inner' },
  { id: 'r1', type: 'reasoning', premises: ['p1', 'p2'], effectiveLayer: 'middle' },
  { id: 'c1', type: 'theorem', premises: ['r1'], effectiveLayer: 'middle' },
  { id: 'r2', type: 'reasoning', premises: ['c1'], effectiveLayer: 'middle' },
  { id: 'c2', type: 'theorem', premises: ['r2'], effectiveLayer: 'outer' },
];
applyUniformLayerLayout(chainNodes);
const chainById = new Map(chainNodes.map(node => [node.id, node] as const));
const distance = (left: string, right: string) => chainById.get(left)!.pos!.distanceTo(chainById.get(right)!.pos!);
for (const [left, right] of [['p1', 'r1'], ['p2', 'r1'], ['r1', 'c1'], ['c1', 'r2'], ['r2', 'c2']] as const) {
  assert(Math.abs(distance(left, right) - RADIAL_CHAIN_LINK_LENGTH) < 1e-8, `${left}->${right} must keep fixed L`);
}
assert(chainById.get('p1')!.pos!.distanceTo(chainById.get('p2')!.pos!) >= RADIAL_CHAIN_PLANE_MIN_SPACING - 1e-8, 'multiple premises must spread by at least x');
assert(chainById.get('p1')!.pos!.length() < chainById.get('r1')!.pos!.length(), 'premises must be pulled toward the ball center');
assert(chainById.get('c1')!.pos!.length() > chainById.get('r1')!.pos!.length(), 'conclusions must be pushed outward');
assert(chainById.get('c2')!.pos!.length() > chainById.get('r2')!.pos!.length(), 'downstream conclusion must continue outward');

const lineageNodes: ChainFixtureNode[] = [
  {
    id: 'r-main', type: 'reasoning', premises: [], effectiveLayer: 'middle',
    lineage: { topicId: 'topic-r', proposal: 'new', role: 'current', rank: 0, reasoningSide: 'normal', reasoningSideRank: 0, reasoningDominant: true },
  },
  {
    id: 'r-gray', type: 'reasoning', premises: [], effectiveLayer: 'middle',
    lineage: { topicId: 'topic-r', proposal: 'optimization', targetId: 'r-main', role: 'history', rank: 1, reasoningSide: 'normal', reasoningSideRank: 1 },
  },
  {
    id: 'r-red', type: 'reasoning', premises: [], effectiveLayer: 'middle',
    lineage: { topicId: 'topic-r', proposal: 'opposition', targetId: 'r-main', role: 'current', rank: 0, reasoningSide: 'opposition', reasoningSideRank: 0, reasoningDominant: false },
  },
];
applyUniformLayerLayout(lineageNodes);
const lineageById = new Map(lineageNodes.map(node => [node.id, node] as const));
const main = lineageById.get('r-main')!.pos!;
for (const id of ['r-gray', 'r-red']) {
  const branch = lineageById.get(id)!.pos!;
  assert(Math.abs(branch.distanceTo(main) - RADIAL_CHAIN_LINK_LENGTH) < 1e-8, `${id} must stay connected by fixed L`);
  const radial = main.clone().normalize();
  const branchDirection = branch.clone().sub(main).normalize();
  assert(Math.abs(radial.dot(branchDirection)) < 1e-8, `${id} must be pulled perpendicular to the radial chain`);
}

console.log('Uniform layer and phase-1 radial single-chain layout regression tests passed.');