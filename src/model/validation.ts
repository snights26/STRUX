import type { ModelIssue, NodalLoad, Project } from './types';

const finite = (value: number) => Number.isFinite(value);

function duplicateIds(items: { id: string }[], path: string): ModelIssue[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) { if (seen.has(item.id)) duplicates.add(item.id); seen.add(item.id); }
  return [...duplicates].map((id) => ({ severity: 'error' as const, path, message: `Duplicate identifier: ${id}.` }));
}

export function validateNodalLoad(load: NodalLoad): ModelIssue[] {
  const issues: ModelIssue[] = [];
  for (const [key, value] of Object.entries(load.values)) {
    if (!finite(value)) issues.push({ severity: 'error', path: `values.${key}`, message: `${key} must be finite.` });
  }
  return issues;
}

export function validateProject(project: Project): ModelIssue[] {
  const issues: ModelIssue[] = [];
  if (!finite(project.settings.gridSpacing) || project.settings.gridSpacing <= 0) issues.push({ severity: 'error', path: 'settings.gridSpacing', message: 'Grid spacing must be a positive finite length.' });
  if (!finite(project.settings.gridExtents) || project.settings.gridExtents <= 0) issues.push({ severity: 'error', path: 'settings.gridExtents', message: 'Grid extents must be a positive finite length.' });
  issues.push(...duplicateIds(project.nodes, 'nodes'), ...duplicateIds(project.members, 'members'), ...duplicateIds(project.materials, 'materials'), ...duplicateIds(project.sections, 'sections'), ...duplicateIds(project.supports, 'supports'), ...duplicateIds(project.loadCases, 'loadCases'), ...duplicateIds(project.nodalLoads, 'nodalLoads'));
  const nodeIds = new Set(project.nodes.map((node) => node.id));
  const nodesById = new Map(project.nodes.map((node) => [node.id, node]));
  const materialIds = new Set(project.materials.map((material) => material.id));
  const sectionIds = new Set(project.sections.map((section) => section.id));
  const loadCaseIds = new Set(project.loadCases.map((loadCase) => loadCase.id));
  if (!project.name.trim()) issues.push({ severity: 'warning', path: 'name', message: 'Project name is empty.' });
  for (const node of project.nodes) {
    for (const [axis, coordinate] of Object.entries(node.position)) {
      if (!finite(coordinate)) issues.push({ severity: 'error', path: `nodes.${node.id}.${axis}`, message: 'Node coordinates must be finite.' });
    }
  }
  for (const material of project.materials) {
    if (!finite(material.elasticModulus) || material.elasticModulus <= 0) issues.push({ severity: 'error', path: `materials.${material.id}.elasticModulus`, message: 'Elastic modulus must be a positive finite value.' });
    if (!finite(material.density) || material.density <= 0) issues.push({ severity: 'error', path: `materials.${material.id}.density`, message: 'Density must be a positive finite value.' });
    if (!finite(material.poissonRatio) || material.poissonRatio <= -1 || material.poissonRatio >= 0.5) issues.push({ severity: 'error', path: `materials.${material.id}.poissonRatio`, message: 'Poisson ratio must be finite and within (-1, 0.5).' });
  }
  for (const section of project.sections) {
    for (const [property, value] of Object.entries({ area: section.area, iy: section.iy, iz: section.iz, torsionalConstant: section.torsionalConstant })) {
      if (!finite(value) || value <= 0) issues.push({ severity: 'error', path: `sections.${section.id}.${property}`, message: `${property} must be a positive finite value.` });
    }
  }
  for (const member of project.members) {
    if (!nodeIds.has(member.startNodeId) || !nodeIds.has(member.endNodeId)) issues.push({ severity: 'error', path: `members.${member.id}`, message: 'Member references a missing node.' });
    if (member.startNodeId === member.endNodeId) issues.push({ severity: 'error', path: `members.${member.id}`, message: 'Member end nodes must be distinct.' });
    if (!materialIds.has(member.materialId)) issues.push({ severity: 'error', path: `members.${member.id}`, message: 'Member references a missing material.' });
    if (!sectionIds.has(member.sectionId)) issues.push({ severity: 'error', path: `members.${member.id}`, message: 'Member references a missing section.' });
    const start = nodesById.get(member.startNodeId); const end = nodesById.get(member.endNodeId);
    if (start && end) {
      const dx = start.position.x - end.position.x; const dy = start.position.y - end.position.y; const dz = start.position.z - end.position.z;
      if (dx * dx + dy * dy + dz * dz <= 1e-18) issues.push({ severity: 'error', path: `members.${member.id}`, message: 'Member length must be greater than zero.' });
    }
  }
  const supportedNodeIds = new Set<string>();
  for (const support of project.supports) {
    if (!nodeIds.has(support.nodeId)) issues.push({ severity: 'error', path: `supports.${support.id}`, message: 'Support references a missing node.' });
    if (supportedNodeIds.has(support.nodeId)) issues.push({ severity: 'error', path: `supports.${support.id}`, message: 'Only one support definition is allowed per node.' });
    supportedNodeIds.add(support.nodeId);
  }
  if (!project.loadCases.some((loadCase) => loadCase.isActive)) issues.push({ severity: 'warning', path: 'loadCases', message: 'No active load case is selected for new loads.' });
  for (const load of project.nodalLoads) {
    if (!nodeIds.has(load.nodeId)) issues.push({ severity: 'error', path: `nodalLoads.${load.id}`, message: 'Load references a missing node.' });
    if (!loadCaseIds.has(load.loadCaseId)) issues.push({ severity: 'error', path: `nodalLoads.${load.id}`, message: 'Load references a missing load case.' });
    issues.push(...validateNodalLoad(load).map((issue) => ({ ...issue, path: `nodalLoads.${load.id}.${issue.path}` })));
  }
  return issues;
}
