import * as THREE from 'three';
import { isSystemCoreNodeId, type KnowledgeLayer } from '../../domain/KnowledgeLayerPolicy';
import { lineageRoleFor, topicIdFor } from '../../domain/KnowledgeLineage';
import { CORE_SUN_RADIUS } from '../config/KnowledgeUiConfig';
import {
  RADIAL_LAYOUT_LINK_LENGTH,
  type RadialKnowledgeLayoutNode,
} from './RadialKnowledgeLayout';

export const SPHERICAL_SLOT_DIAMETER = RADIAL_LAYOUT_LINK_LENGTH;
export const SPHERICAL_SLOT_RADIUS = SPHERICAL_SLOT_DIAMETER / 2;
export const HCP_LAYER_HEIGHT = SPHERICAL_SLOT_DIAMETER * Math.sqrt(2 / 3);
export const SPHERICAL_DIRECTION_COUNT = 96;
export const SHELL_CAPACITY_MARGIN = 1.2;

const SQRT3 = Math.sqrt(3);
const HCP_ROW_HEIGHT = SPHERICAL_SLOT_DIAMETER * SQRT3 / 2;
const SLOT_EPSILON = SPHERICAL_SLOT_DIAMETER * 1e-6;
const ROOT_PLANE_EPSILON = SPHERICAL_SLOT_DIAMETER * 1e-4;
const MAX_RADIAL_STEPS = 128;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export interface HcpSlot {
  key: string;
  position: THREE.Vector3;
}

export interface SphericalShellRadii {
  coreClearance: number;
  innerSurface: number;
  middleSurface: number;
  outerSurface: number;
}

type DirectionRecord = {
  index: number;
  direction: THREE.Vector3;
  uses: number;
};

type RigidChain<T extends RadialKnowledgeLayoutNode> = {
  id: string;
  members: T[];
  primaryMembers: T[];
  semanticMembers: T[];
  sourceAxis: THREE.Vector3;
  origin: THREE.Vector3;
  localById: Map<string, THREE.Vector3>;
};

type CandidatePlacement<T extends RadialKnowledgeLayoutNode> = {
  chain: RigidChain<T>;
  positions: Map<string, THREE.Vector3>;
  directionRecord: DirectionRecord;
};

function setPosition(node: RadialKnowledgeLayoutNode, position: THREE.Vector3): void {
  node.pos = position.clone();
  node.homePos = position.clone();
  node.vel ??= new THREE.Vector3();
  node.vel.set(0, 0, 0);
}

function isPrimaryCurrentNode(node: RadialKnowledgeLayoutNode): boolean {
  if (isSystemCoreNodeId(node.id)) return false;
  if (node.hidden && !node.lineage) return false;
  if (lineageRoleFor(node) !== 'current') return false;
  return node.lineage?.reasoningSide !== 'opposition';
}

function placementLayer(node: RadialKnowledgeLayoutNode): KnowledgeLayer | undefined {
  if (!isPrimaryCurrentNode(node)) return undefined;
  if (node.type === 'reasoning' || node.type === 'logic-symbol') return undefined;
  return (node as RadialKnowledgeLayoutNode & { effectiveLayer?: KnowledgeLayer }).effectiveLayer;
}

function hcpParity(k: number): 0 | 1 {
  return (((k % 2) + 2) % 2) as 0 | 1;
}

export function hcpSlotPosition(i: number, j: number, k: number): THREE.Vector3 {
  const parity = hcpParity(k);
  const offsetX = parity ? SPHERICAL_SLOT_DIAMETER / 2 : 0;
  const offsetY = parity ? SPHERICAL_SLOT_DIAMETER * SQRT3 / 6 : 0;
  return new THREE.Vector3(
    SPHERICAL_SLOT_DIAMETER * (i + j / 2) + offsetX,
    HCP_ROW_HEIGHT * j + offsetY,
    HCP_LAYER_HEIGHT * k,
  );
}

function nearbyHcpSlots(center: THREE.Vector3, span = 2): HcpSlot[] {
  const slots = new Map<string, HcpSlot>();
  const approxK = Math.round(center.z / HCP_LAYER_HEIGHT);

  for (let k = approxK - span; k <= approxK + span; k += 1) {
    const parity = hcpParity(k);
    const offsetX = parity ? SPHERICAL_SLOT_DIAMETER / 2 : 0;
    const offsetY = parity ? SPHERICAL_SLOT_DIAMETER * SQRT3 / 6 : 0;
    const approxJ = Math.round((center.y - offsetY) / HCP_ROW_HEIGHT);

    for (let j = approxJ - span; j <= approxJ + span; j += 1) {
      const approxI = Math.round(
        (center.x - offsetX) / SPHERICAL_SLOT_DIAMETER - j / 2,
      );
      for (let i = approxI - span; i <= approxI + span; i += 1) {
        const key = `${i},${j},${k}`;
        if (!slots.has(key)) slots.set(key, { key, position: hcpSlotPosition(i, j, k) });
      }
    }
  }

  return [...slots.values()];
}

