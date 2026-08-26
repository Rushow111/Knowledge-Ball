import * as THREE from 'three';
import {
  lineageRoleFor,
  topicIdFor,
  type KnowledgeLineageMeta,
} from '../../domain/KnowledgeLineage';

/**
 * Phase-1 radial chain experiment.
 *
 * r is the canonical layout radius used only for geometry placement. The live
 * renderer may still draw reasoning balls smaller than ordinary knowledge balls.
 */
export const RADIAL_CHAIN_LAYOUT_RADIUS = 7.2;
export const RADIAL_CHAIN_LINK_LENGTH = RADIAL_CHAIN_LAYOUT_RADIUS * 5;
export const RADIAL_CHAIN_PLANE_MIN_SPACING = RADIAL_CHAIN_LAYOUT_RADIUS * 2;

const EPSILON = 1e-9;
const MAX_CAP_RING_RATIO = 0.92;

export interface RadialChainLayoutNode {
  id: string;
  type?: string;
  premises?: readonly string[];
  lineage?: KnowledgeLineageMeta;
  pos?: THREE.Vector3;
  homePos?: THREE.Vector3;
  vel?: THREE.Vector3;
}

export interface RadialChainLayoutResult {
  componentCount: number;
  reasoningCount: number;
  placedNodeCount: number;
  linkLength: number;
}

type TangentBasis = {
  radial: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
};

function normalizedOrFallback(vector: THREE.Vector3, fallbackId: string): THREE.Vector3 {
  if (vector.lengthSq() > EPSILON) return vector.normalize();
  let hash = 2166136261;
  for (let index = 0; index < fallbackId.length; index++) {
    hash ^= fallbackId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const z = ((hash >>> 0) / 4294967295) * 2 - 1;
  const phi = (((hash ^ 0x9e3779b9) >>> 0) / 4294967295) * Math.PI * 2;
  const xy = Math.sqrt(Math.max(0, 1 - z * z));
  return new THREE.Vector3(xy * Math.cos(phi), xy * Math.sin(phi), z).normalize();
}

export function radialTangentBasis(direction: THREE.Vector3): TangentBasis {
  const radial = normalizedOrFallback(direction.clone(), 'radial-chain-basis');
  const reference = Math.abs(radial.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const u = reference.clone().cross(radial).normalize();
  const v = radial.clone().cross(u).normalize();
  return { radial, u, v };
}

/**
 * Spread n neighbours on one plane perpendicular to the radial axis while every
 * neighbour remains exactly L from the center. For n>1:
 *   rho >= x / (2 sin(pi/n))
 *   h = sqrt(L^2 - rho^2)
 * so pair spacing is at least x whenever that is geometrically possible.
 */
export function spreadOnRadialCap(
  center: THREE.Vector3,
  radialDirection: THREE.Vector3,
  count: number,
  outward: boolean,
  minSpacing = RADIAL_CHAIN_PLANE_MIN_SPACING,
): THREE.Vector3[] {
  if (count <= 0) return [];
  const { radial, u, v } = radialTangentBasis(radialDirection);
  const sign = outward ? 1 : -1;

  if (count === 1) {
    return [center.clone().addScaledVector(radial, sign * RADIAL_CHAIN_LINK_LENGTH)];
  }

  const requestedRingRadius = minSpacing / (2 * Math.sin(Math.PI / count));
  const ringRadius = Math.min(
    requestedRingRadius,
    RADIAL_CHAIN_LINK_LENGTH * MAX_CAP_RING_RATIO,
  );
  const axial = Math.sqrt(Math.max(
    0,
    RADIAL_CHAIN_LINK_LENGTH ** 2 - ringRadius ** 2,
  ));
  const phase = count % 2 === 0 ? Math.PI / count : 0;

  return Array.from({ length: count }, (_, index) => {
    const angle = phase + index * Math.PI * 2 / count;
    return center.clone()
      .addScaledVector(radial, sign * axial)
      .addScaledVector(u, ringRadius * Math.cos(angle))
      .addScaledVector(v, ringRadius * Math.sin(angle));
  });
}

function isPrimaryLogicalNode(node: RadialChainLayoutNode): boolean {
  const role = lineageRoleFor(node);
  return role === 'current' && node.lineage?.reasoningSide !== 'opposition';
}

function isPrimaryReasoning(node: RadialChainLayoutNode): boolean {
  return node.type === 'reasoning' && isPrimaryLogicalNode(node);
}

function setPosition(
  node: RadialChainLayoutNode,
  position: THREE.Vector3,
  placed: Set<string>,
): void {
  node.pos = position.clone();
  node.homePos = position.clone();
  node.vel ??= new THREE.Vector3();
  node.vel.set(0, 0, 0);
  placed.add(node.id);
}

function componentDirection(
  reasoningIds: readonly string[],
  byId: ReadonlyMap<string, RadialChainLayoutNode>,
  conclusionsByReasoning: ReadonlyMap<string, readonly string[]>,
): THREE.Vector3 {
  const sum = new THREE.Vector3();
  const seen = new Set<string>();
  const include = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const position = byId.get(id)?.pos;
    if (position && position.lengthSq() > EPSILON) sum.add(position.clone().normalize());
  };

  for (const reasoningId of reasoningIds) {
    include(reasoningId);
    for (const premiseId of byId.get(reasoningId)?.premises ?? []) include(premiseId);
    for (const conclusionId of conclusionsByReasoning.get(reasoningId) ?? []) include(conclusionId);
  }

  return normalizedOrFallback(sum, reasoningIds[0] ?? 'radial-chain-component');
}

function connectedReasoningComponents(
  reasoningIds: readonly string[],
  parentsByReasoning: ReadonlyMap<string, ReadonlySet<string>>,
  childrenByReasoning: ReadonlyMap<string, ReadonlySet<string>>,
): string[][] {
  const allowed = new Set(reasoningIds);
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const seed of reasoningIds) {
    if (visited.has(seed)) continue;
    const queue = [seed];
    const component: string[] = [];
    visited.add(seed);
    let head = 0;
    while (head < queue.length) {
      const id = queue[head++];
      component.push(id);
      const neighbours = new Set([
        ...(parentsByReasoning.get(id) ?? []),
        ...(childrenByReasoning.get(id) ?? []),
      ]);
      for (const nextId of neighbours) {
        if (!allowed.has(nextId) || visited.has(nextId)) continue;
        visited.add(nextId);
        queue.push(nextId);
      }
    }
    components.push(component);
  }

  return components;
}

