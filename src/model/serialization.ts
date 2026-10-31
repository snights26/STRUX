import { PROJECT_SCHEMA_VERSION, type Project } from './types';
import { createBuildingModel } from './building';
import { validateProject } from './validation';

export interface ImportResult {
  project?: Project;
  errors: string[];
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const hasStringId = (value: unknown): value is Record<string, unknown> & { id: string } => isRecord(value) && isString(value.id);
const hasVector3 = (value: unknown): boolean => isRecord(value) && isNumber(value.x) && isNumber(value.y) && isNumber(value.z);
const hasForceVector = (value: unknown): boolean => isRecord(value) && ['fx', 'fy', 'fz', 'mx', 'my', 'mz'].every((key) => isNumber(value[key]));
const hasDofVector = (value: unknown): boolean => Array.isArray(value) && value.length === 6 && value.every((item) => typeof item === 'boolean');
const hasKinematicVector = (value: unknown): boolean => isRecord(value) && ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'].every((key) => isNumber(value[key]));
const hasSpringStiffness = (value: unknown): boolean => isRecord(value) && ['kx', 'ky', 'kz', 'krx', 'kry', 'krz'].every((key) => isNumber(value[key]));
const hasSurfacePressureLoad = (value: unknown): boolean => isRecord(value) && hasStringId(value) && isString(value.name) && isString(value.surfaceMeshId) && isString(value.loadCaseId) && isNumber(value.pressure);
const hasOptionalName = (value: Record<string, unknown>): boolean => value.name === undefined || isString(value.name);
const hasMemberReleases = (value: unknown): boolean => isRecord(value) && hasDofVector(value.start) && hasDofVector(value.end);
const hasMemberOffsets = (value: unknown): boolean => isRecord(value) && value.coordinateSystem === 'global' && hasVector3(value.start) && hasVector3(value.end);
function hasSectionCatalogue(value: unknown): boolean {
  if (!isRecord(value) || !['general', 'rectangular', 'circular', 'i-section'].includes(String(value.family)) || !isString(value.designation) || value.propertyUnits !== 'SI-m2-m4') return false;
  const geometry = value.geometry; const provenance = value.provenance;
  if (!isRecord(geometry) || geometry.units !== 'SI-m' || !isRecord(provenance) || !isString(provenance.source)) return false;
  if (!['depth', 'width', 'flangeThickness', 'webThickness'].every((key) => geometry[key] === undefined || isNumber(geometry[key]))) return false;
  return (provenance.edition === undefined || isString(provenance.edition)) && (provenance.reference === undefined || isString(provenance.reference));
}

const hasStorey = (value: unknown): boolean => isRecord(value) && hasStringId(value) && isString(value.name) && isNumber(value.elevation) && isNumber(value.height) && ['ground', 'typical', 'roof'].includes(String(value.role));
const hasGridLine = (value: unknown): boolean => isRecord(value) && hasStringId(value) && ['x', 'z'].includes(String(value.axis)) && isString(value.label) && isNumber(value.coordinate);
const hasNodeIdLoop = (value: unknown): value is string[] => Array.isArray(value) && value.length >= 3 && value.every(isString);
const hasOpening = (value: unknown): boolean => isRecord(value) && hasStringId(value) && isString(value.name) && hasNodeIdLoop(value.boundaryNodeIds);
const hasSlab = (value: unknown): boolean => isRecord(value) && hasStringId(value) && isString(value.name) && isString(value.storeyId) && hasNodeIdLoop(value.boundaryNodeIds) && isNumber(value.thickness) && isString(value.materialId) && Array.isArray(value.openings) && value.openings.every(hasOpening) && (value.diaphragmId === undefined || isString(value.diaphragmId));
const hasWall = (value: unknown): boolean => isRecord(value) && hasStringId(value) && isString(value.name) && isString(value.storeyId) && isString(value.startNodeId) && isString(value.endNodeId) && isNumber(value.thickness) && isString(value.materialId);
const hasMeshNode = (value: unknown): boolean => isRecord(value) && hasStringId(value) && hasVector3(value.position);
const hasMeshElement = (value: unknown): boolean => isRecord(value) && hasStringId(value) && ['tri3', 'quad4'].includes(String(value.type)) && Array.isArray(value.nodeIds) && value.nodeIds.every(isString);
const hasMeshDensity = (value: unknown): boolean => isRecord(value) && isNumber(value.targetElementSize) && isNumber(value.maxAspectRatio);
const hasSurfaceMesh = (value: unknown): boolean => isRecord(value) && hasStringId(value) && isString(value.name) && ['slab', 'wall'].includes(String(value.sourceKind)) && isString(value.sourceId) && hasMeshDensity(value.density) && isString(value.sourceSignature) && Array.isArray(value.nodes) && value.nodes.every(hasMeshNode) && Array.isArray(value.elements) && value.elements.every(hasMeshElement);
const hasDiaphragm = (value: unknown): boolean => isRecord(value) && hasStringId(value) && isString(value.name) && isString(value.storeyId) && ['rigid', 'semi-rigid'].includes(String(value.type)) && Array.isArray(value.nodeIds) && value.nodeIds.every(isString) && (value.inPlaneStiffness === undefined || isNumber(value.inPlaneStiffness));
const hasBuilding = (value: unknown): boolean => isRecord(value) && isNumber(value.typicalStoreyHeight) && Array.isArray(value.storeys) && value.storeys.every(hasStorey) && Array.isArray(value.gridLines) && value.gridLines.every(hasGridLine) && Array.isArray(value.slabs) && value.slabs.every(hasSlab) && Array.isArray(value.walls) && value.walls.every(hasWall) && Array.isArray(value.surfaceMeshes) && value.surfaceMeshes.every(hasSurfaceMesh) && Array.isArray(value.diaphragms) && value.diaphragms.every(hasDiaphragm);

/** Upgrade persisted M1–M3 project JSON without changing SI values or existing identifiers. */
function migrateProject(value: Record<string, unknown>): Record<string, unknown> | null {
  if (![1, 2, 3, PROJECT_SCHEMA_VERSION].includes(value.schemaVersion as number)) return null;
  const migrated = structuredClone(value);
  if (migrated.schemaVersion === 1) {
    migrated.schemaVersion = 2;
    migrated.loadCombinations = [];
    migrated.memberPointLoads = [];
    migrated.memberDistributedLoads = [];
    migrated.selfWeightLoads = [];
    if (Array.isArray(migrated.members)) migrated.members = migrated.members.map((member) => isRecord(member) ? { ...member, endReleases: hasMemberReleases(member.endReleases) ? member.endReleases : { start: [false, false, false, false, false, false], end: [false, false, false, false, false, false] } } : member);
  }
  if (migrated.schemaVersion === 2) {
    migrated.schemaVersion = 3;
    migrated.building = createBuildingModel();
  }
  if (migrated.schemaVersion === 3) {
    migrated.schemaVersion = PROJECT_SCHEMA_VERSION;
    const defaults = createBuildingModel();
    migrated.building = isRecord(migrated.building) ? { ...defaults, ...migrated.building, surfaceMeshes: [], diaphragms: [] } : defaults;
    migrated.nodalSprings = [];
    migrated.settlements = [];
    migrated.rigidLinks = [];
    migrated.thermalLoads = [];
    migrated.imposedDisplacements = [];
    migrated.windLoads = [];
    migrated.seismicLoads = [];
  }
  // Schema v4 projects created before M7D have no surface pressure collection.
  // This additive default preserves their geometry and SI values unchanged.
  if (migrated.schemaVersion === PROJECT_SCHEMA_VERSION && !Array.isArray(migrated.surfacePressureLoads)) migrated.surfacePressureLoads = [];
  return migrated;
}

function payloadErrors(value: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!isString(value.id) || !isString(value.name) || !isString(value.description) || !isString(value.createdAt) || !isString(value.updatedAt)) errors.push('Project metadata is malformed.');
  if (!isRecord(value.settings) || !['metric', 'imperial'].includes(String(value.settings.unitSystem)) || !isNumber(value.settings.gridSpacing) || !isNumber(value.settings.gridExtents)) errors.push('Project settings are malformed.');
  if (!hasBuilding(value.building)) errors.push('Building-model payload is malformed.');
  if (!isRecord(value.extensions)) errors.push('Project extensions must be an object.');
  const arrays = ['nodes', 'members', 'materials', 'sections', 'supports', 'loadCases', 'loadCombinations', 'nodalLoads', 'memberPointLoads', 'memberDistributedLoads', 'selfWeightLoads', 'surfacePressureLoads', 'nodalSprings', 'settlements', 'rigidLinks', 'thermalLoads', 'imposedDisplacements', 'windLoads', 'seismicLoads'] as const;
  for (const key of arrays) if (!Array.isArray(value[key])) errors.push(`Invalid project: ${key} must be an array.`);
  if (errors.length) return errors;
  const arraysByName = value as Record<typeof arrays[number], unknown[]>;
  if (!arraysByName.nodes.every((item) => hasStringId(item) && isString(item.name) && isRecord(item.position) && hasVector3(item.position) && (item.storeyId === undefined || isString(item.storeyId)))) errors.push('Node payload is malformed.');
  if (!arraysByName.members.every((item) => hasStringId(item) && isString(item.name) && isString(item.startNodeId) && isString(item.endNodeId) && isString(item.materialId) && isString(item.sectionId) && isNumber(item.rollAngle) && hasMemberReleases(item.endReleases) && (item.storeyId === undefined || isString(item.storeyId)) && (item.endStoreyId === undefined || isString(item.endStoreyId)) && (item.endOffsets === undefined || hasMemberOffsets(item.endOffsets)))) errors.push('Member payload is malformed.');
  if (!arraysByName.materials.every((item) => hasStringId(item) && isString(item.name) && isString(item.kind) && isNumber(item.elasticModulus) && isNumber(item.poissonRatio) && isNumber(item.density) && (item.yieldStrength === undefined || isNumber(item.yieldStrength)))) errors.push('Material payload is malformed.');
  if (!arraysByName.sections.every((item) => hasStringId(item) && isString(item.name) && isString(item.shape) && isNumber(item.area) && isNumber(item.iy) && isNumber(item.iz) && isNumber(item.torsionalConstant) && (item.depth === undefined || isNumber(item.depth)) && (item.width === undefined || isNumber(item.width)) && (item.catalogue === undefined || hasSectionCatalogue(item.catalogue)))) errors.push('Section payload is malformed.');
  if (!arraysByName.supports.every((item) => hasStringId(item) && isString(item.nodeId) && isString(item.type) && hasDofVector(item.restraints))) errors.push('Support payload is malformed.');
  if (!arraysByName.loadCases.every((item) => hasStringId(item) && isString(item.name) && isString(item.category) && typeof item.isActive === 'boolean')) errors.push('Load-case payload is malformed.');
  if (!arraysByName.loadCombinations.every((item) => hasStringId(item) && isString(item.name) && Array.isArray(item.factors) && item.factors.every((factor) => isRecord(factor) && isString(factor.loadCaseId) && isNumber(factor.factor)))) errors.push('Load-combination payload is malformed.');
  if (!arraysByName.nodalLoads.every((item) => hasStringId(item) && isString(item.nodeId) && isString(item.loadCaseId) && hasForceVector(item.values) && hasOptionalName(item))) errors.push('Nodal-load payload is malformed.');
  if (!arraysByName.memberPointLoads.every((item) => hasStringId(item) && isString(item.memberId) && isString(item.loadCaseId) && isString(item.direction) && isNumber(item.magnitude) && isNumber(item.position) && hasOptionalName(item))) errors.push('Member point-load payload is malformed.');
  if (!arraysByName.memberDistributedLoads.every((item) => hasStringId(item) && isString(item.memberId) && isString(item.loadCaseId) && isString(item.direction) && isNumber(item.startMagnitude) && isNumber(item.endMagnitude) && hasOptionalName(item))) errors.push('Member distributed-load payload is malformed.');
  if (!arraysByName.selfWeightLoads.every((item) => hasStringId(item) && isString(item.loadCaseId) && isString(item.direction) && isNumber(item.factor) && hasOptionalName(item))) errors.push('Self-weight payload is malformed.');
  if (!arraysByName.surfacePressureLoads.every(hasSurfacePressureLoad)) errors.push('Surface-pressure-load payload is malformed.');
  if (!arraysByName.nodalSprings.every((item) => hasStringId(item) && isString(item.name) && isString(item.nodeId) && hasSpringStiffness(item.stiffness))) errors.push('Nodal-spring payload is malformed.');
  if (!arraysByName.settlements.every((item) => hasStringId(item) && isString(item.name) && isString(item.nodeId) && isString(item.loadCaseId) && hasKinematicVector(item.values))) errors.push('Settlement payload is malformed.');
  if (!arraysByName.rigidLinks.every((item) => hasStringId(item) && isString(item.name) && isString(item.masterNodeId) && isString(item.slaveNodeId) && hasDofVector(item.restrainedDofs))) errors.push('Rigid-link payload is malformed.');
  if (!arraysByName.thermalLoads.every((item) => hasStringId(item) && isString(item.name) && isString(item.memberId) && isString(item.loadCaseId) && isNumber(item.deltaTemperature) && isNumber(item.thermalExpansionCoefficient))) errors.push('Thermal-load payload is malformed.');
  if (!arraysByName.imposedDisplacements.every((item) => hasStringId(item) && isString(item.name) && isString(item.nodeId) && isString(item.loadCaseId) && hasKinematicVector(item.values))) errors.push('Imposed-displacement payload is malformed.');
  if (!arraysByName.windLoads.every((item) => hasStringId(item) && isString(item.name) && isString(item.loadCaseId) && isString(item.direction) && isNumber(item.pressure) && (item.provenance === undefined || isString(item.provenance)))) errors.push('Wind-load payload is malformed.');
  if (!arraysByName.seismicLoads.every((item) => hasStringId(item) && isString(item.name) && isString(item.loadCaseId) && isString(item.direction) && isNumber(item.designAcceleration) && isNumber(item.importanceFactor) && isNumber(item.responseReductionFactor) && (item.provenance === undefined || isString(item.provenance)))) errors.push('Seismic-load payload is malformed.');
  return errors;
}

/** Strict import boundary with explicit M1-to-M4 migration and no silent unit conversion. */
export function parseProject(raw: string): ImportResult {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { errors: ['File is not valid JSON.'] }; }
  if (!isRecord(value)) return { errors: ['Project root must be an object.'] };
  const migrated = migrateProject(value);
  if (!migrated) return { errors: [`Unsupported schema version: ${String(value.schemaVersion)}.`] };
  const errors = payloadErrors(migrated);
  if (errors.length) return { errors };
  const project = migrated as unknown as Project;
  const issues = validateProject(project).filter((issue) => issue.severity === 'error');
  if (issues.length) return { errors: issues.map((issue) => `${issue.path}: ${issue.message}`) };
  return { project, errors: [] };
}