/**
 * A real knowledge ball is represented for occupancy by an invisible radius-2.5R
 * sphere. Every HCP radius-2.5R slot sphere it overlaps becomes occupied.
 * Tangent neighbours at exactly 5R are not occupied.
 */
export function hcpSlotsOverlappingVirtualBall(center: THREE.Vector3): HcpSlot[] {
  const overlapDistance = SPHERICAL_SLOT_DIAMETER - SLOT_EPSILON;
  const overlapDistanceSq = overlapDistance * overlapDistance;
  return nearbyHcpSlots(center)
    .filter(slot => slot.position.distanceToSquared(center) < overlapDistanceSq)
    .sort((a, b) => a.key.localeCompare(b.key));
}

function nearestHcpSlots(center: THREE.Vector3): HcpSlot[] {
  return nearbyHcpSlots(center)
    .sort((a, b) => {
      const distanceDelta = a.position.distanceToSquared(center) - b.position.distanceToSquared(center);
      return Math.abs(distanceDelta) > 1e-9 ? distanceDelta : a.key.localeCompare(b.key);
    });
}

class HcpSlotOccupancy {
  readonly usedSlots = new Set<string>();

  conflicts(positions: Iterable<THREE.Vector3>): boolean {
    for (const position of positions) {
      for (const slot of hcpSlotsOverlappingVirtualBall(position)) {
        if (this.usedSlots.has(slot.key)) return true;
      }
    }
    return false;
  }

  commit(positions: Iterable<THREE.Vector3>): void {
    for (const position of positions) {
      for (const slot of hcpSlotsOverlappingVirtualBall(position)) {
        this.usedSlots.add(slot.key);
      }
    }
  }
}

function shellRadiusAfterCapacity(
  innerRadius: number,
  nodeCount: number,
): number {
  const hcpVolumePerSlot = (SPHERICAL_SLOT_DIAMETER ** 3) / Math.sqrt(2);
  const requestedVolume = Math.max(0, nodeCount) * hcpVolumePerSlot * SHELL_CAPACITY_MARGIN;
  const radiusFromVolume = Math.cbrt(
    innerRadius ** 3 + requestedVolume * 3 / (4 * Math.PI),
  );
  return Math.max(innerRadius + SPHERICAL_SLOT_DIAMETER, radiusFromVolume);
}

export function computeSphericalShellRadii(
  nodes: readonly RadialKnowledgeLayoutNode[],
): SphericalShellRadii {
  let innerCount = 0;
  let middleCount = 0;
  let outerCount = 0;

  for (const node of nodes) {
    const layer = placementLayer(node);
    if (layer === 'inner') innerCount += 1;
    else if (layer === 'middle') middleCount += 1;
    else if (layer === 'outer') outerCount += 1;
  }

  const coreClearance = CORE_SUN_RADIUS + SPHERICAL_SLOT_RADIUS;
  const innerSurface = shellRadiusAfterCapacity(coreClearance, innerCount);
  const middleSurface = shellRadiusAfterCapacity(innerSurface, middleCount);
  const outerSurface = shellRadiusAfterCapacity(middleSurface, outerCount);
  return { coreClearance, innerSurface, middleSurface, outerSurface };
}

function connectedComponents(
  ids: readonly string[],
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): string[][] {
  const components: string[][] = [];
  const visited = new Set<string>();

  for (const seed of [...ids].sort()) {
    if (visited.has(seed)) continue;
    visited.add(seed);
    const queue = [seed];
    const component: string[] = [];
    let head = 0;

    while (head < queue.length) {
      const id = queue[head++]!;
      component.push(id);
      for (const nextId of [...(adjacency.get(id) ?? [])].sort()) {
        if (visited.has(nextId)) continue;
        visited.add(nextId);
        queue.push(nextId);
      }
    }
    components.push(component.sort());
  }

  return components;
}

