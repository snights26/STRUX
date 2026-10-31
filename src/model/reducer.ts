import { createId, withTimestamp } from './project';
import { RESTRAINTS, type LoadCase, type LoadCombination, type Material, type Member, type MemberDistributedLoad, type MemberPointLoad, type ModelEntityKind, type NodalLoad, type Project, type Section, type Selection, type SelfWeightLoad, type Support, type SupportType, type Vector3 } from './types';

export interface HistoryState {
  project: Project;
  past: Project[];
  future: Project[];
}

export type ProjectAction =
  | { type: 'replace'; project: Project }
  | { type: 'update-project'; changes: Pick<Project, 'name' | 'description'> | { settings: Project['settings'] } }
  | { type: 'add-node'; position: { x: number; y: number; z: number } }
  | { type: 'update-node'; id: string; changes: Partial<Pick<Project['nodes'][number], 'name' | 'position'>> }
  | { type: 'translate-nodes'; ids: string[]; delta: Vector3 }
  | { type: 'add-member'; startNodeId: string; endNodeId: string }
  | { type: 'update-member'; id: string; changes: Partial<Pick<Member, 'name' | 'type' | 'materialId' | 'sectionId' | 'rollAngle'>> }
  | { type: 'update-member-releases'; id: string; endReleases: Member['endReleases'] }
  | { type: 'add-material' }
  | { type: 'update-material'; id: string; changes: Partial<Omit<Material, 'id'>> }
  | { type: 'delete-material'; id: string }
  | { type: 'add-section' }
  | { type: 'update-section'; id: string; changes: Partial<Omit<Section, 'id'>> }
  | { type: 'delete-section'; id: string }
  | { type: 'set-support'; nodeId: string; supportType: SupportType }
  | { type: 'update-support'; id: string; changes: Partial<Pick<Support, 'type' | 'restraints'>> }
  | { type: 'add-load-case' }
  | { type: 'update-load-case'; id: string; changes: Partial<Omit<LoadCase, 'id'>> }
  | { type: 'delete-load-case'; id: string }
  | { type: 'add-load-combination' }
  | { type: 'update-load-combination'; id: string; changes: Partial<Omit<LoadCombination, 'id'>> }
  | { type: 'delete-load-combination'; id: string }
  | { type: 'add-load'; nodeId: string }
  | { type: 'update-load'; id: string; changes: Partial<Pick<NodalLoad, 'name' | 'loadCaseId' | 'values'>> }
  | { type: 'add-member-point-load'; memberId: string }
  | { type: 'update-member-point-load'; id: string; changes: Partial<Omit<MemberPointLoad, 'id'>> }
  | { type: 'add-member-distributed-load'; memberId: string }
  | { type: 'update-member-distributed-load'; id: string; changes: Partial<Omit<MemberDistributedLoad, 'id'>> }
  | { type: 'add-self-weight-load' }
  | { type: 'update-self-weight-load'; id: string; changes: Partial<Omit<SelfWeightLoad, 'id'>> }
  | { type: 'delete-entity'; kind: ModelEntityKind; id: string }
  | { type: 'undo' }
  | { type: 'redo' };

