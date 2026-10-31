import { isSimplePlanPolygon, planPoints, pointStrictlyInsidePlanPolygon, signedPlanArea } from './building';
import type { MeshDensitySettings, ModelIssue, Project, Slab, SurfaceMesh, SurfaceMeshElement, SurfaceMeshNode, Vector3 } from './types';

const EPSILON = 1e-8;
const MAX_UNIFORM_REFINEMENT = 8;
const MAX_WALL_ELEMENTS = 10_000;

export const DEFAULT_MESH_DENSITY: MeshDensitySettings = { targetElementSize: 1, maxAspectRatio: 8 };

export interface MeshDiagnostic {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export interface MeshGenerationResult {
  mesh?: SurfaceMesh;
  diagnostics: MeshDiagnostic[];
}

export interface MeshQualityIssue extends MeshDiagnostic {
  elementId?: string;
}

const distance = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const midpoint = (a: Vector3, b: Vector3): Vector3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
const cross = (a: Vector3, b: Vector3, c: Vector3) => ({ x: (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y), y: (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z), z: (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) });
const magnitude = (vector: Vector3) => Math.hypot(vector.x, vector.y, vector.z);
const triangleArea = (a: Vector3, b: Vector3, c: Vector3) => magnitude(cross(a, b, c)) / 2;
const pointKey = (point: Vector3) => `${Math.round(point.x * 1e10)}:${Math.round(point.y * 1e10)}:${Math.round(point.z * 1e10)}`;

function finitePositive(value: number): boolean { return Number.isFinite(value) && value > 0; }

function densityDiagnostics(density: MeshDensitySettings): MeshDiagnostic[] {
  const diagnostics: MeshDiagnostic[] = [];
  if (!finitePositive(density.targetElementSize)) diagnostics.push({ severity: 'error', code: 'INVALID_MESH_DENSITY', message: 'Target element size must be a positive finite SI length.' });
  if (!finitePositive(density.maxAspectRatio) || density.maxAspectRatio < 1) diagnostics.push({ severity: 'error', code: 'INVALID_MESH_ASPECT_LIMIT', message: 'Maximum aspect ratio must be finite and at least 1.' });
  return diagnostics;
}

function pointStrictlyInTriangle(point: Vector3, a: Vector3, b: Vector3, c: Vector3): boolean {
  const sign = (first: Vector3, second: Vector3, third: Vector3) => (first.x - third.x) * (second.z - third.z) - (second.x - third.x) * (first.z - third.z);
  const d1 = sign(point, a, b); const d2 = sign(point, b, c); const d3 = sign(point, c, a);
  return (d1 > EPSILON && d2 > EPSILON && d3 > EPSILON) || (d1 < -EPSILON && d2 < -EPSILON && d3 < -EPSILON);
}

const planOrientation = (a: Vector3, b: Vector3, c: Vector3) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
const samePlanPoint = (a: Vector3, b: Vector3) => Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.z - b.z) <= EPSILON;
const properPlanIntersection = (a: Vector3, b: Vector3, c: Vector3, d: Vector3) => {
  const abC = planOrientation(a, b, c); const abD = planOrientation(a, b, d); const cdA = planOrientation(c, d, a); const cdB = planOrientation(c, d, b);
  return ((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON)) && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON));
};