function buildRigidChains<T extends RadialKnowledgeLayoutNode>(nodes: T[]): RigidChain<T>[] {
  const primaryMembers = nodes.filter(
    node => isPrimaryCurrentNode(node) && Boolean(node.pos),
  );
  const byId = new Map(primaryMembers.map(node => [node.id, node] as const));
  const adjacency = new Map(
    primaryMembers.map(node => [node.id, new Set<string>()] as const),
  );

  for (const node of primaryMembers) {
    for (const premiseId of node.premises ?? []) {
      if (!byId.has(premiseId)) continue;
      adjacency.get(node.id)!.add(premiseId);
      adjacency.get(premiseId)!.add(node.id);
    }
  }

  const components = connectedComponents(primaryMembers.map(node => node.id), adjacency);
  const memberBuckets = components.map(component => component.map(id => byId.get(id)!));
  const componentByPrimaryId = new Map<string, number>();
  components.forEach((component, index) => {
    for (const id of component) componentByPrimaryId.set(id, index);
  });

  const topicComponent = new Map<string, number>();
  for (const node of primaryMembers) {
    if (!node.lineage) continue;
    const componentIndex = componentByPrimaryId.get(node.id);
    if (componentIndex !== undefined) topicComponent.set(topicIdFor(node), componentIndex);
  }

  const assigned = new Set(primaryMembers.map(node => node.id));
  for (const node of nodes) {
    if (assigned.has(node.id) || isSystemCoreNodeId(node.id) || !node.pos) continue;
    if (node.hidden && !node.lineage) continue;

    const componentIndex = node.lineage ? topicComponent.get(topicIdFor(node)) : undefined;
    if (componentIndex !== undefined) {
      memberBuckets[componentIndex]!.push(node);
      assigned.add(node.id);
      continue;
    }

    memberBuckets.push([node]);
    assigned.add(node.id);
  }

  const chains: RigidChain<T>[] = [];
  for (const members of memberBuckets) {
    const positioned = members.filter(
      (node): node is T & { pos: THREE.Vector3 } => Boolean(node.pos),
    );
    if (!positioned.length) continue;

    const primary = positioned.filter(isPrimaryCurrentNode);
    const axisMembers = primary.length ? primary : positioned;
    const average = axisMembers
      .reduce((sum, node) => sum.add(node.pos), new THREE.Vector3())
      .multiplyScalar(1 / axisMembers.length);
    let sourceAxis = average.lengthSq() > 1e-12
      ? average.normalize()
      : axisMembers[0]!.pos.clone().normalize();
    if (sourceAxis.lengthSq() <= 1e-12) sourceAxis = new THREE.Vector3(1, 0, 0);

    const minProjection = Math.min(...axisMembers.map(node => node.pos.dot(sourceAxis)));
    const rootPlane = axisMembers.filter(
      node => Math.abs(node.pos.dot(sourceAxis) - minProjection) <= ROOT_PLANE_EPSILON,
    );
    const originMembers = rootPlane.length ? rootPlane : [axisMembers[0]!];
    const origin = originMembers
      .reduce((sum, node) => sum.add(node.pos), new THREE.Vector3())
      .multiplyScalar(1 / originMembers.length);
    const localById = new Map(
      positioned.map(node => [node.id, node.pos.clone().sub(origin)] as const),
    );
    const semanticMembers = primary.filter(node => placementLayer(node) !== undefined);

    chains.push({
      id: primary.map(node => node.id).sort()[0] ?? positioned.map(node => node.id).sort()[0]!,
      members: positioned,
      primaryMembers: primary,
      semanticMembers,
      sourceAxis,
      origin,
      localById,
    });
  }

  return chains.sort((a, b) => {
    const sizeDelta = b.primaryMembers.length - a.primaryMembers.length;
    if (sizeDelta) return sizeDelta;
    const layerCountA = new Set(a.semanticMembers.map(placementLayer).filter(Boolean)).size;
    const layerCountB = new Set(b.semanticMembers.map(placementLayer).filter(Boolean)).size;
    if (layerCountA !== layerCountB) return layerCountB - layerCountA;
    return a.id.localeCompare(b.id);
  });
}

function createDirectionRecords(): DirectionRecord[] {
  const records: DirectionRecord[] = [{
    index: 0,
    direction: new THREE.Vector3(1, 0, 0),
    uses: 0,
  }];
  const remaining = SPHERICAL_DIRECTION_COUNT - 1;
  for (let offset = 0; offset < remaining; offset += 1) {
    const index = offset + 1;
    const z = 1 - 2 * ((offset + 0.5) / remaining);
    const phi = offset * GOLDEN_ANGLE;
    const xy = Math.sqrt(Math.max(0, 1 - z * z));
    records.push({
      index,
      direction: new THREE.Vector3(
        xy * Math.cos(phi),
        xy * Math.sin(phi),
        z,
      ).normalize(),
      uses: 0,
    });
  }
  return records;
}

function preferredAnchorRadius<T extends RadialKnowledgeLayoutNode>(
  chain: RigidChain<T>,
  shells: SphericalShellRadii,
): number {
  const layers = new Set(chain.semanticMembers.map(placementLayer).filter(Boolean));
  if (layers.has('inner')) return shells.innerSurface;
  if (layers.has('middle')) return shells.innerSurface;
  if (layers.has('outer')) return shells.outerSurface;
  return shells.innerSurface;
}

