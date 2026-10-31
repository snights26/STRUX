import { withTimestamp } from '../model/project';
import type { Member, Project, Vector3 } from '../model/types';

export type DxfUnit = 'unitless' | 'inch' | 'foot' | 'millimetre' | 'centimetre' | 'metre';

export interface DxfImportOptions {
  /** Override DXF $INSUNITS when the source is unitless or incorrectly tagged. */
  units?: DxfUnit;
  /** STRUX Y offset in metres. DXF X/Y map to STRUX X/Z; DXF Z remains vertical. */
  targetElevation?: number;
  duplicateTolerance?: number;
  storeyId?: string;
}

export interface DxfDiagnostic { severity: 'error' | 'warning' | 'info'; code: string; message: string; entity?: string; }
export interface DxfSegment { start: Vector3; end: Vector3; sourceEntity: 'LINE' | 'LWPOLYLINE' | 'POLYLINE'; }
export interface DxfGeometryResult { segments: DxfSegment[]; diagnostics: DxfDiagnostic[]; units: DxfUnit; scaleToMetres: number; }
export interface DxfProjectImportResult extends DxfGeometryResult { project?: Project; addedNodeIds: string[]; addedMemberIds: string[]; }

interface Pair { code: number; value: string; }
interface RawEntity { type: string; pairs: Pair[]; }

const UNIT_SCALE: Record<DxfUnit, number> = { unitless: 1, inch: 0.0254, foot: 0.3048, millimetre: 0.001, centimetre: 0.01, metre: 1 };
const DXF_UNITS: Record<number, DxfUnit> = { 0: 'unitless', 1: 'inch', 2: 'foot', 4: 'millimetre', 5: 'centimetre', 6: 'metre' };

function pairs(raw: string): Pair[] {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/);
  const result: Pair[] = [];
  for (let index = 0; index + 1 < lines.length; index += 2) { const code = Number(lines[index].trim()); if (Number.isFinite(code)) result.push({ code, value: lines[index + 1].trim() }); }
  return result;
}

function dxfUnits(source: Pair[]): DxfUnit {
  for (let index = 0; index + 1 < source.length; index += 1) if (source[index].code === 9 && source[index].value === '$INSUNITS' && source[index + 1].code === 70) return DXF_UNITS[Number(source[index + 1].value)] ?? 'unitless';
  return 'unitless';
}

function entities(source: Pair[]): RawEntity[] {
  const start = source.findIndex((pair, index) => pair.code === 0 && pair.value === 'SECTION' && source[index + 1]?.code === 2 && source[index + 1]?.value === 'ENTITIES');
  if (start < 0) return [];
  const result: RawEntity[] = [];
  let current: RawEntity | undefined;
  for (let index = start + 2; index < source.length; index += 1) {
    const pair = source[index];
    if (pair.code === 0 && pair.value === 'ENDSEC') break;
    if (pair.code === 0) { if (current) result.push(current); current = { type: pair.value, pairs: [] }; }
    else current?.pairs.push(pair);
  }
  if (current) result.push(current);
  return result;
}

const number = (source: Pair[], code: number, fallback = 0) => { const value = source.find((pair) => pair.code === code)?.value; const parsed = value === undefined ? fallback : Number(value); return Number.isFinite(parsed) ? parsed : fallback; };
const hasBulge = (source: Pair[]) => source.some((pair) => pair.code === 42 && Math.abs(Number(pair.value)) > 1e-12);

function point(source: Pair[], xCode: number, yCode: number, zCode: number, fallbackZ = 0): { x: number; y: number; z: number } { return { x: number(source, xCode), y: number(source, yCode), z: number(source, zCode, fallbackZ) }; }

function verticesFromPairs(source: Pair[], elevation = 0): { x: number; y: number; z: number }[] {
  const vertices: { x: number; y: number; z: number }[] = [];
  for (let index = 0; index < source.length; index += 1) if (source[index].code === 10) vertices.push({ x: number(source.slice(index), 10), y: number(source.slice(index), 20), z: number(source.slice(index), 30, elevation) });
  return vertices;
}

function polylineSegments(vertices: { x: number; y: number; z: number }[], closed: boolean, sourceEntity: DxfSegment['sourceEntity'], map: (point: { x: number; y: number; z: number }) => Vector3): DxfSegment[] {
  const segments: DxfSegment[] = [];
  for (let index = 1; index < vertices.length; index += 1) segments.push({ start: map(vertices[index - 1]), end: map(vertices[index]), sourceEntity });
  if (closed && vertices.length > 2) segments.push({ start: map(vertices.at(-1)!), end: map(vertices[0]), sourceEntity });
  return segments;
}

