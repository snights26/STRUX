import { PROJECT_SCHEMA_VERSION, type Project } from './types';
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
const hasOptionalName = (value: Record<string, unknown>): boolean => value.name === undefined || isString(value.name);
const hasMemberReleases = (value: unknown): boolean => isRecord(value) && hasDofVector(value.start) && hasDofVector(value.end);

/** Upgrade persisted M1 project JSON without changing its SI values or existing identifiers. */
function migrateProject(value: Record<string, unknown>): Record<string, unknown> | null {
  if (value.schemaVersion === PROJECT_SCHEMA_VERSION) return value;
  if (value.schemaVersion !== 1) return null;
  const migrated = structuredClone(value);
  migrated.schemaVersion = PROJECT_SCHEMA_VERSION;
  migrated.loadCombinations = [];
  migrated.memberPointLoads = [];
  migrated.memberDistributedLoads = [];
  migrated.selfWeightLoads = [];
  if (Array.isArray(migrated.members)) migrated.members = migrated.members.map((member) => isRecord(member) ? { ...member, endReleases: hasMemberReleases(member.endReleases) ? member.endReleases : { start: [false, false, false, false, false, false], end: [false, false, false, false, false, false] } } : member);
  return migrated;
}

function payloadErrors(value: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!isString(value.id) || !isString(value.name) || !isString(value.description) || !isString(value.createdAt) || !isString(value.updatedAt)) errors.push('Project metadata is malformed.');
  if (!isRecord(value.settings) || !['metric', 'imperial'].includes(String(value.settings.unitSystem)) || !isNumber(value.settings.gridSpacing) || !isNumber(value.settings.gridExtents)) errors.push('Project settings are malformed.');
  if (!isRecord(value.extensions)) errors.push('Project extensions must be an object.');
  const arrays = ['nodes', 'members', 'materials', 'sections', 'supports', 'loadCases', 'loadCombinations', 'nodalLoads', 'memberPointLoads', 'memberDistributedLoads', 'selfWeightLoads'] as const;
  for (const key of arrays) if (!Array.isArray(value[key])) errors.push(`Invalid project: ${key} must be an array.`);
  if (errors.length) return errors;
  const arraysByName = value as Record<typeof arrays[number], unknown[]>;
  if (!arraysByName.nodes.every((item) => hasStringId(item) && isString(item.name) && isRecord(item.position) && hasVector3(item.position))) errors.push('Node payload is malformed.');
  if (!arraysByName.members.every((item) => hasStringId(item) && isString(item.name) && isString(item.startNodeId) && isString(item.endNodeId) && isString(item.materialId) && isString(item.sectionId) && isNumber(item.rollAngle) && hasMemberReleases(item.endReleases))) errors.push('Member payload is malformed.');
  if (!arraysByName.materials.every((item) => hasStringId(item) && isString(item.name) && isString(item.kind) && isNumber(item.elasticModulus) && isNumber(item.poissonRatio) && isNumber(item.density) && (item.yieldStrength === undefined || isNumber(item.yieldStrength)))) errors.push('Material payload is malformed.');
  if (!arraysByName.sections.every((item) => hasStringId(item) && isString(item.name) && isString(item.shape) && isNumber(item.area) && isNumber(item.iy) && isNumber(item.iz) && isNumber(item.torsionalConstant) && (item.depth === undefined || isNumber(item.depth)) && (item.width === undefined || isNumber(item.width)))) errors.push('Section payload is malformed.');
  if (!arraysByName.supports.every((item) => hasStringId(item) && isString(item.nodeId) && isString(item.type) && hasDofVector(item.restraints))) errors.push('Support payload is malformed.');
  if (!arraysByName.loadCases.every((item) => hasStringId(item) && isString(item.name) && isString(item.category) && typeof item.isActive === 'boolean')) errors.push('Load-case payload is malformed.');
  if (!arraysByName.loadCombinations.every((item) => hasStringId(item) && isString(item.name) && Array.isArray(item.factors) && item.factors.every((factor) => isRecord(factor) && isString(factor.loadCaseId) && isNumber(factor.factor)))) errors.push('Load-combination payload is malformed.');
  if (!arraysByName.nodalLoads.every((item) => hasStringId(item) && isString(item.nodeId) && isString(item.loadCaseId) && hasForceVector(item.values) && hasOptionalName(item))) errors.push('Nodal-load payload is malformed.');
  if (!arraysByName.memberPointLoads.every((item) => hasStringId(item) && isString(item.memberId) && isString(item.loadCaseId) && isString(item.direction) && isNumber(item.magnitude) && isNumber(item.position) && hasOptionalName(item))) errors.push('Member point-load payload is malformed.');
  if (!arraysByName.memberDistributedLoads.every((item) => hasStringId(item) && isString(item.memberId) && isString(item.loadCaseId) && isString(item.direction) && isNumber(item.startMagnitude) && isNumber(item.endMagnitude) && hasOptionalName(item))) errors.push('Member distributed-load payload is malformed.');
  if (!arraysByName.selfWeightLoads.every((item) => hasStringId(item) && isString(item.loadCaseId) && isString(item.direction) && isNumber(item.factor) && hasOptionalName(item))) errors.push('Self-weight payload is malformed.');
  return errors;
}

/** Strict import boundary with explicit M1-to-M3 migration and no silent unit conversion. */
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
