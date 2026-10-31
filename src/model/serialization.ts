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

function payloadErrors(value: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!isString(value.id) || !isString(value.name) || !isString(value.description) || !isString(value.createdAt) || !isString(value.updatedAt)) errors.push('Project metadata is malformed.');
  if (!isRecord(value.settings) || !['metric', 'imperial'].includes(String(value.settings.unitSystem)) || !isNumber(value.settings.gridSpacing) || !isNumber(value.settings.gridExtents)) errors.push('Project settings are malformed.');
  if (!isRecord(value.extensions)) errors.push('Project extensions must be an object.');
  const arrays = ['nodes', 'members', 'materials', 'sections', 'supports', 'loadCases', 'nodalLoads'] as const;
  for (const key of arrays) if (!Array.isArray(value[key])) errors.push(`Invalid project: ${key} must be an array.`);
  if (errors.length) return errors;
  const arraysByName = value as Record<typeof arrays[number], unknown[]>;
  if (!arraysByName.nodes.every((item) => hasStringId(item) && isString(item.name) && isRecord(item.position) && hasVector3(item.position))) errors.push('Node payload is malformed.');
  if (!arraysByName.members.every((item) => hasStringId(item) && isString(item.name) && isString(item.startNodeId) && isString(item.endNodeId) && isString(item.materialId) && isString(item.sectionId) && isNumber(item.rollAngle))) errors.push('Member payload is malformed.');
  if (!arraysByName.materials.every((item) => hasStringId(item) && isString(item.name) && isString(item.kind) && isNumber(item.elasticModulus) && isNumber(item.poissonRatio) && isNumber(item.density))) errors.push('Material payload is malformed.');
  if (!arraysByName.sections.every((item) => hasStringId(item) && isString(item.name) && isString(item.shape) && isNumber(item.area) && isNumber(item.iy) && isNumber(item.iz) && isNumber(item.torsionalConstant))) errors.push('Section payload is malformed.');
  if (!arraysByName.supports.every((item) => hasStringId(item) && isString(item.nodeId) && isString(item.type) && Array.isArray(item.restraints) && item.restraints.length === 6 && item.restraints.every((restraint: unknown) => typeof restraint === 'boolean'))) errors.push('Support payload is malformed.');
  if (!arraysByName.loadCases.every((item) => hasStringId(item) && isString(item.name) && isString(item.category) && typeof item.isActive === 'boolean')) errors.push('Load-case payload is malformed.');
  if (!arraysByName.nodalLoads.every((item) => hasStringId(item) && isString(item.nodeId) && isString(item.loadCaseId) && hasForceVector(item.values))) errors.push('Nodal-load payload is malformed.');
  return errors;
}

/** A deliberately strict boundary that keeps corrupt JSON out of the modeling state. */
export function parseProject(raw: string): ImportResult {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { errors: ['File is not valid JSON.'] }; }
  if (!isRecord(value)) return { errors: ['Project root must be an object.'] };
  if (value.schemaVersion !== PROJECT_SCHEMA_VERSION) return { errors: [`Unsupported schema version: ${String(value.schemaVersion)}.`] };
  const errors = payloadErrors(value);
  if (errors.length) return { errors };
  const project = value as unknown as Project;
  const issues = validateProject(project).filter((issue) => issue.severity === 'error');
  if (issues.length) return { errors: issues.map((issue) => `${issue.path}: ${issue.message}`) };
  return { project, errors: [] };
}