function parseClassicPolyline(all: RawEntity[], index: number, map: (point: { x: number; y: number; z: number }) => Vector3, diagnostics: DxfDiagnostic[]): { segments: DxfSegment[]; next: number } {
  const header = all[index]; const flags = number(header.pairs, 70); const vertices: { x: number; y: number; z: number }[] = [];
  let current = index + 1;
  for (; current < all.length && all[current].type !== 'SEQEND'; current += 1) {
    if (all[current].type === 'VERTEX') vertices.push(point(all[current].pairs, 10, 20, 30));
    else { diagnostics.push({ severity: 'warning', code: 'UNSUPPORTED_POLYLINE_COMPONENT', entity: all[current].type, message: `POLYLINE component '${all[current].type}' was ignored.` }); }
  }
  if (flags & 8) diagnostics.push({ severity: 'warning', code: 'UNSUPPORTED_3D_POLYLINE', entity: 'POLYLINE', message: '3D POLYLINE flags are not supported; vertices were imported as analytical lines only.' });
  if (vertices.length < 2) diagnostics.push({ severity: 'warning', code: 'EMPTY_POLYLINE', entity: 'POLYLINE', message: 'POLYLINE contains fewer than two vertices.' });
  return { segments: polylineSegments(vertices, Boolean(flags & 1), 'POLYLINE', map), next: current };
}

function samePoint(left: Vector3, right: Vector3, tolerance: number): boolean { return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z) <= tolerance; }
function duplicateSegment(left: DxfSegment, right: DxfSegment, tolerance: number): boolean { return (samePoint(left.start, right.start, tolerance) && samePoint(left.end, right.end, tolerance)) || (samePoint(left.start, right.end, tolerance) && samePoint(left.end, right.start, tolerance)); }

/**
 * Imports only analytical LINE/LWPOLYLINE/POLYLINE geometry. DXF XY becomes the
 * STRUX horizontal XZ plane; DXF Z is preserved as STRUX vertical Y.
 */
export function parseDxfAnalyticalGeometry(raw: string, options: DxfImportOptions = {}): DxfGeometryResult {
  const source = pairs(raw); const detected = dxfUnits(source); const units = options.units ?? detected; const scaleToMetres = UNIT_SCALE[units];
  const diagnostics: DxfDiagnostic[] = []; const tolerance = options.duplicateTolerance ?? 1e-6;
  if (!Number.isFinite(options.targetElevation ?? 0) || !Number.isFinite(tolerance) || tolerance <= 0) return { segments: [], units, scaleToMetres, diagnostics: [{ severity: 'error', code: 'INVALID_DXF_IMPORT_OPTIONS', message: 'Target elevation must be finite and duplicate tolerance must be positive.' }] };
  if (detected === 'unitless' && !options.units) diagnostics.push({ severity: 'warning', code: 'DXF_UNITLESS', message: 'DXF has no supported $INSUNITS value; metres were assumed. Supply an explicit unit override if this is incorrect.' });
  const map = (rawPoint: { x: number; y: number; z: number }): Vector3 => ({ x: rawPoint.x * scaleToMetres, y: rawPoint.z * scaleToMetres + (options.targetElevation ?? 0), z: rawPoint.y * scaleToMetres });
  const imported: DxfSegment[] = []; const all = entities(source);
  if (!all.length) diagnostics.push({ severity: 'error', code: 'DXF_ENTITIES_MISSING', message: 'No ENTITIES section was found in the DXF file.' });
  for (let index = 0; index < all.length; index += 1) {
    const entity = all[index]; let candidates: DxfSegment[] = [];
    if (entity.type === 'LINE') candidates = [{ start: map(point(entity.pairs, 10, 20, 30)), end: map(point(entity.pairs, 11, 21, 31)), sourceEntity: 'LINE' }];
    else if (entity.type === 'LWPOLYLINE') {
      if (hasBulge(entity.pairs)) { diagnostics.push({ severity: 'warning', code: 'UNSUPPORTED_POLYLINE_BULGE', entity: entity.type, message: 'LWPOLYLINE bulge arcs are unsupported and were skipped.' }); continue; }
      candidates = polylineSegments(verticesFromPairs(entity.pairs, number(entity.pairs, 38)), Boolean(number(entity.pairs, 70) & 1), 'LWPOLYLINE', map);
    } else if (entity.type === 'POLYLINE') { const parsed = parseClassicPolyline(all, index, map, diagnostics); candidates = parsed.segments; index = parsed.next; }
    else if (entity.type !== 'VERTEX' && entity.type !== 'SEQEND') diagnostics.push({ severity: 'info', code: 'UNSUPPORTED_DXF_ENTITY', entity: entity.type, message: `DXF entity '${entity.type}' is not imported as analytical geometry.` });
    for (const segment of candidates) {
      if (samePoint(segment.start, segment.end, tolerance)) { diagnostics.push({ severity: 'warning', code: 'DEGENERATE_DXF_SEGMENT', entity: entity.type, message: 'Zero-length DXF geometry was skipped.' }); continue; }
      if (imported.some((existing) => duplicateSegment(existing, segment, tolerance))) { diagnostics.push({ severity: 'info', code: 'DUPLICATE_DXF_GEOMETRY', entity: entity.type, message: 'Duplicate DXF line geometry was skipped.' }); continue; }
      imported.push(segment);
    }
  }
  return { segments: imported, diagnostics, units, scaleToMetres };
}

