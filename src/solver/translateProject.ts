import type { MemberLoadDirection, Project, SurfaceMesh, Vector3 } from '../model/types';
import { validateProject } from '../model/validation';
import { SOLVER_INPUT_VERSION, type SolverDiagnostic, type SolverInput, type SolverLoadDirection, type SolverResult } from './contracts';

const GRAVITY = 9.80665;
const SURFACE_COORDINATE_TOLERANCE = 1e-8;

export class SolverTranslationError extends Error {
  constructor(readonly diagnostics: SolverDiagnostic[]) { super(diagnostics.map((item) => item.message).join('\n')); }
}

const byId = <T extends { id: string }>(items: T[]) => [...items].sort((left, right) => left.id.localeCompare(right.id));
const solverNames = <T extends { id: string }>(prefix: string, items: T[]) => Object.fromEntries(byId(items).map((item, index) => [item.id, `${prefix}_${String(index + 1).padStart(4, '0')}`]));
const surfaceRef = (meshId: string, entityId: string) => `${meshId}/${entityId}`;
const coordinateKey = (position: Vector3) => `${Math.round(position.x / SURFACE_COORDINATE_TOLERANCE)}:${Math.round(position.y / SURFACE_COORDINATE_TOLERANCE)}:${Math.round(position.z / SURFACE_COORDINATE_TOLERANCE)}`;

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function fingerprint(value: unknown): string {
  let hash = 0x811c9dc5;
  for (const character of canonicalize(value)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 0x01000193); }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function memberDirection(direction: MemberLoadDirection): SolverLoadDirection {
  const directions: Record<MemberLoadDirection, SolverLoadDirection> = { 'global-x': 'FX', 'global-y': 'FY', 'global-z': 'FZ', 'local-x': 'Fx', 'local-y': 'Fy', 'local-z': 'Fz' };
  return directions[direction];
}

function memberLength(project: Project, memberId: string): number {
  const member = project.members.find((item) => item.id === memberId)!;
  const start = project.nodes.find((item) => item.id === member.startNodeId)!;
  const end = project.nodes.find((item) => item.id === member.endNodeId)!;
  return Math.hypot(end.position.x - start.position.x, end.position.y - start.position.y, end.position.z - start.position.z);
}

function surfaceSource(project: Project, mesh: SurfaceMesh): { materialId: string; thickness: number } | undefined {
  if (mesh.sourceKind === 'slab') {
    const slab = project.building.slabs.find((item) => item.id === mesh.sourceId);
    return slab && { materialId: slab.materialId, thickness: slab.thickness };
  }
  const wall = project.building.walls.find((item) => item.id === mesh.sourceId);
  return wall && { materialId: wall.materialId, thickness: wall.thickness };
}

/**
 * Builds a deterministic v2 PyNite DTO. Frame and surface entities use the
 * same solver node only when their SI coordinates match within 1e-8 m.
 * PyNite 3.2.1 exposes a verified public Quad3D API, not a public tri3 API.
 */
