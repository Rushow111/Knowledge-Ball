
import type { GraphNode } from '../graph/Node';

export type KnowledgeProposalKind = 'new' | 'optimization' | 'opposition';
export type KnowledgeLineageRole = 'current' | 'history' | 'opposition' | 'candidate-history' | 'candidate-opposition' | 'rejected';
export type KnowledgeViewMode = 'current' | 'personal' | 'lineage';
export type RevalidationKind = 'challenge' | 'cascade';

export interface KnowledgeLineageMeta {
  topicId: string;
  proposal: KnowledgeProposalKind;
  targetId?: string;
  role: KnowledgeLineageRole;
  rank: number;
  revalidation?: RevalidationKind;
}

export function topicIdFor(node: Pick<GraphNode,'id'|'lineage'>): string {
  return node.lineage?.topicId ?? node.id;
}

export function lineageRoleFor(node: Pick<GraphNode,'lineage'>): KnowledgeLineageRole {
  return node.lineage?.role ?? 'current';
}

export function lineageColorRole(node: Pick<GraphNode,'lineage'>): 'normal'|'history'|'opposition' {
  const role=lineageRoleFor(node);
  if(role==='history'||role==='candidate-history') return 'history';
  if(role==='opposition'||role==='candidate-opposition') return 'opposition';
  return 'normal';
}

export function stableLineageRole(node: Pick<GraphNode,'status'|'lineage'>): 'history'|'opposition'|null {
  if(node.status==='pending') return null;
  const role=lineageRoleFor(node);
  return role==='history'||role==='opposition'?role:null;
}

export function visibleInKnowledgeView(
  node: Pick<GraphNode,'status'|'mastery'|'lineage'>,
  mode: KnowledgeViewMode,
): boolean {
  const role=lineageRoleFor(node);
  if(role==='rejected') return false;
  // Pending proposals/revalidations must remain visible in every view.
  if(node.status==='pending') return true;
  if(role==='history'||role==='opposition') return mode==='lineage';
  return mode!=='personal'||node.mastery!=='none';
}

export function ensureCurrentLineage(node: GraphNode): KnowledgeLineageMeta {
  if(!node.lineage) node.lineage={topicId:node.id,proposal:'new',role:'current',rank:0};
  return node.lineage;
}

export function lineageMembers(nodes:readonly GraphNode[], nodeId:string) {
  const selected=nodes.find(n=>n.id===nodeId);
  if(!selected) return {history:[] as GraphNode[],opposition:[] as GraphNode[]};
  const topic=topicIdFor(selected);
  const ordered=(role:'history'|'opposition')=>nodes
    .filter(n=>n.id!==nodeId&&topicIdFor(n)===topic&&lineageRoleFor(n)===role&&!n.hidden)
    .sort((a,b)=>(a.lineage?.rank??1e9)-(b.lineage?.rank??1e9));
  return {history:ordered('history'),opposition:ordered('opposition')};
}

function setRole(node:GraphNode, topicId:string, role:KnowledgeLineageRole, rank:number):void {
  const base=ensureCurrentLineage(node);
  node.lineage={...base,topicId,role,rank,revalidation:undefined};
}

export function activateOptimization(nodes:GraphNode[], candidateId:string):string|null {
  const candidate=nodes.find(n=>n.id===candidateId);
  const target=candidate?.lineage?.targetId?nodes.find(n=>n.id===candidate.lineage!.targetId):undefined;
  if(!candidate||!target) return null;
  const topic=ensureCurrentLineage(target).topicId;
  for(const node of nodes){
    if(topicIdFor(node)===topic&&lineageRoleFor(node)==='history') setRole(node,topic,'history',(node.lineage?.rank??0)+1);
  }
  setRole(target,topic,'history',1);
  setRole(candidate,topic,'current',0);
  return target.id;
}

export function activateOpposition(nodes:GraphNode[], candidateId:string):string|null {
  const candidate=nodes.find(n=>n.id===candidateId);
  const target=candidate?.lineage?.targetId?nodes.find(n=>n.id===candidate.lineage!.targetId):undefined;
  if(!candidate||!target) return null;
  const topic=ensureCurrentLineage(target).topicId;
  const oldCurrentAndHistory=nodes.filter(n=>topicIdFor(n)===topic&&['current','history'].includes(lineageRoleFor(n))&&n.id!==candidate.id)
    .sort((a,b)=>lineageRoleFor(a)==='current'?-1:lineageRoleFor(b)==='current'?1:(a.lineage?.rank??0)-(b.lineage?.rank??0));
  const oldOpposition=nodes.filter(n=>topicIdFor(n)===topic&&lineageRoleFor(n)==='opposition'&&n.id!==candidate.id)
    .sort((a,b)=>(a.lineage?.rank??0)-(b.lineage?.rank??0));
  oldOpposition.forEach((n,i)=>setRole(n,topic,'history',i+1));
  oldCurrentAndHistory.forEach((n,i)=>setRole(n,topic,'opposition',i+1));
  setRole(candidate,topic,'current',0);
  return target.id;
}

export function reactivateLineageNode(nodes:GraphNode[], nodeId:string):string|null {
  const selected=nodes.find(n=>n.id===nodeId);
  if(!selected?.lineage) return null;
  const topic=selected.lineage.topicId;
  const role=lineageRoleFor(selected);
  const current=nodes.find(n=>topicIdFor(n)===topic&&lineageRoleFor(n)==='current');
  if(!current) return null;
  if(role==='history'){
    for(const node of nodes){
      if(topicIdFor(node)===topic&&lineageRoleFor(node)==='history'&&node.id!==selected.id) setRole(node,topic,'history',(node.lineage?.rank??0)+1);
    }
    setRole(current,topic,'history',1);
    setRole(selected,topic,'current',0);
    return current.id;
  }
  if(role==='opposition'){
    // Existing red node wins the same side-swap that a new opposition candidate would.
    selected.lineage={...selected.lineage,targetId:current.id,role:'candidate-opposition'};
    return activateOpposition(nodes,selected.id);
  }
  return null;
}

export function directConclusions(nodes:readonly GraphNode[], nodeId:string):GraphNode[]{
  return nodes.filter(n=>!n.hidden&&n.premises.includes(nodeId));
}

export function downstreamClosure(nodes:readonly GraphNode[], roots:readonly string[]):string[]{
  const seen=new Set(roots); const queue=[...roots]; const result:string[]=[];
  while(queue.length){
    const current=queue.shift()!;
    for(const node of nodes){
      if(seen.has(node.id)||!node.premises.includes(current)) continue;
      seen.add(node.id); queue.push(node.id); result.push(node.id);
    }
  }
  return result;
}

export function rewirePremise(nodes:GraphNode[], oldId:string, newId:string):void{
  for(const node of nodes) node.premises=node.premises.map(id=>id===oldId?newId:id);
}