function uniqueId(existing: Set<string>, prefix: string): string { let index = 1; let candidate = `${prefix}-${index}`; while (existing.has(candidate)) { index += 1; candidate = `${prefix}-${index}`; } existing.add(candidate); return candidate; }

/** Applies parsed geometry as ordinary frame members using the existing first material/section. */
export function importDxfAnalyticalGeometry(project: Project, raw: string, options: DxfImportOptions = {}): DxfProjectImportResult {
  const parsed = parseDxfAnalyticalGeometry(raw, options); const diagnostics = [...parsed.diagnostics];
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return { ...parsed, diagnostics, addedNodeIds: [], addedMemberIds: [] };
  const materialId = project.materials[0]?.id; const sectionId = project.sections[0]?.id;
  if (!materialId || !sectionId) return { ...parsed, diagnostics: [...diagnostics, { severity: 'error', code: 'DXF_DEFAULT_PROPERTIES_MISSING', message: 'DXF import requires an existing material and section.' }], addedNodeIds: [], addedMemberIds: [] };
  if (options.storeyId && !project.building.storeys.some((storey) => storey.id === options.storeyId)) return { ...parsed, diagnostics: [...diagnostics, { severity: 'error', code: 'DXF_STOREY_MISSING', message: 'Configured DXF target storey does not exist.' }], addedNodeIds: [], addedMemberIds: [] };
  const next = structuredClone(project); const tolerance = options.duplicateTolerance ?? 1e-6; const ids = new Set([...next.nodes, ...next.members].map((item) => item.id)); const addedNodeIds: string[] = []; const addedMemberIds: string[] = [];
  const nodeAt = (position: Vector3) => {
    const existing = next.nodes.find((node) => samePoint(node.position, position, tolerance));
    if (existing) return existing;
    const node = { id: uniqueId(ids, 'dxf-node'), name: `DXF N${next.nodes.length + 1}`, position: { ...position }, ...(options.storeyId ? { storeyId: options.storeyId } : {}) };
    next.nodes.push(node); addedNodeIds.push(node.id); return node;
  };
  for (const segment of parsed.segments) {
    const start = nodeAt(segment.start); const end = nodeAt(segment.end);
    if (next.members.some((member) => (member.startNodeId === start.id && member.endNodeId === end.id) || (member.startNodeId === end.id && member.endNodeId === start.id))) { diagnostics.push({ severity: 'info', code: 'DUPLICATE_DXF_MEMBER', message: 'An equivalent existing frame member was retained.' }); continue; }
    const member: Member = { id: uniqueId(ids, 'dxf-member'), name: `DXF M${next.members.length + 1}`, type: 'beam', startNodeId: start.id, endNodeId: end.id, materialId, sectionId, rollAngle: 0, endReleases: { start: [false, false, false, false, false, false], end: [false, false, false, false, false, false] }, ...(options.storeyId ? { storeyId: options.storeyId } : {}) };
    next.members.push(member); addedMemberIds.push(member.id);
  }
  return { ...parsed, project: withTimestamp(next), diagnostics, addedNodeIds, addedMemberIds };
}