export function translateProject(project: Project): SolverInput {
  const diagnostics: SolverDiagnostic[] = validateProject(project).filter((issue) => issue.severity === 'error').map((issue) => ({ severity: 'error', code: 'MODEL_VALIDATION', path: issue.path, message: issue.message }));
  if (Object.keys(project.extensions).length) diagnostics.push({ severity: 'error', code: 'UNSUPPORTED_EXTENSION', path: 'extensions', message: 'Solver runs reject project extensions until their solver meaning is explicitly implemented.' });
  if (project.building.diaphragms.length) diagnostics.push({ severity: 'error', code: 'UNSUPPORTED_DIAPHRAGM_CONSTRAINTS', path: 'building.diaphragms', message: 'Rigid and semi-rigid diaphragm definitions have no verified PyNite constraint mapping.' });
  if (project.nodalSprings.length || project.settlements.length) diagnostics.push({ severity: 'error', code: 'UNSUPPORTED_FOUNDATION_INPUTS', path: 'foundation', message: 'Nodal springs and settlement definitions have no verified PyNite mapping.' });
  if (project.members.some((member) => member.endOffsets) || project.rigidLinks.length) diagnostics.push({ severity: 'error', code: 'UNSUPPORTED_RIGID_CONNECTIVITY', path: 'members', message: 'Member end offsets and rigid links have no verified PyNite mapping.' });
  if (project.thermalLoads.length || project.imposedDisplacements.length || project.windLoads.length || project.seismicLoads.length) diagnostics.push({ severity: 'error', code: 'UNSUPPORTED_ADVANCED_LOADS', path: 'loads', message: 'Thermal, imposed-displacement, wind and seismic definitions are input-only and generate no solver loads.' });

  const meshes = byId(project.building.surfaceMeshes);
  const meshedSources = new Set(meshes.map((mesh) => `${mesh.sourceKind}/${mesh.sourceId}`));
  for (const slab of project.building.slabs) if (!meshedSources.has(`slab/${slab.id}`)) diagnostics.push({ severity: 'error', code: 'UNMESHED_SURFACE_SOURCE', path: `building.slabs.${slab.id}`, message: `Slab '${slab.name}' has no current solver mesh; no slab was silently omitted.` });
  for (const wall of project.building.walls) if (!meshedSources.has(`wall/${wall.id}`)) diagnostics.push({ severity: 'error', code: 'UNMESHED_SURFACE_SOURCE', path: `building.walls.${wall.id}`, message: `Wall '${wall.name}' has no current solver mesh; no wall was silently omitted.` });
  for (const mesh of meshes) {
    if (mesh.elements.some((element) => element.type !== 'quad4')) diagnostics.push({ severity: 'error', code: 'UNSUPPORTED_SURFACE_ELEMENT', path: `building.surfaceMeshes.${mesh.id}`, message: `Surface mesh '${mesh.name}' contains tri3 elements. PyNiteFEA 3.2.1 has no verified public STRUX tri3 mapping, so the complete analysis was rejected.` });
    if (!surfaceSource(project, mesh)) diagnostics.push({ severity: 'error', code: 'MISSING_SURFACE_SOURCE', path: `building.surfaceMeshes.${mesh.id}.sourceId`, message: `Surface mesh '${mesh.name}' has no source thickness or material.` });
  }
  if (diagnostics.length) throw new SolverTranslationError(diagnostics);

  const nodeNameById = solverNames('N', project.nodes);
  const memberNameById = solverNames('M', project.members);
  const materialNameById = solverNames('MAT', project.materials);
  const sectionNameById = solverNames('SEC', project.sections);
  const materialById = new Map(project.materials.map((item) => [item.id, item]));
  const sectionById = new Map(project.sections.map((item) => [item.id, item]));
  const loadCaseIds = new Set(project.loadCases.map((item) => item.id));

  const namesAtCoordinate = new Map<string, string[]>();
  for (const node of byId(project.nodes)) {
    const key = coordinateKey(node.position);
    namesAtCoordinate.set(key, [...(namesAtCoordinate.get(key) ?? []), nodeNameById[node.id]]);
  }
  const surfaceNodeNameByRef: Record<string, string> = {};
  let generatedSurfaceNodeCount = 0;
  for (const mesh of meshes) for (const node of byId(mesh.nodes)) {
    const key = coordinateKey(node.position); const existing = namesAtCoordinate.get(key) ?? [];
    if (existing.length > 1) diagnostics.push({ severity: 'error', code: 'AMBIGUOUS_SURFACE_CONNECTION', path: `building.surfaceMeshes.${mesh.id}.nodes.${node.id}`, message: `Surface node '${node.id}' coincides with multiple project nodes; connectivity is ambiguous and was not inferred.` });
    const name = existing[0] ?? `SN_${String(++generatedSurfaceNodeCount).padStart(4, '0')}`;
    surfaceNodeNameByRef[surfaceRef(mesh.id, node.id)] = name;
    if (!existing.length) namesAtCoordinate.set(key, [name]);
  }
  const surfaceElementNameByRef: Record<string, string> = {};
  let surfaceElementCount = 0;
  for (const mesh of meshes) for (const element of byId(mesh.elements)) surfaceElementNameByRef[surfaceRef(mesh.id, element.id)] = `Q_${String(++surfaceElementCount).padStart(4, '0')}`;
  if (diagnostics.length) throw new SolverTranslationError(diagnostics);

  const memberDistributedLoads: SolverInput['memberDistributedLoads'] = byId(project.memberDistributedLoads).map((load) => ({ id: load.id, memberId: load.memberId, caseId: load.loadCaseId, direction: memberDirection(load.direction) as Exclude<SolverLoadDirection, 'MX' | 'MY' | 'MZ'>, startMagnitude: load.startMagnitude, endMagnitude: load.endMagnitude, source: 'member-distributed' as const }));
  for (const selfWeight of byId(project.selfWeightLoads)) for (const member of byId(project.members)) {
    const material = materialById.get(member.materialId)!; const section = sectionById.get(member.sectionId)!;
    const intensity = selfWeight.factor * material.density * section.area * GRAVITY;
    memberDistributedLoads.push({ id: `${selfWeight.id}:${member.id}`, memberId: member.id, caseId: selfWeight.loadCaseId, direction: memberDirection(selfWeight.direction) as Exclude<SolverLoadDirection, 'MX' | 'MY' | 'MZ'>, startMagnitude: intensity, endMagnitude: intensity, source: 'self-weight' });
  }

  const inputWithoutHash = {
    version: SOLVER_INPUT_VERSION,
    engine: { name: 'PyNiteFEA' as const, version: '3.2.1' as const },
    projectId: project.id,
    projectRevision: project.updatedAt,
    coordinateConvention: 'right-handed-x-y-up-z' as const,
    units: 'SI-m-N-Pa' as const,
    nodeNameById, memberNameById, materialNameById, sectionNameById, surfaceNodeNameByRef, surfaceElementNameByRef,
    nodes: byId(project.nodes).map((node) => ({ id: node.id, name: nodeNameById[node.id], position: node.position })),
    materials: byId(project.materials).map((material) => ({ id: material.id, name: materialNameById[material.id], elasticModulus: material.elasticModulus, shearModulus: material.elasticModulus / (2 * (1 + material.poissonRatio)), poissonRatio: material.poissonRatio, density: material.density, ...(material.yieldStrength === undefined ? {} : { yieldStrength: material.yieldStrength }) })),
    sections: byId(project.sections).map((section) => ({ id: section.id, name: sectionNameById[section.id], area: section.area, iy: section.iy, iz: section.iz, torsionalConstant: section.torsionalConstant })),
    members: byId(project.members).map((member) => ({ id: member.id, name: memberNameById[member.id], startNodeId: member.startNodeId, endNodeId: member.endNodeId, materialId: member.materialId, sectionId: member.sectionId, rotationDegrees: member.rollAngle * 180 / Math.PI, releases: [...member.endReleases.start, ...member.endReleases.end] as [boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean] })),
    supports: byId(project.supports).map((support) => ({ nodeId: support.nodeId, restraints: support.restraints })),
    loadCases: byId(project.loadCases).map((loadCase) => ({ id: loadCase.id, name: loadCase.name })),
    loadCombinations: [...byId(project.loadCases).map((loadCase) => ({ id: loadCase.id, name: loadCase.name, factors: { [loadCase.id]: 1 }, kind: 'load-case' as const })), ...byId(project.loadCombinations).map((combination) => ({ id: combination.id, name: combination.name, factors: Object.fromEntries(combination.factors.map((factor) => [factor.loadCaseId, factor.factor])), kind: 'combination' as const }))],
    nodalLoads: byId(project.nodalLoads).map((load) => ({ id: load.id, nodeId: load.nodeId, caseId: load.loadCaseId, values: load.values })),
    memberPointLoads: byId(project.memberPointLoads).map((load) => ({ id: load.id, memberId: load.memberId, caseId: load.loadCaseId, direction: memberDirection(load.direction), magnitude: load.magnitude, x: load.position * memberLength(project, load.memberId), source: 'member-point' as const })),
    memberDistributedLoads: memberDistributedLoads.sort((left, right) => left.id.localeCompare(right.id)),
    surfaceMeshes: meshes.map((mesh) => {
      const source = surfaceSource(project, mesh)!;
      return { id: mesh.id, name: mesh.name, sourceKind: mesh.sourceKind, sourceId: mesh.sourceId, materialId: source.materialId, thickness: source.thickness, nodes: byId(mesh.nodes).map((node) => ({ id: node.id, position: node.position })), elements: byId(mesh.elements).map((element) => ({ id: element.id, nodeIds: element.nodeIds as [string, string, string, string] })) };
    }),
    surfacePressureLoads: byId(project.surfacePressureLoads).map((load) => ({ id: load.id, surfaceMeshId: load.surfaceMeshId, caseId: load.loadCaseId, pressure: load.pressure })),
  };

  for (const combination of inputWithoutHash.loadCombinations) for (const loadCaseId of Object.keys(combination.factors)) if (!loadCaseIds.has(loadCaseId)) diagnostics.push({ severity: 'error', code: 'MISSING_LOAD_CASE', message: `Solver combination '${combination.name}' references an unknown load case.`, path: `loadCombinations.${combination.id}` });
  if (diagnostics.length) throw new SolverTranslationError(diagnostics);
  const inputHash = fingerprint(inputWithoutHash);
  return { ...inputWithoutHash, inputHash };
}

export function projectInputHash(project: Project): string {
  try { return translateProject(project).inputHash; } catch { return fingerprint({ projectId: project.id, projectRevision: project.updatedAt }); }
}

export function resultMatchesProject(project: Project, result: SolverResult): boolean {
  try { const input = translateProject(project); return result.projectRevision === input.projectRevision && result.inputHash === input.inputHash; } catch { return false; }
}