function mutate(project: Project, action: Exclude<ProjectAction, { type: 'undo' | 'redo' }>): Project {
  const p = structuredClone(project);
  switch (action.type) {
    case 'replace': return action.project;
    case 'update-project': return withTimestamp({ ...p, ...action.changes, settings: 'settings' in action.changes ? action.changes.settings : p.settings });
    case 'add-node': {
      const index = p.nodes.length + 1;
      p.nodes.push({ id: createId('node'), name: `N${index}`, position: action.position });
      return withTimestamp(p);
    }
    case 'update-node': {
      const node = p.nodes.find((item) => item.id === action.id);
      if (node) Object.assign(node, action.changes);
      return withTimestamp(p);
    }
    case 'translate-nodes': {
      const ids = new Set(action.ids);
      if (!ids.size || !p.nodes.some((node) => ids.has(node.id))) return project;
      p.nodes = p.nodes.map((node) => ids.has(node.id) ? { ...node, position: { x: node.position.x + action.delta.x, y: node.position.y + action.delta.y, z: node.position.z + action.delta.z } } : node);
      return withTimestamp(p);
    }
    case 'add-member': {
      if (action.startNodeId === action.endNodeId || !p.nodes.some((node) => node.id === action.startNodeId) || !p.nodes.some((node) => node.id === action.endNodeId)) return project;
      p.members.push({ id: createId('member'), name: `M${p.members.length + 1}`, type: 'beam', startNodeId: action.startNodeId, endNodeId: action.endNodeId, materialId: p.materials[0]?.id ?? '', sectionId: p.sections[0]?.id ?? '', rollAngle: 0, endReleases: { start: [false, false, false, false, false, false], end: [false, false, false, false, false, false] } });
      return withTimestamp(p);
    }
    case 'update-member': {
      const member = p.members.find((item) => item.id === action.id);
      if (member) Object.assign(member, action.changes);
      return withTimestamp(p);
    }
    case 'update-member-releases': {
      const member = p.members.find((item) => item.id === action.id);
      if (member) member.endReleases = action.endReleases;
      return withTimestamp(p);
    }
    case 'add-material': {
      p.materials.push({ id: createId('material'), name: `Material ${p.materials.length + 1}`, kind: 'custom', elasticModulus: 200e9, poissonRatio: 0.3, density: 7850 });
      return withTimestamp(p);
    }
    case 'update-material': {
      const material = p.materials.find((item) => item.id === action.id);
      if (material) Object.assign(material, action.changes);
      return withTimestamp(p);
    }
    case 'delete-material': {
      if (p.members.some((member) => member.materialId === action.id)) return project;
      p.materials = p.materials.filter((item) => item.id !== action.id);
      return withTimestamp(p);
    }
    case 'add-section': {
      p.sections.push({ id: createId('section'), name: `Section ${p.sections.length + 1}`, shape: 'custom', area: 0.01, iy: 0.00001, iz: 0.00001, torsionalConstant: 0.00001 });
      return withTimestamp(p);
    }
    case 'update-section': {
      const section = p.sections.find((item) => item.id === action.id);
      if (section) Object.assign(section, action.changes);
      return withTimestamp(p);
    }
    case 'delete-section': {
      if (p.members.some((member) => member.sectionId === action.id)) return project;
      p.sections = p.sections.filter((item) => item.id !== action.id);
      return withTimestamp(p);
    }
    case 'set-support': {
      const prior = p.supports.find((item) => item.nodeId === action.nodeId);
      const restraints = action.supportType === 'custom' ? [false, false, false, false, false, false] as Support['restraints'] : [...RESTRAINTS[action.supportType]] as Support['restraints'];
      if (prior) { prior.type = action.supportType; prior.restraints = restraints; }
      else p.supports.push({ id: createId('support'), nodeId: action.nodeId, type: action.supportType, restraints });
      return withTimestamp(p);
    }
    case 'update-support': {
      const support = p.supports.find((item) => item.id === action.id);
      if (support) { Object.assign(support, action.changes); if (action.changes.type && action.changes.type !== 'custom') support.restraints = [...RESTRAINTS[action.changes.type]] as Support['restraints']; }
      return withTimestamp(p);
    }
    case 'add-load-case': {
      p.loadCases.push({ id: createId('load-case'), name: `Load Case ${p.loadCases.length + 1}`, category: 'other', isActive: p.loadCases.length === 0 });
      return withTimestamp(p);
    }
    case 'update-load-case': {
      const loadCase = p.loadCases.find((item) => item.id === action.id);
      if (loadCase) { if (action.changes.isActive) p.loadCases.forEach((item) => { item.isActive = false; }); Object.assign(loadCase, action.changes); }
      return withTimestamp(p);
    }
    case 'delete-load-case': {
      if (p.loadCases.length <= 1 || p.nodalLoads.some((load) => load.loadCaseId === action.id) || p.memberPointLoads.some((load) => load.loadCaseId === action.id) || p.memberDistributedLoads.some((load) => load.loadCaseId === action.id) || p.selfWeightLoads.some((load) => load.loadCaseId === action.id) || p.loadCombinations.some((combination) => combination.factors.some((factor) => factor.loadCaseId === action.id))) return project;
      p.loadCases = p.loadCases.filter((item) => item.id !== action.id);
      return withTimestamp(p);
    }
    case 'add-load-combination': {
      const loadCase = p.loadCases[0];
      if (!loadCase) return project;
      p.loadCombinations.push({ id: createId('combination'), name: `Combination ${p.loadCombinations.length + 1}`, factors: [{ loadCaseId: loadCase.id, factor: 1 }] });
      return withTimestamp(p);
    }
    case 'update-load-combination': {
      const combination = p.loadCombinations.find((item) => item.id === action.id);
      if (combination) Object.assign(combination, action.changes);
      return withTimestamp(p);
    }
    case 'delete-load-combination': {
      p.loadCombinations = p.loadCombinations.filter((item) => item.id !== action.id);
      return withTimestamp(p);
    }
    case 'add-load': {
      const loadCase = p.loadCases.find((item) => item.isActive) ?? p.loadCases[0];
      if (!loadCase) return project;
      p.nodalLoads.push({ id: createId('load'), nodeId: action.nodeId, loadCaseId: loadCase.id, values: { fx: 0, fy: -10_000, fz: 0, mx: 0, my: 0, mz: 0 }, name: `P${p.nodalLoads.length + 1}` });
      return withTimestamp(p);
    }
    case 'update-load': {
      const load = p.nodalLoads.find((item) => item.id === action.id);
      if (load) Object.assign(load, action.changes);
      return withTimestamp(p);
    }
    case 'add-member-point-load': {
      const loadCase = p.loadCases.find((item) => item.isActive) ?? p.loadCases[0];
      if (!loadCase || !p.members.some((member) => member.id === action.memberId)) return project;
      p.memberPointLoads.push({ id: createId('member-point-load'), memberId: action.memberId, loadCaseId: loadCase.id, direction: 'global-y', magnitude: -10_000, position: 0.5, name: `MP${p.memberPointLoads.length + 1}` });
      return withTimestamp(p);
    }
    case 'update-member-point-load': {
      const load = p.memberPointLoads.find((item) => item.id === action.id);
      if (load) Object.assign(load, action.changes);
      return withTimestamp(p);
    }
    case 'add-member-distributed-load': {
      const loadCase = p.loadCases.find((item) => item.isActive) ?? p.loadCases[0];
      if (!loadCase || !p.members.some((member) => member.id === action.memberId)) return project;
      p.memberDistributedLoads.push({ id: createId('member-distributed-load'), memberId: action.memberId, loadCaseId: loadCase.id, direction: 'global-y', startMagnitude: -5_000, endMagnitude: -5_000, name: `UDL${p.memberDistributedLoads.length + 1}` });
      return withTimestamp(p);
    }
    case 'update-member-distributed-load': {
      const load = p.memberDistributedLoads.find((item) => item.id === action.id);
      if (load) Object.assign(load, action.changes);
      return withTimestamp(p);
    }
    case 'add-self-weight-load': {
      const loadCase = p.loadCases.find((item) => item.isActive) ?? p.loadCases[0];
      if (!loadCase) return project;
      p.selfWeightLoads.push({ id: createId('self-weight'), name: `Self weight ${p.selfWeightLoads.length + 1}`, loadCaseId: loadCase.id, direction: 'global-y', factor: -1 });
      return withTimestamp(p);
    }
    case 'update-self-weight-load': {
      const load = p.selfWeightLoads.find((item) => item.id === action.id);
      if (load) Object.assign(load, action.changes);
      return withTimestamp(p);
    }
    case 'delete-entity': {
      if (action.kind === 'node') {
        p.nodes = p.nodes.filter((item) => item.id !== action.id);
        p.members = p.members.filter((item) => item.startNodeId !== action.id && item.endNodeId !== action.id);
        p.supports = p.supports.filter((item) => item.nodeId !== action.id);
        p.nodalLoads = p.nodalLoads.filter((item) => item.nodeId !== action.id);
      } else if (action.kind === 'member') {
        p.members = p.members.filter((item) => item.id !== action.id);
        p.memberPointLoads = p.memberPointLoads.filter((item) => item.memberId !== action.id);
        p.memberDistributedLoads = p.memberDistributedLoads.filter((item) => item.memberId !== action.id);
      }
      else if (action.kind === 'support') p.supports = p.supports.filter((item) => item.id !== action.id);
      else if (action.kind === 'nodalLoad') p.nodalLoads = p.nodalLoads.filter((item) => item.id !== action.id);
      else if (action.kind === 'memberPointLoad') p.memberPointLoads = p.memberPointLoads.filter((item) => item.id !== action.id);
      else if (action.kind === 'memberDistributedLoad') p.memberDistributedLoads = p.memberDistributedLoads.filter((item) => item.id !== action.id);
      else p.selfWeightLoads = p.selfWeightLoads.filter((item) => item.id !== action.id);
      return withTimestamp(p);
    }
  }
}

export function historyReducer(state: HistoryState, action: ProjectAction): HistoryState {
  if (action.type === 'undo') return state.past.length ? { project: state.past.at(-1)!, past: state.past.slice(0, -1), future: [state.project, ...state.future] } : state;
  if (action.type === 'redo') return state.future.length ? { project: state.future[0], past: [...state.past, state.project], future: state.future.slice(1) } : state;
  const next = mutate(state.project, action);
  if (next === state.project) return state;
  return { project: next, past: [...state.past.slice(-49), state.project], future: [] };
}

export function findSelection(project: Project, selection: Selection | null): unknown | null {
  if (!selection) return null;
  const maps: Record<ModelEntityKind, { id: string }[]> = { node: project.nodes, member: project.members, support: project.supports, nodalLoad: project.nodalLoads, memberPointLoad: project.memberPointLoads, memberDistributedLoad: project.memberDistributedLoads, selfWeightLoad: project.selfWeightLoads };
  return maps[selection.kind].find((item) => item.id === selection.id) ?? null;
}
