import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import * as THREE from 'three';
import {
  MOBILE_ACTIVE_NODE_ENTER_RANK,
  MOBILE_ACTIVE_NODE_EXIT_RANK,
  MOBILE_ACTIVE_NODE_TARGET,
  selectMobileActiveNodeIds,
} from './MobileSceneLod';
import type { RadialKnowledgeLayoutNode } from './RadialKnowledgeLayout';
import {
  applySphericalRigidChainPlacement,
  computeSphericalShellRadii,
  hcpSlotPosition,
  hcpSlotsOverlappingVirtualBall,
  SPHERICAL_SLOT_RADIUS,
} from './SphericalRigidChainPlacement';

const appSource = readFileSync('src/ui/app.ts', 'utf8');
const sceneSource = readFileSync('src/ui/scene/KnowledgeScene.ts', 'utf8');
const layoutEntrySource = readFileSync('src/ui/scene/UniformLayerLayout.ts', 'utf8');
const radialSource = readFileSync('src/ui/scene/RadialKnowledgeLayout.ts', 'utf8');
const relationPackingSource = readFileSync('src/ui/scene/TriangularRelationGroupPacking.ts', 'utf8');
const sphericalPackingSource = readFileSync('src/ui/scene/SphericalRigidChainPlacement.ts', 'utf8');

assert(appSource.includes("import { applyUniformLayerLayout } from './scene/UniformLayerLayout';"), 'user app must use the single layout entry point');
const allNodesIndex = appSource.indexOf('layoutNodes = domainNodes.map');
const layoutCallIndex = appSource.indexOf('applyUniformLayerLayout(layoutNodes)');
const renderFilterIndex = appSource.indexOf('renderNodes = layoutNodes.filter');
assert(allNodesIndex >= 0, 'user app must build layout from every projected node');
assert(layoutCallIndex > allNodesIndex, 'radial layout must run after the full projected graph is materialized');
assert(renderFilterIndex > layoutCallIndex, 'hidden rendering filter must run only after full-graph layout');
assert(!appSource.includes('mobileSceneNodeLimit'), 'mobile knowledge truth must not restore a fixed scene-node cap');

assert(layoutEntrySource.includes('applyRadialKnowledgeLayout,') && layoutEntrySource.includes("from './RadialKnowledgeLayout';"), 'the compatibility layout entry must preserve RadialKnowledgeLayout as the first geometry stage');
assert(layoutEntrySource.includes("import { applyTriangularRelationGroupPacking } from './TriangularRelationGroupPacking';"), 'the single layout entry must use relation-group triangular packing');
assert(layoutEntrySource.includes("import { applySphericalRigidChainPlacement } from './SphericalRigidChainPlacement';"), 'the single layout entry must add only the agreed spherical rigid-chain placement stage');
const radialCallIndex = layoutEntrySource.indexOf('applyRadialKnowledgeLayout(nodes);');
const packingCallIndex = layoutEntrySource.indexOf('applyTriangularRelationGroupPacking(nodes);');
const reasoningRefreshIndex = layoutEntrySource.indexOf('placeReasoningAtRelationCenters(nodes);');
const sphericalPlacementIndex = layoutEntrySource.indexOf('applySphericalRigidChainPlacement(nodes);');
assert(radialCallIndex >= 0 && packingCallIndex > radialCallIndex, 'relation-group packing must run only after canonical radial planes are established');
assert(reasoningRefreshIndex > packingCallIndex, 'reasoning balls must be inserted before the finished chain is frozen');
assert(sphericalPlacementIndex > reasoningRefreshIndex, 'global spherical placement must move only the already-finished rigid chain');
assert(!layoutEntrySource.includes('applyLocalChainLengthOptimization'), 'retired line-length optimization must not remain in the runtime entry');
assert(!layoutEntrySource.includes('RelationLengthLayout'), 'retired global relation-length layout must not return');

assert(radialSource.includes('RADIAL_LAYOUT_LINK_LENGTH = RADIAL_LAYOUT_NODE_RADIUS * 5'), 'radial owner must preserve L=5R');
assert(radialSource.includes('RADIAL_LAYOUT_PLANE_EDGE_LENGTH = RADIAL_LAYOUT_LINK_LENGTH'), 'same-layer initial triangular edge must equal 5R');
assert(radialSource.includes('buildCompressedKnowledgeGraph'), 'reasoning must remain compressed out of the primary knowledge-position solve');
assert(radialSource.includes('placeReasoningAtRelationCenters'), 'reasoning balls must still be inserted after knowledge positions are solved');
assert(radialSource.includes('premiseCenter.add(conclusionCenter).multiplyScalar(0.5)'), 'reasoning position must remain the midpoint of equal-weight premise and conclusion centres');