function lineageRank(node: RadialChainLayoutNode): number {
  return node.lineage?.reasoningSideRank ?? node.lineage?.rank ?? 0;
}

function placeLineageBranches(
  nodes: RadialChainLayoutNode[],
  placed: Set<string>,
): void {
  const groups = new Map<string, RadialChainLayoutNode[]>();
  for (const node of nodes) {
    if (!node.lineage) continue;
    const topicId = topicIdFor(node);
    const group = groups.get(topicId);
    if (group) group.push(node);
    else groups.set(topicId, [node]);
  }

  for (const [topicId, members] of groups) {
    const base = members.find(node =>
      lineageRoleFor(node) === 'current'
        && node.lineage?.reasoningSide !== 'opposition',
    );
    if (!base?.pos) continue;

    const basis = radialTangentBasis(base.pos.clone());
    const normalHistory = members
      .filter(node =>
        (node.lineage?.reasoningSide === 'normal' && lineageRank(node) > 0)
          || (!node.lineage?.reasoningSide && lineageRoleFor(node) === 'history'),
      )
      .sort((left, right) => lineageRank(left) - lineageRank(right));
    normalHistory.forEach((node, index) => {
      const rank = Math.max(1, lineageRank(node) || index + 1);
      setPosition(
        node,
        base.pos!.clone().addScaledVector(basis.u, RADIAL_CHAIN_LINK_LENGTH * rank),
        placed,
      );
    });

    const redHead = members.find(node =>
      node.lineage?.reasoningSide === 'opposition'
        && lineageRank(node) === 0
        && (lineageRoleFor(node) === 'current' || lineageRoleFor(node) === 'opposition'),
    );
    if (redHead) {
      setPosition(
        redHead,
        base.pos.clone().addScaledVector(basis.u, -RADIAL_CHAIN_LINK_LENGTH),
        placed,
      );
      const redHistory = members
        .filter(node => node.lineage?.reasoningSide === 'opposition' && lineageRank(node) > 0)
        .sort((left, right) => lineageRank(left) - lineageRank(right));
      redHistory.forEach((node, index) => {
        const rank = Math.max(1, lineageRank(node) || index + 1);
        setPosition(
          node,
          base.pos!.clone().addScaledVector(
            basis.u,
            -RADIAL_CHAIN_LINK_LENGTH * (rank + 1),
          ),
          placed,
        );
      });
    } else {
      const legacyOpposition = members
        .filter(node => !node.lineage?.reasoningSide && lineageRoleFor(node) === 'opposition')
        .sort((left, right) => lineageRank(left) - lineageRank(right));
      legacyOpposition.forEach((node, index) => {
        const rank = Math.max(1, lineageRank(node) || index + 1);
        setPosition(
          node,
          base.pos!.clone().addScaledVector(basis.u, -RADIAL_CHAIN_LINK_LENGTH * rank),
          placed,
        );
      });
    }

    const grayCandidate = members.find(node => lineageRoleFor(node) === 'candidate-history');
    if (grayCandidate) {
      setPosition(
        grayCandidate,
        base.pos.clone().addScaledVector(basis.v, RADIAL_CHAIN_LINK_LENGTH),
        placed,
      );
    }
    const redCandidate = members.find(node => lineageRoleFor(node) === 'candidate-opposition');
    if (redCandidate) {
      setPosition(
        redCandidate,
        base.pos.clone().addScaledVector(basis.v, -RADIAL_CHAIN_LINK_LENGTH),
        placed,
      );
    }

    void topicId;
  }
}

