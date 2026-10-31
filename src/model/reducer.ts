import { createId, withTimestamp } from './project';
import { gridIntersection } from './building';
import { generateSlabMesh, generateWallMesh } from './mesh';
import { RESTRAINTS, type BuildingGridLine, type Diaphragm, type ImposedDisplacement, type LoadCase, type LoadCombination, type Material, type Member, type MemberDistributedLoad, type MemberPointLoad, type MeshDensitySettings, type ModelEntityKind, type NodalLoad, type NodalSpring, type Project, type RigidLink, type Section, type Selection, type SelfWeightLoad, type SeismicLoadDefinition, type SettlementDefinition, type Slab, type Storey, type StructuralWall, type Support, type SupportType, type SurfacePressureLoad, type ThermalLoad, type Vector3, type WindLoadDefinition } from './types';

export interface HistoryState {
  project: Project;
  past: Project[];
  future: Project[];
}

export type ProjectAction =
  | { type: 'replace'; project: Project }
  | { type: 'update-project'; changes: Pick<Project, 'name' | 'description'> | { settings: Project['settings'] } }
  | { type: 'add-node'; position: { x: number; y: number; z: number }; storeyId?: string }
  | { type: 'update-node'; id: string; changes: Partial<Pick<Project['nodes'][number], 'name' | 'position'>> }
  | { type: 'translate-nodes'; ids: string[]; delta: Vector3 }
  | { type: 'add-member'; startNodeId: string; endNodeId: string }
  | { type: 'update-member'; id: string; changes: Partial<Pick<Member, 'name' | 'type' | 'materialId' | 'sectionId' | 'rollAngle' | 'endOffsets'>> }
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
  | { type: 'add-surface-pressure-load'; surfaceMeshId: string }
  | { type: 'update-surface-pressure-load'; id: string; changes: Partial<Omit<SurfacePressureLoad, 'id'>> }
  | { type: 'add-storey' }
  | { type: 'update-storey'; id: string; changes: Partial<Omit<Storey, 'id'>> }
  | { type: 'delete-storey'; id: string }
  | { type: 'update-building-settings'; changes: Partial<Pick<Project['building'], 'typicalStoreyHeight'>> }
  | { type: 'add-grid-line'; axis: BuildingGridLine['axis'] }
  | { type: 'update-grid-line'; id: string; changes: Partial<Omit<BuildingGridLine, 'id'>> }
  | { type: 'delete-grid-line'; id: string }
  | { type: 'generate-building-column'; xLineId: string; zLineId: string; startStoreyId: string; endStoreyId: string; materialId?: string; sectionId?: string }
  | { type: 'generate-building-beam'; startXLineId: string; startZLineId: string; endXLineId: string; endZLineId: string; storeyId: string; materialId?: string; sectionId?: string }
  | { type: 'copy-storey-members'; sourceStoreyId: string; targetStoreyId: string }
  | { type: 'add-slab'; storeyId: string; boundaryNodeIds: string[]; materialId?: string; thickness?: number }
  | { type: 'update-slab'; id: string; changes: Partial<Omit<Slab, 'id'>> }
  | { type: 'add-slab-opening'; slabId: string; boundaryNodeIds: string[] }
  | { type: 'delete-slab-opening'; slabId: string; openingId: string }
  | { type: 'add-wall'; storeyId: string; startNodeId: string; endNodeId: string; materialId?: string; thickness?: number }
  | { type: 'update-wall'; id: string; changes: Partial<Omit<StructuralWall, 'id'>> }
  | { type: 'generate-slab-mesh'; slabId: string; density?: MeshDensitySettings }
  | { type: 'generate-wall-mesh'; wallId: string; density?: MeshDensitySettings }
  | { type: 'delete-surface-mesh'; id: string }
  | { type: 'add-diaphragm'; storeyId: string; nodeIds: string[]; diaphragmType?: Diaphragm['type'] }
  | { type: 'update-diaphragm'; id: string; changes: Partial<Omit<Diaphragm, 'id'>> }
  | { type: 'add-nodal-spring'; nodeId: string }
  | { type: 'update-nodal-spring'; id: string; changes: Partial<Omit<NodalSpring, 'id'>> }
  | { type: 'add-settlement'; nodeId: string }
  | { type: 'update-settlement'; id: string; changes: Partial<Omit<SettlementDefinition, 'id'>> }
  | { type: 'add-rigid-link'; masterNodeId: string; slaveNodeId: string }
  | { type: 'update-rigid-link'; id: string; changes: Partial<Omit<RigidLink, 'id'>> }
  | { type: 'add-thermal-load'; memberId: string }
  | { type: 'update-thermal-load'; id: string; changes: Partial<Omit<ThermalLoad, 'id'>> }
  | { type: 'add-imposed-displacement'; nodeId: string }
  | { type: 'update-imposed-displacement'; id: string; changes: Partial<Omit<ImposedDisplacement, 'id'>> }
  | { type: 'add-wind-load' }
  | { type: 'update-wind-load'; id: string; changes: Partial<Omit<WindLoadDefinition, 'id'>> }
  | { type: 'add-seismic-load' }
  | { type: 'update-seismic-load'; id: string; changes: Partial<Omit<SeismicLoadDefinition, 'id'>> }
  | { type: 'delete-entity'; kind: ModelEntityKind; id: string }
  | { type: 'undo' }
  | { type: 'redo' };

