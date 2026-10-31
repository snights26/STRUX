import { createId, withTimestamp } from './project';
import { RESTRAINTS, type Member, type ModelEntityKind, type NodalLoad, type Project, type Selection, type Support, type SupportType } from './types';

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
  | { type: 'add-member'; startNodeId: string; endNodeId: string }
  | { type: 'update-member'; id: string; changes: Partial<Pick<Member, 'name' | 'type' | 'materialId' | 'sectionId' | 'rollAngle'>> }
  | { type: 'set-support'; nodeId: string; supportType: SupportType }
  | { type: 'update-support'; id: string; changes: Partial<Pick<Support, 'type' | 'restraints'>> }
  | { type: 'add-load'; nodeId: string }
  | { type: 'update-load'; id: string; changes: Partial<Pick<NodalLoad, 'name' | 'loadCaseId' | 'values'>> }
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
    case 'add-member': {
      if (action.startNodeId === action.endNodeId || !p.nodes.some((node) => node.id === action.startNodeId) || !p.nodes.some((node) => node.id === action.endNodeId)) return project;
      p.members.push({ id: createId('member'), name: `M${p.members.length + 1}`, type: 'beam', startNodeId: action.startNodeId, endNodeId: action.endNodeId, materialId: p.materials[0]?.id ?? '', sectionId: p.sections[0]?.id ?? '', rollAngle: 0 });
      return withTimestamp(p);
    }
    case 'update-member': {
      const member = p.members.find((item) => item.id === action.id);
      if (member) Object.assign(member, action.changes);
      return withTimestamp(p);
    }
    case 'set-support': {
      const prior = p.supports.find((item) => item.nodeId === action.nodeId);
      const restraints = action.supportType === 'custom' ? [false, false, false, false, false, false] as Support['restraints'] : RESTRAINTS[action.supportType];
      if (prior) { prior.type = action.supportType; prior.restraints = restraints; }
      else p.supports.push({ id: createId('support'), nodeId: action.nodeId, type: action.supportType, restraints });
      return withTimestamp(p);
    }
    case 'update-support': {
      const support = p.supports.find((item) => item.id === action.id);
      if (support) { Object.assign(support, action.changes); if (action.changes.type && action.changes.type !== 'custom') support.restraints = RESTRAINTS[action.changes.type]; }
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
    case 'delete-entity': {
      if (action.kind === 'node') {
        p.nodes = p.nodes.filter((item) => item.id !== action.id);
        p.members = p.members.filter((item) => item.startNodeId !== action.id && item.endNodeId !== action.id);
        p.supports = p.supports.filter((item) => item.nodeId !== action.id);
        p.nodalLoads = p.nodalLoads.filter((item) => item.nodeId !== action.id);
      } else if (action.kind === 'member') p.members = p.members.filter((item) => item.id !== action.id);
      else if (action.kind === 'support') p.supports = p.supports.filter((item) => item.id !== action.id);
      else p.nodalLoads = p.nodalLoads.filter((item) => item.id !== action.id);
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
  const maps: Record<ModelEntityKind, { id: string }[]> = { node: project.nodes, member: project.members, support: project.supports, nodalLoad: project.nodalLoads };
  return maps[selection.kind].find((item) => item.id === selection.id) ?? null;
}