function transformChain<T extends RadialKnowledgeLayoutNode>(
  chain: RigidChain<T>,
  direction: THREE.Vector3,
  anchorPosition: THREE.Vector3,
): Map<string, THREE.Vector3> {
  // One deterministic alignment is required so the frozen chain axis points at
  // the sphere centre/radial direction. There is deliberately no axial spin search.
  const alignment = new THREE.Quaternion().setFromUnitVectors(
    chain.sourceAxis,
    direction,
  );
  return new Map(
    chain.members.map(node => {
      const local = chain.localById.get(node.id)!;
      return [node.id, local.clone().applyQuaternion(alignment).add(anchorPosition)] as const;
    }),
  );
}

function placementIsLayerLegal<T extends RadialKnowledgeLayoutNode>(
  chain: RigidChain<T>,
  positions: ReadonlyMap<string, THREE.Vector3>,
  shells: SphericalShellRadii,
): boolean {
  for (const node of chain.semanticMembers) {
    const position = positions.get(node.id);
    if (!position) continue;
    const radius = position.length();
    const layer = placementLayer(node);
    if (radius + SLOT_EPSILON < shells.coreClearance) return false;
    if (layer === 'middle' && radius + SLOT_EPSILON < shells.innerSurface) return false;
    if (layer === 'outer' && radius + SLOT_EPSILON < shells.middleSurface) return false;
  }
  return true;
}

function singleBallCandidate<T extends RadialKnowledgeLayoutNode>(
  chain: RigidChain<T>,
  record: DirectionRecord,
  radius: number,
  shells: SphericalShellRadii,
  occupancy: HcpSlotOccupancy,
): CandidatePlacement<T> | null {
  const target = record.direction.clone().multiplyScalar(radius);
  for (const slot of nearestHcpSlots(target)) {
    const positions = transformChain(chain, record.direction, slot.position);
    if (!placementIsLayerLegal(chain, positions, shells)) continue;
    if (occupancy.conflicts(positions.values())) continue;
    return { chain, positions, directionRecord: record };
  }
  return null;
}

function chainCandidate<T extends RadialKnowledgeLayoutNode>(
  chain: RigidChain<T>,
  record: DirectionRecord,
  radius: number,
  shells: SphericalShellRadii,
  occupancy: HcpSlotOccupancy,
): CandidatePlacement<T> | null {
  const anchorPosition = record.direction.clone().multiplyScalar(radius);
  const positions = transformChain(chain, record.direction, anchorPosition);
  if (!placementIsLayerLegal(chain, positions, shells)) return null;
  if (occupancy.conflicts(positions.values())) return null;
  return { chain, positions, directionRecord: record };
}

function placeCandidate<T extends RadialKnowledgeLayoutNode>(
  candidate: CandidatePlacement<T>,
  occupancy: HcpSlotOccupancy,
): void {
  for (const node of candidate.chain.members) {
    const position = candidate.positions.get(node.id);
    if (position) setPosition(node, position);
  }
  occupancy.commit(candidate.positions.values());
  candidate.directionRecord.uses += 1;
}

/**
 * Global stage after relation-group geometry is already fixed.
 *
 * - chain-internal geometry is never changed;
 * - each chain gets one radial direction and only moves as one rigid body;
 * - no active rotation/spin search and no second-pass optimization;
 * - shell legality uses the existing inner/middle/outer semantic layer;
 * - collisions are represented only by overlapping 2.5R HCP slot occupancy;
 * - direction records are tried from least-used to keep the sphere sparse.
 */
export function applySphericalRigidChainPlacement<T extends RadialKnowledgeLayoutNode>(
  nodes: T[],
): T[] {
  const chains = buildRigidChains(nodes);
  if (!chains.length) return nodes;

  const shells = computeSphericalShellRadii(nodes);
  const occupancy = new HcpSlotOccupancy();
  const directionRecords = createDirectionRecords();

  for (const chain of chains) {
    const preferredRadius = preferredAnchorRadius(chain, shells);
    let placed = false;

    for (let radialStep = 0; radialStep <= MAX_RADIAL_STEPS && !placed; radialStep += 1) {
      const radius = preferredRadius + radialStep * SPHERICAL_SLOT_DIAMETER;
      const orderedDirections = [...directionRecords]
        .sort((a, b) => a.uses - b.uses || a.index - b.index);

      for (const record of orderedDirections) {
        const candidate = chain.members.length === 1
          ? singleBallCandidate(chain, record, radius, shells, occupancy)
          : chainCandidate(chain, record, radius, shells, occupancy);
        if (!candidate) continue;
        placeCandidate(candidate, occupancy);
        placed = true;
        break;
      }
    }

    if (!placed) {
      throw new Error(`Unable to place rigid knowledge chain ${chain.id} in HCP slot space`);
    }
  }

  return nodes;
}
