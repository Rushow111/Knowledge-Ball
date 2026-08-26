import type { RadialKnowledgeLayoutNode } from './RadialKnowledgeLayout';
import {
  applyRadialKnowledgeLayout,
  placeReasoningAtRelationCenters,
} from './RadialKnowledgeLayout';
import { applyTriangularRelationGroupPacking } from './TriangularRelationGroupPacking';
import { applySphericalRigidChainPlacement } from './SphericalRigidChainPlacement';

/**
 * Runtime layout entry kept only so existing callers do not need unrelated
 * wiring changes. First solve the frozen relation-group geometry, then place
 * each finished rigid chain into the spherical HCP slot field. The global stage
 * may move a whole chain, but never changes its internal shape.
 */
export type UniformLayoutNode = RadialKnowledgeLayoutNode;

export function applyUniformLayerLayout<T extends UniformLayoutNode>(nodes: T[]): T[] {
  applyRadialKnowledgeLayout(nodes);
  applyTriangularRelationGroupPacking(nodes);
  placeReasoningAtRelationCenters(nodes);
  applySphericalRigidChainPlacement(nodes);
  return nodes;
}
