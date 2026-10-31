import type { LoadCombination, MemberDistributedLoad, MemberPointLoad, ModelIssue, NodalLoad, Project, SelfWeightLoad, Support } from './types';

const finite = (value: number) => Number.isFinite(value);
const positive = (value: number) => finite(value) && value > 0;
const loadCaseCategories = new Set(['dead', 'live', 'wind', 'seismic', 'other']);
const supportTypes = new Set(['fixed', 'pinned', 'roller-x', 'roller-z', 'custom']);
const memberDirections = new Set(['global-x', 'global-y', 'global-z', 'local-x', 'local-y', 'local-z']);
const globalDirections = new Set(['global-x', 'global-y', 'global-z']);

function duplicateIds(items: { id: string }[], path: string): ModelIssue[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) { if (seen.has(item.id)) duplicates.add(item.id); seen.add(item.id); }
  return [...duplicates].map((id) => ({ severity: 'error' as const, path, message: `Duplicate identifier: ${id}.` }));
}

function isDofVector(value: unknown): value is boolean[] {
  return Array.isArray(value) && value.length === 6 && value.every((item) => typeof item === 'boolean');
}

export function validateNodalLoad(load: NodalLoad): ModelIssue[] {
  const issues: ModelIssue[] = [];
  for (const [key, value] of Object.entries(load.values)) if (!finite(value)) issues.push({ severity: 'error', path: `values.${key}`, message: `${key} must be finite.` });
  return issues;
}

export function validateMemberPointLoad(load: MemberPointLoad): ModelIssue[] {
  const issues: ModelIssue[] = [];
  if (!finite(load.magnitude)) issues.push({ severity: 'error', path: 'magnitude', message: 'Point-load magnitude must be finite.' });
  if (!finite(load.position) || load.position < 0 || load.position > 1) issues.push({ severity: 'error', path: 'position', message: 'Point-load position must be a normalized value in [0, 1].' });
  if (!memberDirections.has(load.direction)) issues.push({ severity: 'error', path: 'direction', message: 'Point-load direction must be a recognized global or local axis.' });
  return issues;
}

export function validateMemberDistributedLoad(load: MemberDistributedLoad): ModelIssue[] {
  const issues: ModelIssue[] = [];
  if (!finite(load.startMagnitude)) issues.push({ severity: 'error', path: 'startMagnitude', message: 'Distributed-load start magnitude must be finite.' });
  if (!finite(load.endMagnitude)) issues.push({ severity: 'error', path: 'endMagnitude', message: 'Distributed-load end magnitude must be finite.' });
  if (!memberDirections.has(load.direction)) issues.push({ severity: 'error', path: 'direction', message: 'Distributed-load direction must be a recognized global or local axis.' });
  return issues;
}

export function validateSelfWeightLoad(load: SelfWeightLoad): ModelIssue[] {
  const issues: ModelIssue[] = [];
  if (!finite(load.factor) || load.factor === 0) issues.push({ severity: 'error', path: 'factor', message: 'Self-weight factor must be finite and non-zero.' });
  if (!globalDirections.has(load.direction)) issues.push({ severity: 'error', path: 'direction', message: 'Self-weight direction must use a global axis.' });
  return issues;
}

export function validateLoadCombination(combination: LoadCombination): ModelIssue[] {
  const issues: ModelIssue[] = [];
  if (!combination.name.trim()) issues.push({ severity: 'error', path: 'name', message: 'Load-combination name is required.' });
  if (!combination.factors.length) issues.push({ severity: 'error', path: 'factors', message: 'A load combination requires at least one factor.' });
  const seen = new Set<string>();
  for (const [index, factor] of combination.factors.entries()) {
    if (!finite(factor.factor) || factor.factor === 0) issues.push({ severity: 'error', path: `factors.${index}.factor`, message: 'Combination factor must be finite and non-zero.' });
    if (seen.has(factor.loadCaseId)) issues.push({ severity: 'error', path: `factors.${index}.loadCaseId`, message: 'A load case may appear only once in a combination.' });
    seen.add(factor.loadCaseId);
  }
  return issues;
}

export function validateSupport(support: Support): ModelIssue[] {
  const issues: ModelIssue[] = [];
  if (!supportTypes.has(support.type)) issues.push({ severity: 'error', path: 'type', message: 'Support type is not recognized.' });
  if (!isDofVector(support.restraints)) issues.push({ severity: 'error', path: 'restraints', message: 'Support restraints must contain exactly six boolean DOFs.' });
  else if (!support.restraints.some(Boolean)) issues.push({ severity: 'error', path: 'restraints', message: 'A support must restrain at least one DOF.' });
  return issues;
}