assert(relationPackingSource.includes('compactRelationGroupAxialCoordinates'), 'relation groups must use deterministic compact triangular-lattice templates');
assert(relationPackingSource.includes('groupConflictComponents'), 'shared-node relation groups must be solved as bounded conflict components');
assert(relationPackingSource.includes('RELATION_GROUP_BEAM_WIDTH = 96'), 'conflict search must remain explicitly bounded');
assert(relationPackingSource.includes("more satisfied groups -> larger satisfied groups -> closer anchor-centre match"), 'packing priority must encode group count, larger groups, then centre alignment');
assert(relationPackingSource.includes('assignedPeerAdjacency'), 'unsatisfied remainder placement must prefer adding compact neighbouring triangles rather than rows');
assert(relationPackingSource.includes('RADIAL_LAYOUT_LINK_LENGTH'), 'triangular lattice spacing must remain exactly 5R');
assert(!relationPackingSource.includes('edgeTotal('), 'new layout must not optimize total edge length');
assert(!relationPackingSource.includes('pullTowardShorterEdges'), 'new layout must not retain force-style edge shortening');

assert(sphericalPackingSource.includes('SPHERICAL_SLOT_RADIUS = SPHERICAL_SLOT_DIAMETER / 2'), 'global occupancy must use invisible radius-2.5R HCP slot spheres');
assert(sphericalPackingSource.includes('class HcpSlotOccupancy'), 'global placement must use slot occupancy rather than scanning every placed ball');
assert(sphericalPackingSource.includes('readonly usedSlots = new Set<string>()'), 'occupied HCP slots must be recorded directly');
assert(sphericalPackingSource.includes('hcpSlotsOverlappingVirtualBall'), 'off-slot rigid-chain balls must mark every HCP slot sphere they overlap');
assert(sphericalPackingSource.includes('directionRecords'), 'global placement must use the fixed spherical direction record');
assert(sphericalPackingSource.includes('setFromUnitVectors'), 'one deterministic alignment is required to keep a chain radial');
assert(!sphericalPackingSource.includes('rotationCandidates'), 'global placement must not add rotation-candidate search');
assert(!sphericalPackingSource.includes('for (let angle'), 'global placement must not search extra spin angles');

const slotDiameter = SPHERICAL_SLOT_RADIUS * 2;
const hcp0 = hcpSlotPosition(0, 0, 0);
const hcp1 = hcpSlotPosition(1, 0, 0);
assert.ok(Math.abs(hcp0.distanceTo(hcp1) - slotDiameter) < 1e-6, 'adjacent HCP slot centres must be exactly 5R apart');
const exactOverlap = hcpSlotsOverlappingVirtualBall(hcp0);
assert.equal(exactOverlap.length, 1, 'a ball centred on one HCP slot must occupy only that slot; tangent neighbours stay free');
const midpointOverlap = hcpSlotsOverlappingVirtualBall(hcp0.clone().add(hcp1).multiplyScalar(0.5));
assert.ok(midpointOverlap.length >= 2, 'an off-slot rigid ball must occupy every overlapping HCP slot');

type LayeredNode = RadialKnowledgeLayoutNode & {
  effectiveLayer?: 'inner' | 'middle' | 'outer' | 'core';
};

const rigidChain: LayeredNode[] = [
  { id: 'rigid-inner', type: 'definition', premises: [], effectiveLayer: 'inner', pos: new THREE.Vector3(72, 0, 0) },
  { id: 'rigid-middle', type: 'theorem', premises: ['rigid-inner'], effectiveLayer: 'middle', pos: new THREE.Vector3(108, 0, 0) },
  { id: 'rigid-outer', type: 'hypothesis', premises: ['rigid-middle'], effectiveLayer: 'outer', pos: new THREE.Vector3(144, 0, 0) },
];
const rigidDistances = [
  rigidChain[0]!.pos!.distanceTo(rigidChain[1]!.pos!),
  rigidChain[1]!.pos!.distanceTo(rigidChain[2]!.pos!),
  rigidChain[0]!.pos!.distanceTo(rigidChain[2]!.pos!),
];
const rigidShells = computeSphericalShellRadii(rigidChain);
applySphericalRigidChainPlacement(rigidChain);
assert.ok(Math.abs(rigidChain[0]!.pos!.distanceTo(rigidChain[1]!.pos!) - rigidDistances[0]!) < 1e-6, 'global placement must not change the first rigid-chain edge');
assert.ok(Math.abs(rigidChain[1]!.pos!.distanceTo(rigidChain[2]!.pos!) - rigidDistances[1]!) < 1e-6, 'global placement must not change the second rigid-chain edge');
assert.ok(Math.abs(rigidChain[0]!.pos!.distanceTo(rigidChain[2]!.pos!) - rigidDistances[2]!) < 1e-6, 'global placement must preserve the whole rigid-chain shape');
assert.ok(rigidChain[1]!.pos!.length() + 1e-6 >= rigidShells.innerSurface, 'middle/blue nodes may not enter the inner/cyan-only shell');
assert.ok(rigidChain[2]!.pos!.length() + 1e-6 >= rigidShells.middleSurface, 'outer/purple nodes must stay in the outer shell');
const rigidAxis = rigidChain[0]!.pos!.clone().normalize();
const rigidEdge = rigidChain[1]!.pos!.clone().sub(rigidChain[0]!.pos!).normalize();
assert.ok(rigidAxis.cross(rigidEdge).length() < 1e-6, 'the frozen chain main direction must remain radial toward/from the sphere centre');