/**
 * Overlay only the first single-chain experiment on top of the existing fallback
 * layout. Unrelated/standalone nodes keep their previous slots.
 *
 * Main-chain rules implemented here:
 * 1) every premise -> reasoning and reasoning -> conclusion edge is exactly L=5r
 *    whenever that endpoint has not already been fixed by another branch;
 * 2) one-in/one-out paths are radial and therefore straight;
 * 3) multiple premises/conclusions spread on one perpendicular plane with at
 *    least x=2r spacing whenever the fixed-L sphere has enough room;
 * 4) gray/red lineage branches run perpendicular to the radial chain and keep L.
 */
export function applyRadialChainLayout<T extends RadialChainLayoutNode>(nodes: T[]): RadialChainLayoutResult {
  const byId = new Map(nodes.map(node => [node.id, node] as const));
  const primaryNodes = nodes.filter(isPrimaryLogicalNode);
  const primaryIds = new Set(primaryNodes.map(node => node.id));
  const reasoningNodes = primaryNodes.filter(isPrimaryReasoning);
  const reasoningIds = reasoningNodes.map(node => node.id);
  const reasoningIdSet = new Set(reasoningIds);
  const conclusionsByReasoning = new Map<string, string[]>();
  const ownerByConclusion = new Map<string, string>();

  for (const reasoningId of reasoningIds) conclusionsByReasoning.set(reasoningId, []);
  for (const node of primaryNodes) {
    if (node.type === 'reasoning') continue;
    for (const premiseId of node.premises ?? []) {
      if (!reasoningIdSet.has(premiseId)) continue;
      conclusionsByReasoning.get(premiseId)!.push(node.id);
      if (!ownerByConclusion.has(node.id)) ownerByConclusion.set(node.id, premiseId);
    }
  }

  const parentsByReasoning = new Map<string, Set<string>>();
  const childrenByReasoning = new Map<string, Set<string>>();
  for (const reasoningId of reasoningIds) {
    parentsByReasoning.set(reasoningId, new Set());
    childrenByReasoning.set(reasoningId, new Set());
  }
  for (const reasoning of reasoningNodes) {
    for (const premiseId of reasoning.premises ?? []) {
      const parentReasoningId = ownerByConclusion.get(premiseId);
      if (!parentReasoningId || parentReasoningId === reasoning.id) continue;
      parentsByReasoning.get(reasoning.id)!.add(parentReasoningId);
      childrenByReasoning.get(parentReasoningId)?.add(reasoning.id);
    }
  }

  const components = connectedReasoningComponents(
    reasoningIds,
    parentsByReasoning,
    childrenByReasoning,
  );
  const placed = new Set<string>();

  for (const component of components) {
    const componentSet = new Set(component);
    const direction = componentDirection(component, byId, conclusionsByReasoning);
    const roots = component.filter(reasoningId =>
      [...(parentsByReasoning.get(reasoningId) ?? [])]
        .every(parentId => !componentSet.has(parentId)),
    );
    const effectiveRoots = roots.length ? roots : [component[0]];
    const virtualRoot = direction.clone().multiplyScalar(RADIAL_CHAIN_LINK_LENGTH);
    const rootPositions = spreadOnRadialCap(
      virtualRoot,
      direction,
      effectiveRoots.length,
      true,
    );
    const queue: string[] = [];
    effectiveRoots.forEach((reasoningId, index) => {
      const reasoning = byId.get(reasoningId);
      if (!reasoning) return;
      setPosition(reasoning, rootPositions[index], placed);
      queue.push(reasoningId);
    });

    let head = 0;
    while (head < queue.length) {
      const reasoningId = queue[head++];
      const reasoning = byId.get(reasoningId);
      if (!reasoning?.pos) continue;

      const unplacedPremises = (reasoning.premises ?? [])
        .filter(id => primaryIds.has(id) && !placed.has(id))
        .map(id => byId.get(id))
        .filter((node): node is T => Boolean(node));
      const premisePositions = spreadOnRadialCap(
        reasoning.pos,
        direction,
        unplacedPremises.length,
        false,
      );
      unplacedPremises.forEach((node, index) => setPosition(node, premisePositions[index], placed));

      const conclusions = (conclusionsByReasoning.get(reasoningId) ?? [])
        .map(id => byId.get(id))
        .filter((node): node is T => Boolean(node));
      const unplacedConclusions = conclusions.filter(node => !placed.has(node.id));
      const conclusionPositions = spreadOnRadialCap(
        reasoning.pos,
        direction,
        unplacedConclusions.length,
        true,
      );
      unplacedConclusions.forEach((node, index) => setPosition(node, conclusionPositions[index], placed));

      for (const conclusion of conclusions) {
        if (!conclusion.pos) continue;
        const childIds = component.filter(childId =>
          !placed.has(childId)
            && (byId.get(childId)?.premises ?? []).includes(conclusion.id),
        );
        const childPositions = spreadOnRadialCap(
          conclusion.pos,
          direction,
          childIds.length,
          true,
        );
        childIds.forEach((childId, index) => {
          const child = byId.get(childId);
          if (!child) return;
          setPosition(child, childPositions[index], placed);
          queue.push(childId);
        });
      }
    }

    // Defensive fallback for a malformed cyclic/merge component. Keep the first
    // experiment deterministic rather than trying to globally repack old nodes.
    let fallbackIndex = 0;
    for (const reasoningId of component) {
      if (placed.has(reasoningId)) continue;
      const reasoning = byId.get(reasoningId);
      if (!reasoning) continue;
      const radius = RADIAL_CHAIN_LINK_LENGTH * (2 + fallbackIndex * 2);
      setPosition(reasoning, direction.clone().multiplyScalar(radius), placed);
      fallbackIndex++;
    }
  }

  placeLineageBranches(nodes, placed);

  return {
    componentCount: components.length,
    reasoningCount: reasoningNodes.length,
    placedNodeCount: placed.size,
    linkLength: RADIAL_CHAIN_LINK_LENGTH,
  };
}