function mutate(project: Project, action: Exclude<ProjectAction, { type: 'undo' | 'redo' }>): Project {
  const p = structuredClone(project);
  const defaultMember = (startNodeId: string, endNodeId: string, type: Member['type'], storeyId?: string, endStoreyId?: string, materialId = p.materials[0]?.id ?? '', sectionId = p.sections[0]?.id ?? ''): Member => ({ id: createId('member'), name: `M${p.members.length + 1}`, type, startNodeId, endNodeId, materialId, sectionId, rollAngle: 0, endReleases: { start: [false, false, false, false, false, false], end: [false, false, false, false, false, false] }, ...(storeyId ? { storeyId } : {}), ...(endStoreyId ? { endStoreyId } : {}) });
  const nodeAtStorey = (storeyId: string, x: number, z: number) => {
    const storey = p.building.storeys.find((item) => item.id === storeyId);
    if (!storey) return undefined;
    const existing = p.nodes.find((node) => node.storeyId === storeyId && Math.abs(node.position.x - x) <= 1e-8 && Math.abs(node.position.y - storey.elevation) <= 1e-8 && Math.abs(node.position.z - z) <= 1e-8);
    if (existing) return existing;
    const node = { id: createId('node'), name: `N${p.nodes.length + 1}`, position: { x, y: storey.elevation, z }, storeyId };
    p.nodes.push(node); return node;
  };
  switch (action.type) {
    case 'replace': return action.project;
    case 'update-project': return withTimestamp({ ...p, ...action.changes, settings: 'settings' in action.changes ? action.changes.settings : p.settings });
    case 'add-node': {
      const index = p.nodes.length + 1;
      p.nodes.push({ id: createId('node'), name: `N${index}`, position: action.position, ...(action.storeyId ? { storeyId: action.storeyId } : {}) });
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
      p.members.push(defaultMember(action.startNodeId, action.endNodeId, 'beam'));
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
      if (p.members.some((member) => member.materialId === action.id) || p.building.slabs.some((slab) => slab.materialId === action.id) || p.building.walls.some((wall) => wall.materialId === action.id)) return project;
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
      if (p.loadCases.length <= 1 || p.nodalLoads.some((load) => load.loadCaseId === action.id) || p.memberPointLoads.some((load) => load.loadCaseId === action.id) || p.memberDistributedLoads.some((load) => load.loadCaseId === action.id) || p.selfWeightLoads.some((load) => load.loadCaseId === action.id) || p.surfacePressureLoads.some((load) => load.loadCaseId === action.id) || p.settlements.some((item) => item.loadCaseId === action.id) || p.thermalLoads.some((item) => item.loadCaseId === action.id) || p.imposedDisplacements.some((item) => item.loadCaseId === action.id) || p.windLoads.some((item) => item.loadCaseId === action.id) || p.seismicLoads.some((item) => item.loadCaseId === action.id) || p.loadCombinations.some((combination) => combination.factors.some((factor) => factor.loadCaseId === action.id))) return project;
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
    case 'add-storey': {
      const roof = p.building.storeys.find((storey) => storey.role === 'roof');
      if (!roof) return project;
      const oldRoofElevation = roof.elevation;
      roof.elevation += p.building.typicalStoreyHeight;
      p.nodes = p.nodes.map((node) => node.storeyId === roof.id ? { ...node, position: { ...node.position, y: node.position.y + p.building.typicalStoreyHeight } } : node);
      p.building.storeys.push({ id: createId('storey'), name: `Level ${p.building.storeys.filter((storey) => storey.role === 'typical').length + 1}`, elevation: oldRoofElevation, height: p.building.typicalStoreyHeight, role: 'typical' });
      return withTimestamp(p);
    }
    case 'update-storey': {
      const storey = p.building.storeys.find((item) => item.id === action.id);
      if (!storey) return project;
      const priorElevation = storey.elevation;
      Object.assign(storey, action.changes);
      if (action.changes.elevation !== undefined) {
        const delta = storey.elevation - priorElevation;
        p.nodes = p.nodes.map((node) => node.storeyId === storey.id ? { ...node, position: { ...node.position, y: node.position.y + delta } } : node);
      }
      return withTimestamp(p);
    }
    case 'delete-storey': {
      const storey = p.building.storeys.find((item) => item.id === action.id);
      const hasDependencies = p.nodes.some((node) => node.storeyId === action.id)
        || p.members.some((member) => member.storeyId === action.id || member.endStoreyId === action.id)
        || p.building.slabs.some((slab) => slab.storeyId === action.id)
        || p.building.walls.some((wall) => wall.storeyId === action.id)
        || p.building.diaphragms.some((diaphragm) => diaphragm.storeyId === action.id);
      if (!storey || p.building.storeys.length <= 2 || hasDependencies) return project;
      const remaining = p.building.storeys.filter((item) => item.id !== action.id);
      // Ground and roof levels are removable only when an unreferenced typical
      // level can take the required role, keeping every persisted building valid.
      if (storey.role === 'ground') {
        const replacement = [...remaining].sort((left, right) => left.elevation - right.elevation)[0];
        if (!replacement || replacement.role !== 'typical') return project;
        replacement.role = 'ground';
      }
      if (storey.role === 'roof') {
        const replacement = [...remaining].sort((left, right) => right.elevation - left.elevation)[0];
        if (!replacement || replacement.role !== 'typical') return project;
        replacement.role = 'roof';
      }
      p.building.storeys = remaining;
      return withTimestamp(p);
    }
    case 'update-building-settings': {
      Object.assign(p.building, action.changes);
      return withTimestamp(p);
    }
    case 'add-grid-line': {
      const sameAxis = p.building.gridLines.filter((line) => line.axis === action.axis);
      const coordinate = sameAxis.length ? Math.max(...sameAxis.map((line) => line.coordinate)) + 6 : 0;
      const label = action.axis === 'x' ? String.fromCharCode(65 + sameAxis.length) : String(sameAxis.length + 1);
      p.building.gridLines.push({ id: createId('grid'), axis: action.axis, label, coordinate });
      return withTimestamp(p);
    }
    case 'update-grid-line': {
      const line = p.building.gridLines.find((item) => item.id === action.id);
      if (!line) return project;
      Object.assign(line, action.changes);
      return withTimestamp(p);
    }
    case 'delete-grid-line': {
      const line = p.building.gridLines.find((item) => item.id === action.id);
      if (!line || p.building.gridLines.filter((item) => item.axis === line.axis).length <= 1) return project;
      p.building.gridLines = p.building.gridLines.filter((item) => item.id !== action.id);
      return withTimestamp(p);
    }
    case 'generate-building-column': {
      const point = gridIntersection(p, action.xLineId, action.zLineId); const start = p.building.storeys.find((storey) => storey.id === action.startStoreyId); const end = p.building.storeys.find((storey) => storey.id === action.endStoreyId);
      if (!point || !start || !end || start.id === end.id || start.elevation >= end.elevation) return project;
      const startNode = nodeAtStorey(start.id, point.x, point.z)!; const endNode = nodeAtStorey(end.id, point.x, point.z)!;
      if (p.members.some((member) => member.startNodeId === startNode.id && member.endNodeId === endNode.id)) return project;
      p.members.push(defaultMember(startNode.id, endNode.id, 'column', start.id, end.id, action.materialId, action.sectionId));
      return withTimestamp(p);
    }
    case 'generate-building-beam': {
      const startPoint = gridIntersection(p, action.startXLineId, action.startZLineId); const endPoint = gridIntersection(p, action.endXLineId, action.endZLineId); const storey = p.building.storeys.find((item) => item.id === action.storeyId);
      if (!startPoint || !endPoint || !storey || (Math.abs(startPoint.x - endPoint.x) <= 1e-8 && Math.abs(startPoint.z - endPoint.z) <= 1e-8)) return project;
      const startNode = nodeAtStorey(storey.id, startPoint.x, startPoint.z)!; const endNode = nodeAtStorey(storey.id, endPoint.x, endPoint.z)!;
      if (p.members.some((member) => member.startNodeId === startNode.id && member.endNodeId === endNode.id)) return project;
      p.members.push(defaultMember(startNode.id, endNode.id, 'beam', storey.id, undefined, action.materialId, action.sectionId));
      return withTimestamp(p);
    }
    case 'copy-storey-members': {
      const source = p.building.storeys.find((item) => item.id === action.sourceStoreyId); const target = p.building.storeys.find((item) => item.id === action.targetStoreyId);
      if (!source || !target || source.id === target.id) return project;
      const sourceNodes = new Map(p.nodes.filter((node) => node.storeyId === source.id).map((node) => [node.id, node]));
      const copyable = p.members.filter((member) => member.storeyId === source.id && !member.endStoreyId && sourceNodes.has(member.startNodeId) && sourceNodes.has(member.endNodeId));
      if (!copyable.length) return project;
      for (const member of copyable) {
        const start = sourceNodes.get(member.startNodeId)!; const end = sourceNodes.get(member.endNodeId)!;
        const startNode = nodeAtStorey(target.id, start.position.x, start.position.z)!; const endNode = nodeAtStorey(target.id, end.position.x, end.position.z)!;
        if (!p.members.some((item) => item.startNodeId === startNode.id && item.endNodeId === endNode.id)) p.members.push({ ...member, id: createId('member'), name: `M${p.members.length + 1}`, startNodeId: startNode.id, endNodeId: endNode.id, storeyId: target.id });
      }
      return withTimestamp(p);
    }
    case 'add-slab': {
      if (!p.building.storeys.some((storey) => storey.id === action.storeyId) || action.boundaryNodeIds.length < 3) return project;
      p.building.slabs.push({ id: createId('slab'), name: `Slab ${p.building.slabs.length + 1}`, storeyId: action.storeyId, boundaryNodeIds: [...action.boundaryNodeIds], thickness: action.thickness ?? 0.15, materialId: action.materialId ?? p.materials[0]?.id ?? '', openings: [] });
      return withTimestamp(p);
    }
    case 'update-slab': {
      const slab = p.building.slabs.find((item) => item.id === action.id);
      if (!slab) return project;
      Object.assign(slab, action.changes);
      return withTimestamp(p);
    }
    case 'add-slab-opening': {
      const slab = p.building.slabs.find((item) => item.id === action.slabId);
      if (!slab || action.boundaryNodeIds.length < 3) return project;
      slab.openings.push({ id: createId('opening'), name: `Opening ${slab.openings.length + 1}`, boundaryNodeIds: [...action.boundaryNodeIds] });
      return withTimestamp(p);
    }
    case 'delete-slab-opening': {
      const slab = p.building.slabs.find((item) => item.id === action.slabId);
      if (!slab) return project;
      slab.openings = slab.openings.filter((opening) => opening.id !== action.openingId);
      return withTimestamp(p);
    }
    case 'add-wall': {
      if (!p.building.storeys.some((storey) => storey.id === action.storeyId) || action.startNodeId === action.endNodeId) return project;
      p.building.walls.push({ id: createId('wall'), name: `Wall ${p.building.walls.length + 1}`, storeyId: action.storeyId, startNodeId: action.startNodeId, endNodeId: action.endNodeId, thickness: action.thickness ?? 0.2, materialId: action.materialId ?? p.materials[0]?.id ?? '' });
      return withTimestamp(p);
    }
    case 'update-wall': {
      const wall = p.building.walls.find((item) => item.id === action.id);
      if (!wall) return project;
      Object.assign(wall, action.changes);
      return withTimestamp(p);
    }
    case 'generate-slab-mesh': {
      const meshId = createId('surface-mesh'); const generated = generateSlabMesh(p, action.slabId, meshId, action.density);
      if (!generated.mesh || generated.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return project;
      const replaced = p.building.surfaceMeshes.find((mesh) => mesh.sourceKind === 'slab' && mesh.sourceId === action.slabId);
      if (replaced) for (const load of p.surfacePressureLoads) if (load.surfaceMeshId === replaced.id) load.surfaceMeshId = meshId;
      p.building.surfaceMeshes = p.building.surfaceMeshes.filter((mesh) => !(mesh.sourceKind === 'slab' && mesh.sourceId === action.slabId));
      p.building.surfaceMeshes.push(generated.mesh); return withTimestamp(p);
    }
    case 'generate-wall-mesh': {
      const meshId = createId('surface-mesh'); const generated = generateWallMesh(p, action.wallId, meshId, action.density);
      if (!generated.mesh || generated.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return project;
      const replaced = p.building.surfaceMeshes.find((mesh) => mesh.sourceKind === 'wall' && mesh.sourceId === action.wallId);
      if (replaced) for (const load of p.surfacePressureLoads) if (load.surfaceMeshId === replaced.id) load.surfaceMeshId = meshId;
      p.building.surfaceMeshes = p.building.surfaceMeshes.filter((mesh) => !(mesh.sourceKind === 'wall' && mesh.sourceId === action.wallId));
      p.building.surfaceMeshes.push(generated.mesh); return withTimestamp(p);
    }
    case 'delete-surface-mesh': {
      if (p.surfacePressureLoads.some((load) => load.surfaceMeshId === action.id)) return project;
      p.building.surfaceMeshes = p.building.surfaceMeshes.filter((mesh) => mesh.id !== action.id); return withTimestamp(p);
    }
    case 'add-diaphragm': {
      if (!p.building.storeys.some((storey) => storey.id === action.storeyId) || action.nodeIds.length < 3) return project;
      const type = action.diaphragmType ?? 'rigid';
      p.building.diaphragms.push({ id: createId('diaphragm'), name: `Diaphragm ${p.building.diaphragms.length + 1}`, storeyId: action.storeyId, type, nodeIds: [...action.nodeIds], ...(type === 'semi-rigid' ? { inPlaneStiffness: 1e8 } : {}) });
      return withTimestamp(p);
    }
    case 'update-diaphragm': {
      const diaphragm = p.building.diaphragms.find((item) => item.id === action.id);
      if (!diaphragm) return project;
      Object.assign(diaphragm, action.changes); return withTimestamp(p);
    }
    case 'add-nodal-spring': {
      if (!p.nodes.some((node) => node.id === action.nodeId)) return project;
      p.nodalSprings.push({ id: createId('nodal-spring'), name: `Spring ${p.nodalSprings.length + 1}`, nodeId: action.nodeId, stiffness: { kx: 0, ky: 1e6, kz: 0, krx: 0, kry: 0, krz: 0 } });
      return withTimestamp(p);
    }
    case 'update-nodal-spring': {
      const spring = p.nodalSprings.find((item) => item.id === action.id);
      if (!spring) return project;
      Object.assign(spring, action.changes); return withTimestamp(p);
    }
    case 'add-settlement': {
      const loadCase = p.loadCases.find((item) => item.isActive) ?? p.loadCases[0];
      if (!loadCase || !p.nodes.some((node) => node.id === action.nodeId)) return project;
      p.settlements.push({ id: createId('settlement'), name: `Settlement ${p.settlements.length + 1}`, nodeId: action.nodeId, loadCaseId: loadCase.id, values: { ux: 0, uy: -0.001, uz: 0, rx: 0, ry: 0, rz: 0 } });
      return withTimestamp(p);
    }
    case 'update-settlement': {
      const settlement = p.settlements.find((item) => item.id === action.id);
      if (!settlement) return project;
      Object.assign(settlement, action.changes); return withTimestamp(p);
    }
    case 'add-rigid-link': {
      if (action.masterNodeId === action.slaveNodeId || !p.nodes.some((node) => node.id === action.masterNodeId) || !p.nodes.some((node) => node.id === action.slaveNodeId)) return project;
      p.rigidLinks.push({ id: createId('rigid-link'), name: `Rigid link ${p.rigidLinks.length + 1}`, masterNodeId: action.masterNodeId, slaveNodeId: action.slaveNodeId, restrainedDofs: [true, true, true, true, true, true] });
      return withTimestamp(p);
    }
    case 'update-rigid-link': {
      const link = p.rigidLinks.find((item) => item.id === action.id);
      if (!link) return project;
      Object.assign(link, action.changes); return withTimestamp(p);
    }
    case 'add-thermal-load': {
      const loadCase = p.loadCases.find((item) => item.isActive) ?? p.loadCases[0];
      if (!loadCase || !p.members.some((member) => member.id === action.memberId)) return project;
      p.thermalLoads.push({ id: createId('thermal-load'), name: `Thermal ${p.thermalLoads.length + 1}`, memberId: action.memberId, loadCaseId: loadCase.id, deltaTemperature: 20, thermalExpansionCoefficient: 12e-6 });
      return withTimestamp(p);
    }
    case 'update-thermal-load': {
      const load = p.thermalLoads.find((item) => item.id === action.id);
      if (!load) return project;
      Object.assign(load, action.changes); return withTimestamp(p);
    }
    case 'add-imposed-displacement': {
      const loadCase = p.loadCases.find((item) => item.isActive) ?? p.loadCases[0];
      if (!loadCase || !p.nodes.some((node) => node.id === action.nodeId)) return project;
      p.imposedDisplacements.push({ id: createId('imposed-displacement'), name: `Imposed displacement ${p.imposedDisplacements.length + 1}`, nodeId: action.nodeId, loadCaseId: loadCase.id, values: { ux: 0.001, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 } });
      return withTimestamp(p);
    }
    case 'update-imposed-displacement': {
      const displacement = p.imposedDisplacements.find((item) => item.id === action.id);
      if (!displacement) return project;
      Object.assign(displacement, action.changes); return withTimestamp(p);
    }
    case 'add-wind-load': {
      const loadCase = p.loadCases.find((item) => item.category === 'wind') ?? p.loadCases.find((item) => item.isActive) ?? p.loadCases[0];
      if (!loadCase) return project;
      p.windLoads.push({ id: createId('wind-load'), name: `Wind input ${p.windLoads.length + 1}`, loadCaseId: loadCase.id, direction: 'global-x', pressure: 1000 });
      return withTimestamp(p);
    }
    case 'update-wind-load': {
      const load = p.windLoads.find((item) => item.id === action.id);
      if (!load) return project;
      Object.assign(load, action.changes); return withTimestamp(p);
    }
    case 'add-seismic-load': {
      const loadCase = p.loadCases.find((item) => item.category === 'seismic') ?? p.loadCases.find((item) => item.isActive) ?? p.loadCases[0];
      if (!loadCase) return project;
      p.seismicLoads.push({ id: createId('seismic-load'), name: `Seismic input ${p.seismicLoads.length + 1}`, loadCaseId: loadCase.id, direction: 'global-x', designAcceleration: 1, importanceFactor: 1, responseReductionFactor: 1 });
      return withTimestamp(p);
    }
    case 'update-seismic-load': {
      const load = p.seismicLoads.find((item) => item.id === action.id);
      if (!load) return project;
      Object.assign(load, action.changes); return withTimestamp(p);
    }
    case 'add-surface-pressure-load': {
      const loadCase = p.loadCases.find((item) => item.isActive) ?? p.loadCases[0];
      if (!loadCase || !p.building.surfaceMeshes.some((mesh) => mesh.id === action.surfaceMeshId)) return project;
      p.surfacePressureLoads.push({ id: createId('surface-pressure-load'), name: `Surface pressure ${p.surfacePressureLoads.length + 1}`, surfaceMeshId: action.surfaceMeshId, loadCaseId: loadCase.id, pressure: 1000 });
      return withTimestamp(p);
    }
    case 'update-surface-pressure-load': {
      const load = p.surfacePressureLoads.find((item) => item.id === action.id);
      if (!load) return project;
      Object.assign(load, action.changes); return withTimestamp(p);
    }
    case 'delete-entity': {
      if (action.kind === 'node') {
        if (p.building.slabs.some((slab) => slab.boundaryNodeIds.includes(action.id) || slab.openings.some((opening) => opening.boundaryNodeIds.includes(action.id))) || p.building.walls.some((wall) => wall.startNodeId === action.id || wall.endNodeId === action.id) || p.building.diaphragms.some((diaphragm) => diaphragm.nodeIds.includes(action.id)) || p.nodalSprings.some((spring) => spring.nodeId === action.id) || p.settlements.some((settlement) => settlement.nodeId === action.id) || p.imposedDisplacements.some((displacement) => displacement.nodeId === action.id) || p.rigidLinks.some((link) => link.masterNodeId === action.id || link.slaveNodeId === action.id)) return project;
        p.nodes = p.nodes.filter((item) => item.id !== action.id);
        p.members = p.members.filter((item) => item.startNodeId !== action.id && item.endNodeId !== action.id);
        p.supports = p.supports.filter((item) => item.nodeId !== action.id);
        p.nodalLoads = p.nodalLoads.filter((item) => item.nodeId !== action.id);
      } else if (action.kind === 'member') {
        if (p.thermalLoads.some((load) => load.memberId === action.id)) return project;
        p.members = p.members.filter((item) => item.id !== action.id);
        p.memberPointLoads = p.memberPointLoads.filter((item) => item.memberId !== action.id);
        p.memberDistributedLoads = p.memberDistributedLoads.filter((item) => item.memberId !== action.id);
      }
      else if (action.kind === 'support') p.supports = p.supports.filter((item) => item.id !== action.id);
      else if (action.kind === 'nodalLoad') p.nodalLoads = p.nodalLoads.filter((item) => item.id !== action.id);
      else if (action.kind === 'memberPointLoad') p.memberPointLoads = p.memberPointLoads.filter((item) => item.id !== action.id);
      else if (action.kind === 'memberDistributedLoad') p.memberDistributedLoads = p.memberDistributedLoads.filter((item) => item.id !== action.id);
      else if (action.kind === 'selfWeightLoad') p.selfWeightLoads = p.selfWeightLoads.filter((item) => item.id !== action.id);
      else if (action.kind === 'surfacePressureLoad') p.surfacePressureLoads = p.surfacePressureLoads.filter((item) => item.id !== action.id);
      else if (action.kind === 'slab') { if (p.building.surfaceMeshes.some((mesh) => mesh.sourceKind === 'slab' && mesh.sourceId === action.id)) return project; p.building.slabs = p.building.slabs.filter((item) => item.id !== action.id); }
      else if (action.kind === 'wall') { if (p.building.surfaceMeshes.some((mesh) => mesh.sourceKind === 'wall' && mesh.sourceId === action.id)) return project; p.building.walls = p.building.walls.filter((item) => item.id !== action.id); }
      else if (action.kind === 'surfaceMesh') { if (p.surfacePressureLoads.some((load) => load.surfaceMeshId === action.id)) return project; p.building.surfaceMeshes = p.building.surfaceMeshes.filter((item) => item.id !== action.id); }
      else if (action.kind === 'diaphragm') { if (p.building.slabs.some((slab) => slab.diaphragmId === action.id)) return project; p.building.diaphragms = p.building.diaphragms.filter((item) => item.id !== action.id); }
      else if (action.kind === 'nodalSpring') p.nodalSprings = p.nodalSprings.filter((item) => item.id !== action.id);
      else if (action.kind === 'settlement') p.settlements = p.settlements.filter((item) => item.id !== action.id);
      else if (action.kind === 'rigidLink') p.rigidLinks = p.rigidLinks.filter((item) => item.id !== action.id);
      else if (action.kind === 'thermalLoad') p.thermalLoads = p.thermalLoads.filter((item) => item.id !== action.id);
      else if (action.kind === 'imposedDisplacement') p.imposedDisplacements = p.imposedDisplacements.filter((item) => item.id !== action.id);
      else if (action.kind === 'windLoad') p.windLoads = p.windLoads.filter((item) => item.id !== action.id);
      else if (action.kind === 'seismicLoad') p.seismicLoads = p.seismicLoads.filter((item) => item.id !== action.id);
      else if (action.kind === 'gridLine') {
        const line = p.building.gridLines.find((item) => item.id === action.id);
        if (!line || p.building.gridLines.filter((item) => item.axis === line.axis).length <= 1) return project;
        p.building.gridLines = p.building.gridLines.filter((item) => item.id !== action.id);
      } else if (action.kind === 'storey') {
        const storey = p.building.storeys.find((item) => item.id === action.id);
        if (!storey || storey.role !== 'typical' || p.nodes.some((node) => node.storeyId === action.id) || p.members.some((member) => member.storeyId === action.id || member.endStoreyId === action.id) || p.building.slabs.some((slab) => slab.storeyId === action.id) || p.building.walls.some((wall) => wall.storeyId === action.id) || p.building.diaphragms.some((diaphragm) => diaphragm.storeyId === action.id)) return project;
        p.building.storeys = p.building.storeys.filter((item) => item.id !== action.id);
      }
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
  const maps: Record<ModelEntityKind, { id: string }[]> = { node: project.nodes, member: project.members, support: project.supports, nodalLoad: project.nodalLoads, memberPointLoad: project.memberPointLoads, memberDistributedLoad: project.memberDistributedLoads, selfWeightLoad: project.selfWeightLoads, surfacePressureLoad: project.surfacePressureLoads, storey: project.building.storeys, gridLine: project.building.gridLines, slab: project.building.slabs, wall: project.building.walls, surfaceMesh: project.building.surfaceMeshes, diaphragm: project.building.diaphragms, nodalSpring: project.nodalSprings, settlement: project.settlements, rigidLink: project.rigidLinks, thermalLoad: project.thermalLoads, imposedDisplacement: project.imposedDisplacements, windLoad: project.windLoads, seismicLoad: project.seismicLoads };
  return maps[selection.kind].find((item) => item.id === selection.id) ?? null;
}
