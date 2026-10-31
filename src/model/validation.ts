import { isSimplePlanPolygon, planPoints, planPolygonBoundariesIntersect, planPolygonsIntersect, pointStrictlyInsidePlanPolygon } from './building';
import { checkMeshQuality, checkSlabOpeningConstraints, slabMeshSourceSignature, wallMeshSourceSignature } from './mesh';
import type { KinematicVector, LoadCombination, MemberDistributedLoad, MemberPointLoad, ModelIssue, NodalLoad, NodalSpring, Project, Section, SelfWeightLoad, SpringStiffness, Support, SurfacePressureLoad } from './types';

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

function buildingIssues(project: Project, nodeIds: Set<string>, materialIds: Set<string>): ModelIssue[] {
  const issues: ModelIssue[] = [];
  const building = project.building;
  if (!positive(building.typicalStoreyHeight)) issues.push({ severity: 'error', path: 'building.typicalStoreyHeight', message: 'Typical storey height must be a positive finite value.' });
  issues.push(...duplicateIds(building.storeys, 'building.storeys'), ...duplicateIds(building.gridLines, 'building.gridLines'), ...duplicateIds(building.slabs, 'building.slabs'), ...duplicateIds(building.walls, 'building.walls'), ...duplicateIds(building.surfaceMeshes, 'building.surfaceMeshes'), ...duplicateIds(building.diaphragms, 'building.diaphragms'));
  const storeyIds = new Set(building.storeys.map((storey) => storey.id));
  const storeysByRole = new Map<string, number>();
  for (const storey of building.storeys) {
    if (!storey.name.trim()) issues.push({ severity: 'error', path: `building.storeys.${storey.id}.name`, message: 'Storey name is required.' });
    if (!finite(storey.elevation)) issues.push({ severity: 'error', path: `building.storeys.${storey.id}.elevation`, message: 'Storey elevation must be finite.' });
    if (!positive(storey.height)) issues.push({ severity: 'error', path: `building.storeys.${storey.id}.height`, message: 'Storey height must be a positive finite value.' });
    storeysByRole.set(storey.role, (storeysByRole.get(storey.role) ?? 0) + 1);
  }
  if (storeysByRole.get('ground') !== 1) issues.push({ severity: 'error', path: 'building.storeys', message: 'A building must contain exactly one ground level.' });
  if (storeysByRole.get('roof') !== 1) issues.push({ severity: 'error', path: 'building.storeys', message: 'A building must contain exactly one roof level.' });
  const elevations = building.storeys.map((storey) => storey.elevation).sort((left, right) => left - right);
  if (elevations.some((value, index) => index > 0 && Math.abs(value - elevations[index - 1]) <= 1e-9)) issues.push({ severity: 'error', path: 'building.storeys', message: 'Storey elevations must be unique.' });
  const gridLabels = new Set<string>();
  const gridCoordinates = new Set<string>();
  for (const line of building.gridLines) {
    if (!line.label.trim()) issues.push({ severity: 'error', path: `building.gridLines.${line.id}.label`, message: 'Grid label is required.' });
    if (!finite(line.coordinate)) issues.push({ severity: 'error', path: `building.gridLines.${line.id}.coordinate`, message: 'Grid coordinate must be finite.' });
    const labelKey = `${line.axis}:${line.label.toLowerCase()}`; const coordinateKey = `${line.axis}:${line.coordinate}`;
    if (gridLabels.has(labelKey)) issues.push({ severity: 'error', path: `building.gridLines.${line.id}.label`, message: 'Grid labels must be unique within an axis.' });
    if (gridCoordinates.has(coordinateKey)) issues.push({ severity: 'error', path: `building.gridLines.${line.id}.coordinate`, message: 'Grid coordinates must be unique within an axis.' });
    gridLabels.add(labelKey); gridCoordinates.add(coordinateKey);
  }
  if (!building.gridLines.some((line) => line.axis === 'x') || !building.gridLines.some((line) => line.axis === 'z')) issues.push({ severity: 'error', path: 'building.gridLines', message: 'Building grids require at least one X and one Z line.' });
  const storeyById = new Map(building.storeys.map((storey) => [storey.id, storey]));
  const nodeById = new Map(project.nodes.map((node) => [node.id, node]));
  for (const node of project.nodes) if (node.storeyId) {
    const storey = storeyById.get(node.storeyId);
    if (!storey) issues.push({ severity: 'error', path: `nodes.${node.id}.storeyId`, message: 'Node references a missing storey.' });
    else if (Math.abs(node.position.y - storey.elevation) > 1e-8) issues.push({ severity: 'error', path: `nodes.${node.id}.storeyId`, message: 'Storey node elevation must match its storey elevation.' });
  }
  for (const member of project.members) {
    if (member.storeyId && !storeyIds.has(member.storeyId)) issues.push({ severity: 'error', path: `members.${member.id}.storeyId`, message: 'Member references a missing storey.' });
    if (member.endStoreyId && !storeyIds.has(member.endStoreyId)) issues.push({ severity: 'error', path: `members.${member.id}.endStoreyId`, message: 'Member references a missing end storey.' });
  }
  const validateLoop = (nodeLoop: string[], storeyId: string, path: string, description: string): ReturnType<typeof planPoints> => {
    if (new Set(nodeLoop).size !== nodeLoop.length) issues.push({ severity: 'error', path, message: `${description} boundary nodes must be unique.` });
    if (nodeLoop.some((id) => !nodeIds.has(id))) { issues.push({ severity: 'error', path, message: `${description} references a missing boundary node.` }); return undefined; }
    const points = planPoints(project, nodeLoop)!;
    const storey = storeyById.get(storeyId);
    if (storey && points.some((point) => Math.abs(point.y - storey.elevation) > 1e-8)) issues.push({ severity: 'error', path, message: `${description} boundary nodes must lie on its storey elevation.` });
    if (!isSimplePlanPolygon(points)) issues.push({ severity: 'error', path, message: `${description} boundary must form a non-degenerate simple plan polygon.` });
    return points;
  };
  for (const slab of building.slabs) {
    if (!storeyIds.has(slab.storeyId)) issues.push({ severity: 'error', path: `building.slabs.${slab.id}.storeyId`, message: 'Slab references a missing storey.' });
    if (!materialIds.has(slab.materialId)) issues.push({ severity: 'error', path: `building.slabs.${slab.id}.materialId`, message: 'Slab references a missing material.' });
    if (!positive(slab.thickness)) issues.push({ severity: 'error', path: `building.slabs.${slab.id}.thickness`, message: 'Slab thickness must be a positive finite value.' });
    const outer = validateLoop(slab.boundaryNodeIds, slab.storeyId, `building.slabs.${slab.id}.boundaryNodeIds`, 'Slab');
    issues.push(...duplicateIds(slab.openings, `building.slabs.${slab.id}.openings`));
    const openings = slab.openings.map((opening) => ({ opening, points: validateLoop(opening.boundaryNodeIds, slab.storeyId, `building.slabs.${slab.id}.openings.${opening.id}.boundaryNodeIds`, 'Opening') }));
    if (outer) for (const { opening, points } of openings) if (points && (!points.every((point) => pointStrictlyInsidePlanPolygon(point, outer)) || planPolygonBoundariesIntersect(outer, points))) issues.push({ severity: 'error', path: `building.slabs.${slab.id}.openings.${opening.id}`, message: 'Opening must lie strictly inside the slab without touching its boundary.' });
    for (let index = 0; index < openings.length; index += 1) for (let other = index + 1; other < openings.length; other += 1) if (openings[index].points && openings[other].points && planPolygonsIntersect(openings[index].points!, openings[other].points!)) issues.push({ severity: 'error', path: `building.slabs.${slab.id}.openings`, message: 'Slab openings must not overlap or touch.' });
  }
  for (const wall of building.walls) {
    if (!storeyIds.has(wall.storeyId)) issues.push({ severity: 'error', path: `building.walls.${wall.id}.storeyId`, message: 'Wall references a missing storey.' });
    if (!materialIds.has(wall.materialId)) issues.push({ severity: 'error', path: `building.walls.${wall.id}.materialId`, message: 'Wall references a missing material.' });
    if (!positive(wall.thickness)) issues.push({ severity: 'error', path: `building.walls.${wall.id}.thickness`, message: 'Wall thickness must be a positive finite value.' });
    const start = nodeById.get(wall.startNodeId); const end = nodeById.get(wall.endNodeId); const storey = storeyById.get(wall.storeyId);
    if (!start || !end) issues.push({ severity: 'error', path: `building.walls.${wall.id}`, message: 'Wall references a missing boundary node.' });
    else if (wall.startNodeId === wall.endNodeId || Math.hypot(start.position.x - end.position.x, start.position.z - end.position.z) <= 1e-8) issues.push({ severity: 'error', path: `building.walls.${wall.id}`, message: 'Wall plan length must be greater than zero.' });
    else if (storey && (Math.abs(start.position.y - storey.elevation) > 1e-8 || Math.abs(end.position.y - storey.elevation) > 1e-8)) issues.push({ severity: 'error', path: `building.walls.${wall.id}`, message: 'Wall boundary nodes must lie on its storey elevation.' });
  }
  const diaphragmById = new Map(building.diaphragms.map((diaphragm) => [diaphragm.id, diaphragm]));
  for (const slab of building.slabs) if (slab.diaphragmId) {
    const diaphragm = diaphragmById.get(slab.diaphragmId);
    if (!diaphragm) issues.push({ severity: 'error', path: `building.slabs.${slab.id}.diaphragmId`, message: 'Slab references a missing diaphragm.' });
    else if (diaphragm.storeyId !== slab.storeyId) issues.push({ severity: 'error', path: `building.slabs.${slab.id}.diaphragmId`, message: 'Slab diaphragm must belong to the same storey.' });
  }
  for (const diaphragm of building.diaphragms) {
    const storey = storeyById.get(diaphragm.storeyId);
    if (!storey) issues.push({ severity: 'error', path: `building.diaphragms.${diaphragm.id}.storeyId`, message: 'Diaphragm references a missing storey.' });
    if (!diaphragm.name.trim()) issues.push({ severity: 'error', path: `building.diaphragms.${diaphragm.id}.name`, message: 'Diaphragm name is required.' });
    if (!['rigid', 'semi-rigid'].includes(diaphragm.type)) issues.push({ severity: 'error', path: `building.diaphragms.${diaphragm.id}.type`, message: 'Diaphragm type is not recognized.' });
    if (new Set(diaphragm.nodeIds).size !== diaphragm.nodeIds.length || diaphragm.nodeIds.length < 3) issues.push({ severity: 'error', path: `building.diaphragms.${diaphragm.id}.nodeIds`, message: 'A diaphragm requires at least three unique floor nodes.' });
    for (const nodeId of diaphragm.nodeIds) {
      const node = nodeById.get(nodeId);
      if (!node) issues.push({ severity: 'error', path: `building.diaphragms.${diaphragm.id}.nodeIds`, message: 'Diaphragm references a missing node.' });
      else if (storey && Math.abs(node.position.y - storey.elevation) > 1e-8) issues.push({ severity: 'error', path: `building.diaphragms.${diaphragm.id}.nodeIds`, message: 'Diaphragm nodes must lie on its storey elevation.' });
    }
    if (diaphragm.type === 'semi-rigid' && !positive(diaphragm.inPlaneStiffness ?? Number.NaN)) issues.push({ severity: 'error', path: `building.diaphragms.${diaphragm.id}.inPlaneStiffness`, message: 'Semi-rigid diaphragm metadata requires positive in-plane stiffness in N/m.' });
    if (diaphragm.type === 'rigid' && diaphragm.inPlaneStiffness !== undefined) issues.push({ severity: 'error', path: `building.diaphragms.${diaphragm.id}.inPlaneStiffness`, message: 'Rigid diaphragms must not declare semi-rigid stiffness metadata.' });
  }
  for (const mesh of building.surfaceMeshes) {
    if (mesh.sourceKind === 'slab') {
      const source = building.slabs.find((slab) => slab.id === mesh.sourceId);
      if (!source) issues.push({ severity: 'error', path: `building.surfaceMeshes.${mesh.id}.sourceId`, message: 'Surface mesh references a missing source object.' });
      else {
        if (slabMeshSourceSignature(project, source) !== mesh.sourceSignature) issues.push({ severity: 'error', path: `building.surfaceMeshes.${mesh.id}.sourceSignature`, message: 'Surface mesh is stale; regenerate it after source geometry changed.' });
        issues.push(...checkSlabOpeningConstraints(project, source, mesh).map((issue) => ({ severity: issue.severity, path: `building.surfaceMeshes.${mesh.id}${issue.elementId ? `.elements.${issue.elementId}` : ''}`, message: issue.message })));
      }
    } else {
      const source = building.walls.find((wall) => wall.id === mesh.sourceId);
      if (!source) issues.push({ severity: 'error', path: `building.surfaceMeshes.${mesh.id}.sourceId`, message: 'Surface mesh references a missing source object.' });
      else if (wallMeshSourceSignature(project, source.id) !== mesh.sourceSignature) issues.push({ severity: 'error', path: `building.surfaceMeshes.${mesh.id}.sourceSignature`, message: 'Surface mesh is stale; regenerate it after source geometry changed.' });
    }
    issues.push(...checkMeshQuality(mesh).map((issue) => ({ severity: issue.severity, path: `building.surfaceMeshes.${mesh.id}${issue.elementId ? `.elements.${issue.elementId}` : ''}`, message: issue.message })));
  }
  return issues;
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

export function validateSurfacePressureLoad(load: SurfacePressureLoad): ModelIssue[] {
  const issues: ModelIssue[] = [];
  if (!load.name.trim()) issues.push({ severity: 'error', path: 'name', message: 'Surface pressure load name is required.' });
  if (!finite(load.pressure) || load.pressure === 0) issues.push({ severity: 'error', path: 'pressure', message: 'Surface pressure must be a finite non-zero SI value in Pa.' });
  return issues;
}

function nonZeroKinematicVector(values: KinematicVector): boolean { return Object.values(values).some((value) => value !== 0); }

export function validateKinematicVector(values: KinematicVector): ModelIssue[] {
  const issues: ModelIssue[] = [];
  for (const [key, value] of Object.entries(values)) if (!finite(value)) issues.push({ severity: 'error', path: key, message: `${key} must be finite.` });
  if (!issues.length && !nonZeroKinematicVector(values)) issues.push({ severity: 'error', path: 'values', message: 'At least one imposed kinematic value must be non-zero.' });
  return issues;
}

export function validateNodalSpring(spring: NodalSpring): ModelIssue[] {
  const issues: ModelIssue[] = [];
  const stiffness = spring.stiffness as SpringStiffness;
  for (const [key, value] of Object.entries(stiffness)) if (!finite(value) || value < 0) issues.push({ severity: 'error', path: `stiffness.${key}`, message: `${key} must be a finite non-negative stiffness.` });
  if (!issues.length && !Object.values(stiffness).some((value) => value > 0)) issues.push({ severity: 'error', path: 'stiffness', message: 'A nodal spring requires at least one positive stiffness.' });
  return issues;
}

function approximatelyEqual(left: number, right: number): boolean { return Math.abs(left - right) <= Math.max(1e-12, Math.abs(left) * 1e-6, Math.abs(right) * 1e-6); }

function validateSectionCatalogue(section: Section): ModelIssue[] {
  const catalogue = section.catalogue; if (!catalogue) return [];
  const issues: ModelIssue[] = [];
  if (!catalogue.designation.trim()) issues.push({ severity: 'error', path: 'catalogue.designation', message: 'Section catalogue designation is required.' });
  if (!catalogue.provenance.source.trim()) issues.push({ severity: 'error', path: 'catalogue.provenance.source', message: 'Section catalogue provenance source is required.' });
  if (catalogue.propertyUnits !== 'SI-m2-m4' || catalogue.geometry.units !== 'SI-m') issues.push({ severity: 'error', path: 'catalogue', message: 'Catalogue geometry and properties must declare explicit SI units.' });
  if (catalogue.family !== 'general' && section.shape !== catalogue.family) issues.push({ severity: 'error', path: 'catalogue.family', message: 'Catalogue family must match the section shape.' });
  const geometry = catalogue.geometry;
  for (const [key, value] of Object.entries({ depth: geometry.depth, width: geometry.width, flangeThickness: geometry.flangeThickness, webThickness: geometry.webThickness })) if (value !== undefined && !positive(value)) issues.push({ severity: 'error', path: `catalogue.geometry.${key}`, message: `${key} must be a positive finite SI length when supplied.` });
  const require = (...keys: (keyof typeof geometry)[]) => keys.forEach((key) => { if (!positive(geometry[key] as number)) issues.push({ severity: 'error', path: `catalogue.geometry.${key}`, message: `${key} is required for the ${catalogue.family} family.` }); });
  if (catalogue.family === 'rectangular') {
    require('depth', 'width');
    if (positive(geometry.depth!) && positive(geometry.width!)) {
      const area = geometry.depth! * geometry.width!; const iy = geometry.depth! * geometry.width! ** 3 / 12; const iz = geometry.width! * geometry.depth! ** 3 / 12;
      if (!approximatelyEqual(section.area, area) || !approximatelyEqual(section.iy, iy) || !approximatelyEqual(section.iz, iz)) issues.push({ severity: 'error', path: 'catalogue.geometry', message: 'Rectangular catalogue dimensions do not match the declared SI area/Iy/Iz properties.' });
    }
  } else if (catalogue.family === 'circular') {
    require('depth');
    if (positive(geometry.depth!)) { const diameter = geometry.depth!; const area = Math.PI * diameter ** 2 / 4; const inertia = Math.PI * diameter ** 4 / 64; if (!approximatelyEqual(section.area, area) || !approximatelyEqual(section.iy, inertia) || !approximatelyEqual(section.iz, inertia)) issues.push({ severity: 'error', path: 'catalogue.geometry', message: 'Circular catalogue diameter does not match the declared SI area/Iy/Iz properties.' }); }
  } else if (catalogue.family === 'i-section') {
    require('depth', 'width', 'flangeThickness', 'webThickness');
    const { depth, width, flangeThickness, webThickness } = geometry;
    if (positive(depth!) && positive(width!) && positive(flangeThickness!) && positive(webThickness!) && depth! > 2 * flangeThickness!) {
      const webDepth = depth! - 2 * flangeThickness!; const area = 2 * width! * flangeThickness! + webDepth * webThickness!;
      const iy = 2 * flangeThickness! * width! ** 3 / 12 + webDepth * webThickness! ** 3 / 12;
      const iz = 2 * (width! * flangeThickness! ** 3 / 12 + width! * flangeThickness! * (depth! / 2 - flangeThickness! / 2) ** 2) + webThickness! * webDepth ** 3 / 12;
      if (!approximatelyEqual(section.area, area) || !approximatelyEqual(section.iy, iy) || !approximatelyEqual(section.iz, iz)) issues.push({ severity: 'error', path: 'catalogue.geometry', message: 'I-section catalogue dimensions do not match the declared SI area/Iy/Iz properties.' });
    } else if (positive(depth!) && positive(flangeThickness!)) issues.push({ severity: 'error', path: 'catalogue.geometry', message: 'I-section depth must exceed twice the flange thickness.' });
  }
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
    [project.nodes, 'nodes'], [project.members, 'members'], [project.materials, 'materials'], [project.sections, 'sections'], [project.supports, 'supports'], [project.loadCases, 'loadCases'], [project.loadCombinations, 'loadCombinations'], [project.nodalLoads, 'nodalLoads'], [project.memberPointLoads, 'memberPointLoads'], [project.memberDistributedLoads, 'memberDistributedLoads'], [project.selfWeightLoads, 'selfWeightLoads'], [project.surfacePressureLoads, 'surfacePressureLoads'], [project.nodalSprings, 'nodalSprings'], [project.settlements, 'settlements'], [project.rigidLinks, 'rigidLinks'], [project.thermalLoads, 'thermalLoads'], [project.imposedDisplacements, 'imposedDisplacements'], [project.windLoads, 'windLoads'], [project.seismicLoads, 'seismicLoads'],
  ];
  for (const [items, path] of idCollections) issues.push(...duplicateIds(items, path));
  const nodeIds = new Set(project.nodes.map((node) => node.id));
  const nodesById = new Map(project.nodes.map((node) => [node.id, node]));
  const memberIds = new Set(project.members.map((member) => member.id));
  const materialIds = new Set(project.materials.map((material) => material.id));
  const sectionIds = new Set(project.sections.map((section) => section.id));
  const loadCaseIds = new Set(project.loadCases.map((loadCase) => loadCase.id));
  issues.push(...buildingIssues(project, nodeIds, materialIds));
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
    issues.push(...validateSectionCatalogue(section).map((issue) => ({ ...issue, path: `sections.${section.id}.${issue.path}` })));
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
    if (member.endOffsets) {
      if (member.endOffsets.coordinateSystem !== 'global') issues.push({ severity: 'error', path: `members.${member.id}.endOffsets.coordinateSystem`, message: 'Member end offsets must use the explicit global coordinate system.' });
      for (const [endName, offset] of Object.entries({ start: member.endOffsets.start, end: member.endOffsets.end })) for (const [axis, value] of Object.entries(offset)) if (!finite(value)) issues.push({ severity: 'error', path: `members.${member.id}.endOffsets.${endName}.${axis}`, message: 'Member end-offset coordinates must be finite.' });
      if (start && end) { const effectiveLength = Math.hypot(start.position.x + member.endOffsets.start.x - end.position.x - member.endOffsets.end.x, start.position.y + member.endOffsets.start.y - end.position.y - member.endOffsets.end.y, start.position.z + member.endOffsets.start.z - end.position.z - member.endOffsets.end.z); if (effectiveLength <= 1e-9) issues.push({ severity: 'error', path: `members.${member.id}.endOffsets`, message: 'Member end offsets collapse the physical member length.' }); }
    }
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
  const meshIds = new Set(project.building.surfaceMeshes.map((mesh) => mesh.id));
  for (const load of project.surfacePressureLoads) {
    if (!meshIds.has(load.surfaceMeshId)) issues.push({ severity: 'error', path: `surfacePressureLoads.${load.id}.surfaceMeshId`, message: 'Surface pressure load references a missing surface mesh.' });
    if (!loadCaseIds.has(load.loadCaseId)) issues.push({ severity: 'error', path: `surfacePressureLoads.${load.id}.loadCaseId`, message: 'Surface pressure load references a missing load case.' });
    issues.push(...validateSurfacePressureLoad(load).map((issue) => ({ ...issue, path: `surfacePressureLoads.${load.id}.${issue.path}` })));
  }
  for (const spring of project.nodalSprings) {
    if (!nodeIds.has(spring.nodeId)) issues.push({ severity: 'error', path: `nodalSprings.${spring.id}.nodeId`, message: 'Nodal spring references a missing node.' });
    if (!spring.name.trim()) issues.push({ severity: 'error', path: `nodalSprings.${spring.id}.name`, message: 'Nodal spring name is required.' });
    issues.push(...validateNodalSpring(spring).map((issue) => ({ ...issue, path: `nodalSprings.${spring.id}.${issue.path}` })));
  }
  for (const settlement of project.settlements) {
    if (!nodeIds.has(settlement.nodeId)) issues.push({ severity: 'error', path: `settlements.${settlement.id}.nodeId`, message: 'Settlement references a missing node.' });
    if (!loadCaseIds.has(settlement.loadCaseId)) issues.push({ severity: 'error', path: `settlements.${settlement.id}.loadCaseId`, message: 'Settlement references a missing load case.' });
    if (!settlement.name.trim()) issues.push({ severity: 'error', path: `settlements.${settlement.id}.name`, message: 'Settlement name is required.' });
    issues.push(...validateKinematicVector(settlement.values).map((issue) => ({ ...issue, path: `settlements.${settlement.id}.${issue.path}` })));
  }
  const rigidPairs = new Set<string>();
  for (const link of project.rigidLinks) {
    if (!nodeIds.has(link.masterNodeId) || !nodeIds.has(link.slaveNodeId)) issues.push({ severity: 'error', path: `rigidLinks.${link.id}`, message: 'Rigid link references a missing node.' });
    if (link.masterNodeId === link.slaveNodeId) issues.push({ severity: 'error', path: `rigidLinks.${link.id}`, message: 'Rigid-link master and slave nodes must differ.' });
    if (!isDofVector(link.restrainedDofs) || !link.restrainedDofs.some(Boolean)) issues.push({ severity: 'error', path: `rigidLinks.${link.id}.restrainedDofs`, message: 'Rigid link must constrain at least one valid DOF.' });
    const pair = [link.masterNodeId, link.slaveNodeId].sort().join(':');
    if (rigidPairs.has(pair)) issues.push({ severity: 'error', path: `rigidLinks.${link.id}`, message: 'Only one rigid link is allowed between a node pair.' });
    rigidPairs.add(pair);
  }
  for (const load of project.thermalLoads) {
    if (!memberIds.has(load.memberId)) issues.push({ severity: 'error', path: `thermalLoads.${load.id}.memberId`, message: 'Thermal load references a missing member.' });
    if (!loadCaseIds.has(load.loadCaseId)) issues.push({ severity: 'error', path: `thermalLoads.${load.id}.loadCaseId`, message: 'Thermal load references a missing load case.' });
    if (!load.name.trim()) issues.push({ severity: 'error', path: `thermalLoads.${load.id}.name`, message: 'Thermal load name is required.' });
    if (!finite(load.deltaTemperature) || load.deltaTemperature === 0) issues.push({ severity: 'error', path: `thermalLoads.${load.id}.deltaTemperature`, message: 'Thermal delta must be finite and non-zero.' });
    if (!positive(load.thermalExpansionCoefficient)) issues.push({ severity: 'error', path: `thermalLoads.${load.id}.thermalExpansionCoefficient`, message: 'Thermal expansion coefficient must be positive and finite in 1/K.' });
  }
  for (const displacement of project.imposedDisplacements) {
    if (!nodeIds.has(displacement.nodeId)) issues.push({ severity: 'error', path: `imposedDisplacements.${displacement.id}.nodeId`, message: 'Imposed displacement references a missing node.' });
    if (!loadCaseIds.has(displacement.loadCaseId)) issues.push({ severity: 'error', path: `imposedDisplacements.${displacement.id}.loadCaseId`, message: 'Imposed displacement references a missing load case.' });
    if (!displacement.name.trim()) issues.push({ severity: 'error', path: `imposedDisplacements.${displacement.id}.name`, message: 'Imposed-displacement name is required.' });
    issues.push(...validateKinematicVector(displacement.values).map((issue) => ({ ...issue, path: `imposedDisplacements.${displacement.id}.${issue.path}` })));
  }
  for (const load of project.windLoads) {
    if (!loadCaseIds.has(load.loadCaseId)) issues.push({ severity: 'error', path: `windLoads.${load.id}.loadCaseId`, message: 'Wind definition references a missing load case.' });
    if (!load.name.trim()) issues.push({ severity: 'error', path: `windLoads.${load.id}.name`, message: 'Wind definition name is required.' });
    if (!globalDirections.has(load.direction)) issues.push({ severity: 'error', path: `windLoads.${load.id}.direction`, message: 'Wind direction must use a global axis.' });
    if (!positive(load.pressure)) issues.push({ severity: 'error', path: `windLoads.${load.id}.pressure`, message: 'Wind pressure must be a positive finite SI pressure in Pa.' });
  }
  for (const load of project.seismicLoads) {
    if (!loadCaseIds.has(load.loadCaseId)) issues.push({ severity: 'error', path: `seismicLoads.${load.id}.loadCaseId`, message: 'Seismic definition references a missing load case.' });
    if (!load.name.trim()) issues.push({ severity: 'error', path: `seismicLoads.${load.id}.name`, message: 'Seismic definition name is required.' });
    if (!['global-x', 'global-z'].includes(load.direction)) issues.push({ severity: 'error', path: `seismicLoads.${load.id}.direction`, message: 'Seismic direction must be global X or global Z.' });
    for (const [key, value] of Object.entries({ designAcceleration: load.designAcceleration, importanceFactor: load.importanceFactor, responseReductionFactor: load.responseReductionFactor })) if (!positive(value)) issues.push({ severity: 'error', path: `seismicLoads.${load.id}.${key}`, message: `${key} must be positive and finite.` });
  }
  return issues;
}