const directSingles: LayeredNode[] = [
  { id: 'slot-single-a', type: 'definition', premises: [], effectiveLayer: 'inner', pos: new THREE.Vector3(72, 0, 0) },
  { id: 'slot-single-b', type: 'definition', premises: [], effectiveLayer: 'inner', pos: new THREE.Vector3(72, 0, 0) },
];
applySphericalRigidChainPlacement(directSingles);
const singleASlots = hcpSlotsOverlappingVirtualBall(directSingles[0]!.pos!);
const singleBSlots = hcpSlotsOverlappingVirtualBall(directSingles[1]!.pos!);
assert.equal(singleASlots.length, 1, 'a direct singleton must use one exact HCP slot');
assert.equal(singleBSlots.length, 1, 'the next direct singleton must also use one exact HCP slot');
assert.notEqual(singleASlots[0]!.key, singleBSlots[0]!.key, 'an already occupied HCP slot may not be reused');

assert.equal(MOBILE_ACTIVE_NODE_TARGET, 49, 'mobile high-detail working set target must remain 49');
assert.equal(MOBILE_ACTIVE_NODE_ENTER_RANK, 45, 'new mobile nodes must enter only after moving clearly into the near set');
assert.equal(MOBILE_ACTIVE_NODE_EXIT_RANK, 55, 'existing mobile nodes must receive a wider exit band to prevent boundary flicker');
assert(MOBILE_ACTIVE_NODE_ENTER_RANK < MOBILE_ACTIVE_NODE_TARGET, 'entry rank must be stricter than the target boundary');
assert(MOBILE_ACTIVE_NODE_EXIT_RANK > MOBILE_ACTIVE_NODE_TARGET, 'exit rank must be wider than the target boundary');

const ranked = Array.from({ length: 80 }, (_, index) => ({ id: `n-${index}`, score: 1000 - index }));
const initial = selectMobileActiveNodeIds(ranked, new Set(), new Set(['n-70']));
assert.equal(initial.size, MOBILE_ACTIVE_NODE_TARGET, 'mobile LOD must cap the high-detail working set rather than knowledge truth');
assert(initial.has('n-70'), 'forced selected/related nodes must stay in the high-detail set even when distant');
const previous = new Set(Array.from({ length: MOBILE_ACTIVE_NODE_TARGET }, (_, index) => `n-${index}`));
const shifted = ranked.map((candidate, index) => ({ ...candidate, score: candidate.score + (index >= 45 && index < 55 ? 20 : 0) }));
const next = selectMobileActiveNodeIds(shifted, previous, new Set());
assert.equal(next.size, MOBILE_ACTIVE_NODE_TARGET, 'hysteresis must keep a bounded working set');

assert(sceneSource.includes('selectMobileActiveNodeIds'), 'scene must dynamically select its mobile high-detail working set');
assert(sceneSource.includes('largeGraphDirty = true;') && sceneSource.includes("mode === 'rotate'"), 'rotation must invalidate the mobile working set so near/far membership updates while rotating');
assert(sceneSource.includes('const nodeId = !moved && !pinchOccurred ? draggedNodeId : null;'), 'pointerup must reuse the pointerdown hit instead of rescanning the whole working set');
assert(sceneSource.includes('syncEdges(allNodes)'), 'relation lifecycle must follow the complete graph rather than the mobile high-detail working set');
assert(!sceneSource.includes('syncEdges(activeNodes)'), 'mobile LOD membership must not create, remove, or restore relations');
assert(!sceneSource.includes('edgesGroup.visible=false'), 'large mobile graphs must not globally hide all relations');
assert(sceneSource.includes('getActiveNodeCount'), 'runtime must expose active-node count for production-scale regression checks');

console.log('Rigid relation geometry plus spherical HCP slot placement wiring checks passed.');