function pointInPlanPolygon(point: Vector3, polygon: Vector3[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[previous]; const b = polygon[index];
    if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function bridgeIsVisible(holePoint: Vector3, outerPoint: Vector3, outer: Vector3[], holes: Vector3[][], bridges: [Vector3, Vector3][]): boolean {
  const midpointPoint = { x: (holePoint.x + outerPoint.x) / 2, y: (holePoint.y + outerPoint.y) / 2, z: (holePoint.z + outerPoint.z) / 2 };
  if (!pointInPlanPolygon(midpointPoint, outer) || holes.some((hole) => pointInPlanPolygon(midpointPoint, hole))) return false;
  const boundaries = [outer, ...holes];
  for (const boundary of boundaries) for (let index = 0; index < boundary.length; index += 1) {
    const start = boundary[index]; const end = boundary[(index + 1) % boundary.length];
    if (samePlanPoint(start, holePoint) || samePlanPoint(end, holePoint) || samePlanPoint(start, outerPoint) || samePlanPoint(end, outerPoint)) continue;
    if (properPlanIntersection(holePoint, outerPoint, start, end)) return false;
  }
  return !bridges.some(([start, end]) => properPlanIntersection(holePoint, outerPoint, start, end));
}

function rightmostIndex(points: Vector3[]): number {
  return points.reduce((best, point, index) => point.x > points[best].x + EPSILON || (Math.abs(point.x - points[best].x) <= EPSILON && point.z < points[best].z) ? index : best, 0);
}

/**
 * Joins clockwise hole loops into a CCW outer loop using visible bridges. The
 * duplicated bridge vertices are intentional constraints consumed by ear clipping.
 */
function bridgeOpenings(outerPoints: Vector3[], openingPoints: Vector3[][]): Vector3[] | undefined {
  let ring = signedPlanArea(outerPoints) >= 0 ? [...outerPoints] : [...outerPoints].reverse();
  const holes = openingPoints.map((opening) => signedPlanArea(opening) <= 0 ? [...opening] : [...opening].reverse())
    .sort((left, right) => right[rightmostIndex(right)].x - left[rightmostIndex(left)].x || left[rightmostIndex(left)].z - right[rightmostIndex(right)].z);
  const bridges: [Vector3, Vector3][] = [];
  for (const hole of holes) {
    const holeIndex = rightmostIndex(hole); const holePoint = hole[holeIndex];
    const candidates = ring.map((point, index) => ({ point, index })).filter((candidate) => candidate.point.x >= holePoint.x - EPSILON && bridgeIsVisible(holePoint, candidate.point, outerPoints, holes, bridges));
    const visible = (candidates.length ? candidates : ring.map((point, index) => ({ point, index })).filter((candidate) => bridgeIsVisible(holePoint, candidate.point, outerPoints, holes, bridges)))
      .sort((left, right) => distance(holePoint, left.point) - distance(holePoint, right.point) || right.point.x - left.point.x || left.point.z - right.point.z || left.index - right.index)[0];
    if (!visible) return undefined;
    const orderedHole = Array.from({ length: hole.length }, (_, index) => hole[(holeIndex + index) % hole.length]);
    ring = [...ring.slice(0, visible.index + 1), ...orderedHole, holePoint, visible.point, ...ring.slice(visible.index + 1)];
    bridges.push([holePoint, visible.point]);
  }
  return ring;
}

/** Deterministic ear clipping for a constrained plan loop. */
function triangulatePlan(points: Vector3[]): [Vector3, Vector3, Vector3][] | undefined {
  const ordered = signedPlanArea(points) >= 0 ? [...points] : [...points].reverse();
  const polygon = ordered.map((_, index) => index);
  const triangles: [Vector3, Vector3, Vector3][] = [];
  while (polygon.length > 3) {
    let clipped = false;
    for (let index = 0; index < polygon.length; index += 1) {
      const previous = polygon[(index - 1 + polygon.length) % polygon.length];
      const current = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
      const a = ordered[previous]; const b = ordered[current]; const c = ordered[next];
      const turn = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
      if (turn <= EPSILON) continue;
      if (polygon.some((candidate) => candidate !== previous && candidate !== current && candidate !== next && !samePlanPoint(ordered[candidate], a) && !samePlanPoint(ordered[candidate], b) && !samePlanPoint(ordered[candidate], c) && pointStrictlyInTriangle(ordered[candidate], a, b, c))) continue;
      triangles.push([a, b, c]); polygon.splice(index, 1); clipped = true; break;
    }
    if (!clipped) return undefined;
  }
  triangles.push([ordered[polygon[0]], ordered[polygon[1]], ordered[polygon[2]]]);
  return triangles;
}

function triangulateConstrainedPlan(outer: Vector3[], openings: Vector3[][]): [Vector3, Vector3, Vector3][] | undefined {
  const constrainedLoop = openings.length ? bridgeOpenings(outer, openings) : outer;
  return constrainedLoop ? triangulatePlan(constrainedLoop) : undefined;
}

function uniformlyRefine(triangles: [Vector3, Vector3, Vector3][], targetSize: number): { triangles?: [Vector3, Vector3, Vector3][]; diagnostic?: MeshDiagnostic } {
  const longest = Math.max(...triangles.flatMap((triangle) => [distance(triangle[0], triangle[1]), distance(triangle[1], triangle[2]), distance(triangle[2], triangle[0])]));
  const levels = Math.max(0, Math.ceil(Math.log2(longest / targetSize)));
  if (levels > MAX_UNIFORM_REFINEMENT) return { diagnostic: { severity: 'error', code: 'MESH_DENSITY_EXCESSIVE', message: `Requested density requires ${levels} uniform refinements; choose a coarser target element size.` } };
  let result = triangles;
  for (let level = 0; level < levels; level += 1) {
    result = result.flatMap(([a, b, c]) => {
      const ab = midpoint(a, b); const bc = midpoint(b, c); const ca = midpoint(c, a);
      return [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]] as [Vector3, Vector3, Vector3][];
    });
  }
  return { triangles: result };
}

function nodesAndElements(meshId: string, triangles: [Vector3, Vector3, Vector3][]): Pick<SurfaceMesh, 'nodes' | 'elements'> {
  const nodeByPosition = new Map<string, SurfaceMeshNode>();
  const nodeFor = (position: Vector3): SurfaceMeshNode => {
    const key = pointKey(position); const existing = nodeByPosition.get(key);
    if (existing) return existing;
    const node = { id: `${meshId}-node-${String(nodeByPosition.size + 1).padStart(4, '0')}`, position: { ...position } };
    nodeByPosition.set(key, node); return node;
  };
  const elements: SurfaceMeshElement[] = triangles.map((triangle, index) => ({ id: `${meshId}-element-${String(index + 1).padStart(4, '0')}`, type: 'tri3', nodeIds: triangle.map((point) => nodeFor(point).id) }));
  return { nodes: [...nodeByPosition.values()], elements };
}

function triangleViolatesOpening(triangle: [Vector3, Vector3, Vector3], opening: Vector3[]): boolean {
  if (triangle.some((point) => pointStrictlyInsidePlanPolygon(point, opening))) return true;
  if (opening.some((point) => pointStrictlyInTriangle(point, triangle[0], triangle[1], triangle[2]))) return true;
  const centroid = { x: (triangle[0].x + triangle[1].x + triangle[2].x) / 3, y: (triangle[0].y + triangle[1].y + triangle[2].y) / 3, z: (triangle[0].z + triangle[1].z + triangle[2].z) / 3 };
  if (pointStrictlyInsidePlanPolygon(centroid, opening)) return true;
  return triangle.some((start, index) => opening.some((openingStart, openingIndex) => properPlanIntersection(start, triangle[(index + 1) % 3], openingStart, opening[(openingIndex + 1) % opening.length])));
}

function triangulationOpeningDiagnostics(triangles: [Vector3, Vector3, Vector3][], openings: Vector3[][]): MeshDiagnostic[] {
  return triangles.some((triangle) => openings.some((opening) => triangleViolatesOpening(triangle, opening))) ? [{ severity: 'error', code: 'OPENING_CONSTRAINT_VIOLATION', message: 'Constrained triangulation produced an element inside or crossing a slab opening.' }] : [];
}

function sourceSignature(value: unknown): string { return JSON.stringify(value); }

export function slabMeshSourceSignature(project: Project, slab: Slab): string {
  const positions = (ids: string[]) => ids.map((id) => project.nodes.find((node) => node.id === id)?.position ?? null);
  return sourceSignature({ slabId: slab.id, thickness: slab.thickness, boundary: positions(slab.boundaryNodeIds), openings: slab.openings.map((opening) => positions(opening.boundaryNodeIds)) });
}

export function wallMeshSourceSignature(project: Project, wallId: string): string | undefined {
  const wall = project.building.walls.find((item) => item.id === wallId); const storey = wall && project.building.storeys.find((item) => item.id === wall.storeyId);
  if (!wall || !storey) return undefined;
  const start = project.nodes.find((node) => node.id === wall.startNodeId)?.position; const end = project.nodes.find((node) => node.id === wall.endNodeId)?.position;
  return sourceSignature({ wallId: wall.id, thickness: wall.thickness, height: storey.height, start, end });
}

export function generateSlabMesh(project: Project, slabId: string, meshId: string, density: MeshDensitySettings = DEFAULT_MESH_DENSITY): MeshGenerationResult {
  const slab = project.building.slabs.find((item) => item.id === slabId); const diagnostics = densityDiagnostics(density);
  if (!slab) return { diagnostics: [...diagnostics, { severity: 'error', code: 'MESH_SOURCE_MISSING', message: 'Slab mesh source does not exist.' }] };
  const points = planPoints(project, slab.boundaryNodeIds);
  if (!points || !isSimplePlanPolygon(points)) return { diagnostics: [...diagnostics, { severity: 'error', code: 'INVALID_SLAB_MESH_GEOMETRY', message: 'Slab boundary must be a simple non-degenerate plan polygon before meshing.' }] };
  const openingPoints = slab.openings.map((opening) => planPoints(project, opening.boundaryNodeIds));
  if (openingPoints.some((opening) => !opening || !isSimplePlanPolygon(opening))) return { diagnostics: [...diagnostics, { severity: 'error', code: 'INVALID_SLAB_MESH_OPENING', message: 'Every slab opening must be a simple non-degenerate plan polygon before meshing.' }] };
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return { diagnostics };
  const rootTriangles = triangulateConstrainedPlan(points, openingPoints as Vector3[][]);
  if (!rootTriangles) return { diagnostics: [...diagnostics, { severity: 'error', code: 'SLAB_TRIANGULATION_FAILED', message: 'The slab boundary could not be triangulated deterministically.' }] };
  const refinement = uniformlyRefine(rootTriangles, density.targetElementSize);
  if (!refinement.triangles) return { diagnostics: [...diagnostics, refinement.diagnostic!] };
  const openingDiagnostics = triangulationOpeningDiagnostics(refinement.triangles, openingPoints as Vector3[][]);
  if (openingDiagnostics.some((diagnostic) => diagnostic.severity === 'error')) return { diagnostics: [...diagnostics, ...openingDiagnostics] };
  const generated = nodesAndElements(meshId, refinement.triangles);
  const mesh: SurfaceMesh = { id: meshId, name: `Mesh ${slab.name}`, sourceKind: 'slab', sourceId: slab.id, density: { ...density }, sourceSignature: slabMeshSourceSignature(project, slab), ...generated };
  return { mesh, diagnostics: [...diagnostics, ...checkMeshQuality(mesh), ...checkSlabOpeningConstraints(project, slab, mesh)] };
}

export function generateWallMesh(project: Project, wallId: string, meshId: string, density: MeshDensitySettings = DEFAULT_MESH_DENSITY): MeshGenerationResult {
  const wall = project.building.walls.find((item) => item.id === wallId); const diagnostics = densityDiagnostics(density);
  const storey = wall && project.building.storeys.find((item) => item.id === wall.storeyId);
  const start = wall && project.nodes.find((node) => node.id === wall.startNodeId)?.position; const end = wall && project.nodes.find((node) => node.id === wall.endNodeId)?.position;
  if (!wall || !storey || !start || !end) return { diagnostics: [...diagnostics, { severity: 'error', code: 'MESH_SOURCE_MISSING', message: 'Wall, owning storey, or wall boundary node is missing.' }] };
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return { diagnostics };
  const length = Math.hypot(end.x - start.x, end.z - start.z);
  if (length <= EPSILON || !finitePositive(storey.height)) return { diagnostics: [...diagnostics, { severity: 'error', code: 'INVALID_WALL_MESH_GEOMETRY', message: 'Wall must have positive plan length and storey height before meshing.' }] };
  const along = Math.ceil(length / density.targetElementSize); const high = Math.ceil(storey.height / density.targetElementSize);
  if (along * high > MAX_WALL_ELEMENTS) return { diagnostics: [...diagnostics, { severity: 'error', code: 'MESH_DENSITY_EXCESSIVE', message: 'Wall mesh density would exceed the 10,000-element safety limit.' }] };
  const meshNodes: SurfaceMeshNode[] = [];
  for (let row = 0; row <= high; row += 1) for (let column = 0; column <= along; column += 1) {
    const alongRatio = column / along; const heightRatio = row / high;
    meshNodes.push({ id: `${meshId}-node-${String(meshNodes.length + 1).padStart(4, '0')}`, position: { x: start.x + (end.x - start.x) * alongRatio, y: start.y + storey.height * heightRatio, z: start.z + (end.z - start.z) * alongRatio } });
  }
  const nodeAt = (row: number, column: number) => meshNodes[row * (along + 1) + column].id;
  const elements: SurfaceMeshElement[] = [];
  for (let row = 0; row < high; row += 1) for (let column = 0; column < along; column += 1) elements.push({ id: `${meshId}-element-${String(elements.length + 1).padStart(4, '0')}`, type: 'quad4', nodeIds: [nodeAt(row, column), nodeAt(row, column + 1), nodeAt(row + 1, column + 1), nodeAt(row + 1, column)] });
  const mesh: SurfaceMesh = { id: meshId, name: `Mesh ${wall.name}`, sourceKind: 'wall', sourceId: wall.id, density: { ...density }, sourceSignature: wallMeshSourceSignature(project, wall.id)!, nodes: meshNodes, elements };
  return { mesh, diagnostics: [...diagnostics, ...checkMeshQuality(mesh)] };
}

function elementAspectRatio(points: Vector3[]): number {
  const edges = points.map((point, index) => distance(point, points[(index + 1) % points.length]));
  const longest = Math.max(...edges);
  if (points.length === 3) return longest * longest / (2 * triangleArea(points[0], points[1], points[2]));
  return Math.max(elementAspectRatio([points[0], points[1], points[2]]), elementAspectRatio([points[0], points[2], points[3]]));
}

/** Detects invalid element shape, duplicate IDs, connectivity islands and aspect-ratio warnings. */
export function checkMeshQuality(mesh: SurfaceMesh): MeshQualityIssue[] {
  const issues: MeshQualityIssue[] = [];
  if (!finitePositive(mesh.density.targetElementSize) || !finitePositive(mesh.density.maxAspectRatio) || mesh.density.maxAspectRatio < 1) issues.push({ severity: 'error', code: 'INVALID_MESH_DENSITY', message: 'Mesh density settings are invalid.' });
  const nodeById = new Map<string, SurfaceMeshNode>();
  for (const node of mesh.nodes) {
    if (nodeById.has(node.id)) issues.push({ severity: 'error', code: 'DUPLICATE_MESH_NODE', message: `Mesh node '${node.id}' is duplicated.` });
    if (![node.position.x, node.position.y, node.position.z].every(Number.isFinite)) issues.push({ severity: 'error', code: 'INVALID_MESH_NODE', message: `Mesh node '${node.id}' has non-finite coordinates.` });
    nodeById.set(node.id, node);
  }
  const elementIds = new Set<string>(); const elementNodes: string[][] = [];
  for (const element of mesh.elements) {
    if (elementIds.has(element.id)) issues.push({ severity: 'error', code: 'DUPLICATE_MESH_ELEMENT', elementId: element.id, message: `Mesh element '${element.id}' is duplicated.` });
    elementIds.add(element.id);
    const requiredCount = element.type === 'tri3' ? 3 : 4;
    if (element.nodeIds.length !== requiredCount || new Set(element.nodeIds).size !== requiredCount) { issues.push({ severity: 'error', code: 'INVALID_ELEMENT_CONNECTIVITY', elementId: element.id, message: 'Element node count or uniqueness is invalid.' }); continue; }
    const points = element.nodeIds.map((id) => nodeById.get(id));
    if (points.some((point) => !point)) { issues.push({ severity: 'error', code: 'MISSING_ELEMENT_NODE', elementId: element.id, message: 'Element references a missing mesh node.' }); continue; }
    const meshNodes = points as SurfaceMeshNode[];
    const positions = meshNodes.map((node) => node.position);
    const area = element.type === 'tri3' ? triangleArea(positions[0], positions[1], positions[2]) : triangleArea(positions[0], positions[1], positions[2]) + triangleArea(positions[0], positions[2], positions[3]);
    if (area <= EPSILON) { issues.push({ severity: 'error', code: 'DEGENERATE_MESH_ELEMENT', elementId: element.id, message: 'Element area is zero or degenerate.' }); continue; }
    if (element.type === 'quad4' && Math.abs((positions[3].x - positions[0].x) * cross(positions[0], positions[1], positions[2]).x + (positions[3].y - positions[0].y) * cross(positions[0], positions[1], positions[2]).y + (positions[3].z - positions[0].z) * cross(positions[0], positions[1], positions[2]).z) > EPSILON) issues.push({ severity: 'error', code: 'NONPLANAR_MESH_ELEMENT', elementId: element.id, message: 'Quad element nodes must be coplanar.' });
    const ratio = elementAspectRatio(positions);
    if (ratio > mesh.density.maxAspectRatio) issues.push({ severity: 'warning', code: 'HIGH_ASPECT_RATIO', elementId: element.id, message: `Element aspect ratio ${ratio.toFixed(2)} exceeds the configured maximum.` });
    elementNodes.push(element.nodeIds);
  }
  if (!mesh.elements.length) issues.push({ severity: 'error', code: 'EMPTY_MESH', message: 'A surface mesh must contain at least one element.' });
  if (elementNodes.length) {
    const nodeToElements = new Map<string, number[]>();
    elementNodes.forEach((nodes, index) => nodes.forEach((node) => nodeToElements.set(node, [...(nodeToElements.get(node) ?? []), index])));
    const visited = new Set<number>(); const queue = [0];
    while (queue.length) { const current = queue.pop()!; if (visited.has(current)) continue; visited.add(current); elementNodes[current].forEach((node) => (nodeToElements.get(node) ?? []).forEach((next) => { if (!visited.has(next)) queue.push(next); })); }
    if (visited.size !== elementNodes.length) issues.push({ severity: 'error', code: 'DISCONNECTED_MESH', message: 'Mesh elements must form one connected component.' });
  }
  return issues;
}

/** Ensures persisted slab mesh elements neither enter nor bridge any declared opening. */
export function checkSlabOpeningConstraints(project: Project, slab: Slab, mesh: SurfaceMesh): MeshQualityIssue[] {
  const openings = slab.openings.map((opening) => planPoints(project, opening.boundaryNodeIds)).filter((points): points is Vector3[] => Boolean(points));
  if (!openings.length) return [];
  const nodes = new Map(mesh.nodes.map((node) => [node.id, node.position]));
  const issues: MeshQualityIssue[] = [];
  for (const element of mesh.elements) {
    const points = element.nodeIds.map((id) => nodes.get(id));
    if (points.some((point) => !point)) continue;
    const valid = points as Vector3[];
    const triangles: [Vector3, Vector3, Vector3][] = element.type === 'tri3' ? [[valid[0], valid[1], valid[2]]] : [[valid[0], valid[1], valid[2]], [valid[0], valid[2], valid[3]]];
    if (triangles.some((triangle) => openings.some((opening) => triangleViolatesOpening(triangle, opening)))) issues.push({ severity: 'error', code: 'ELEMENT_IN_OPENING', elementId: element.id, message: 'Mesh element lies inside or crosses a slab opening.' });
  }
  return issues;
}

export function meshIssuesAsModelIssues(mesh: SurfaceMesh): ModelIssue[] {
  return checkMeshQuality(mesh).map((issue) => ({ severity: issue.severity, path: `building.surfaceMeshes.${mesh.id}${issue.elementId ? `.elements.${issue.elementId}` : ''}`, message: issue.message }));
}