export function validateProject(project: Project): ModelIssue[] {
  const issues: ModelIssue[] = [];
  if (!positive(project.settings.gridSpacing)) issues.push({ severity: 'error', path: 'settings.gridSpacing', message: 'Grid spacing must be a positive finite length.' });
  if (!positive(project.settings.gridExtents)) issues.push({ severity: 'error', path: 'settings.gridExtents', message: 'Grid extents must be a positive finite length.' });
  const idCollections: [ { id: string }[], string ][] = [
    [project.nodes, 'nodes'], [project.members, 'members'], [project.materials, 'materials'], [project.sections, 'sections'], [project.supports, 'supports'], [project.loadCases, 'loadCases'], [project.loadCombinations, 'loadCombinations'], [project.nodalLoads, 'nodalLoads'], [project.memberPointLoads, 'memberPointLoads'], [project.memberDistributedLoads, 'memberDistributedLoads'], [project.selfWeightLoads, 'selfWeightLoads'],
  ];
  for (const [items, path] of idCollections) issues.push(...duplicateIds(items, path));
  const nodeIds = new Set(project.nodes.map((node) => node.id));
  const nodesById = new Map(project.nodes.map((node) => [node.id, node]));
  const memberIds = new Set(project.members.map((member) => member.id));
  const materialIds = new Set(project.materials.map((material) => material.id));
  const sectionIds = new Set(project.sections.map((section) => section.id));
  const loadCaseIds = new Set(project.loadCases.map((loadCase) => loadCase.id));
  if (!project.name.trim()) issues.push({ severity: 'warning', path: 'name', message: 'Project name is empty.' });

  for (const node of project.nodes) for (const [axis, coordinate] of Object.entries(node.position)) if (!finite(coordinate)) issues.push({ severity: 'error', path: `nodes.${node.id}.${axis}`, message: 'Node coordinates must be finite.' });
  for (const material of project.materials) {
    if (!material.name.trim()) issues.push({ severity: 'error', path: `materials.${material.id}.name`, message: 'Material name is required.' });
    if (!positive(material.elasticModulus)) issues.push({ severity: 'error', path: `materials.${material.id}.elasticModulus`, message: 'Elastic modulus must be a positive finite value.' });
    if (!positive(material.density)) issues.push({ severity: 'error', path: `materials.${material.id}.density`, message: 'Density must be a positive finite value.' });
    if (!finite(material.poissonRatio) || material.poissonRatio <= -1 || material.poissonRatio >= 0.5) issues.push({ severity: 'error', path: `materials.${material.id}.poissonRatio`, message: 'Poisson ratio must be finite and within (-1, 0.5).' });
    if (material.yieldStrength !== undefined && !positive(material.yieldStrength)) issues.push({ severity: 'error', path: `materials.${material.id}.yieldStrength`, message: 'Yield strength must be a positive finite value when supplied.' });
  }
  for (const section of project.sections) {
    if (!section.name.trim()) issues.push({ severity: 'error', path: `sections.${section.id}.name`, message: 'Section name is required.' });
    if (!['rectangular', 'circular', 'i-section', 'custom'].includes(section.shape)) issues.push({ severity: 'error', path: `sections.${section.id}.shape`, message: 'Section shape is not recognized.' });
    for (const [property, value] of Object.entries({ area: section.area, iy: section.iy, iz: section.iz, torsionalConstant: section.torsionalConstant })) if (!positive(value)) issues.push({ severity: 'error', path: `sections.${section.id}.${property}`, message: `${property} must be a positive finite value.` });
    for (const [property, value] of Object.entries({ depth: section.depth, width: section.width })) if (value !== undefined && !positive(value)) issues.push({ severity: 'error', path: `sections.${section.id}.${property}`, message: `${property} must be a positive finite value when supplied.` });
  }
  for (const member of project.members) {
    if (!nodeIds.has(member.startNodeId) || !nodeIds.has(member.endNodeId)) issues.push({ severity: 'error', path: `members.${member.id}`, message: 'Member references a missing node.' });
    if (member.startNodeId === member.endNodeId) issues.push({ severity: 'error', path: `members.${member.id}`, message: 'Member end nodes must be distinct.' });
    if (!materialIds.has(member.materialId)) issues.push({ severity: 'error', path: `members.${member.id}`, message: 'Member references a missing material.' });
    if (!sectionIds.has(member.sectionId)) issues.push({ severity: 'error', path: `members.${member.id}`, message: 'Member references a missing section.' });
    if (!finite(member.rollAngle)) issues.push({ severity: 'error', path: `members.${member.id}.rollAngle`, message: 'Member roll angle must be finite.' });
    if (!isDofVector(member.endReleases?.start) || !isDofVector(member.endReleases?.end)) issues.push({ severity: 'error', path: `members.${member.id}.endReleases`, message: 'Member releases must provide six boolean DOFs at each end.' });
    const start = nodesById.get(member.startNodeId); const end = nodesById.get(member.endNodeId);
    if (start && end) { const dx = start.position.x - end.position.x; const dy = start.position.y - end.position.y; const dz = start.position.z - end.position.z; if (dx * dx + dy * dy + dz * dz <= 1e-18) issues.push({ severity: 'error', path: `members.${member.id}`, message: 'Member length must be greater than zero.' }); }
  }
  const supportedNodeIds = new Set<string>();
  for (const support of project.supports) {
    if (!nodeIds.has(support.nodeId)) issues.push({ severity: 'error', path: `supports.${support.id}`, message: 'Support references a missing node.' });
    if (supportedNodeIds.has(support.nodeId)) issues.push({ severity: 'error', path: `supports.${support.id}`, message: 'Only one support definition is allowed per node.' });
    supportedNodeIds.add(support.nodeId);
    issues.push(...validateSupport(support).map((issue) => ({ ...issue, path: `supports.${support.id}.${issue.path}` })));
  }
  for (const loadCase of project.loadCases) {
    if (!loadCase.name.trim()) issues.push({ severity: 'error', path: `loadCases.${loadCase.id}.name`, message: 'Load-case name is required.' });
    if (!loadCaseCategories.has(loadCase.category)) issues.push({ severity: 'error', path: `loadCases.${loadCase.id}.category`, message: 'Load-case category is not recognized.' });
  }
  if (!project.loadCases.some((loadCase) => loadCase.isActive)) issues.push({ severity: 'warning', path: 'loadCases', message: 'No active load case is selected for new loads.' });
  for (const combination of project.loadCombinations) {
    issues.push(...validateLoadCombination(combination).map((issue) => ({ ...issue, path: `loadCombinations.${combination.id}.${issue.path}` })));
    combination.factors.forEach((factor, index) => { if (!loadCaseIds.has(factor.loadCaseId)) issues.push({ severity: 'error', path: `loadCombinations.${combination.id}.factors.${index}.loadCaseId`, message: 'Combination references a missing load case.' }); });
  }
  for (const load of project.nodalLoads) {
    if (!nodeIds.has(load.nodeId)) issues.push({ severity: 'error', path: `nodalLoads.${load.id}`, message: 'Load references a missing node.' });
    if (!loadCaseIds.has(load.loadCaseId)) issues.push({ severity: 'error', path: `nodalLoads.${load.id}`, message: 'Load references a missing load case.' });
    issues.push(...validateNodalLoad(load).map((issue) => ({ ...issue, path: `nodalLoads.${load.id}.${issue.path}` })));
  }
  for (const load of project.memberPointLoads) {
    if (!memberIds.has(load.memberId)) issues.push({ severity: 'error', path: `memberPointLoads.${load.id}`, message: 'Point load references a missing member.' });
    if (!loadCaseIds.has(load.loadCaseId)) issues.push({ severity: 'error', path: `memberPointLoads.${load.id}`, message: 'Point load references a missing load case.' });
    issues.push(...validateMemberPointLoad(load).map((issue) => ({ ...issue, path: `memberPointLoads.${load.id}.${issue.path}` })));
  }
  for (const load of project.memberDistributedLoads) {
    if (!memberIds.has(load.memberId)) issues.push({ severity: 'error', path: `memberDistributedLoads.${load.id}`, message: 'Distributed load references a missing member.' });
    if (!loadCaseIds.has(load.loadCaseId)) issues.push({ severity: 'error', path: `memberDistributedLoads.${load.id}`, message: 'Distributed load references a missing load case.' });
    issues.push(...validateMemberDistributedLoad(load).map((issue) => ({ ...issue, path: `memberDistributedLoads.${load.id}.${issue.path}` })));
  }
  for (const load of project.selfWeightLoads) {
    if (!loadCaseIds.has(load.loadCaseId)) issues.push({ severity: 'error', path: `selfWeightLoads.${load.id}`, message: 'Self-weight load references a missing load case.' });
    issues.push(...validateSelfWeightLoad(load).map((issue) => ({ ...issue, path: `selfWeightLoads.${load.id}.${issue.path}` })));
  }
  return issues;
}
