import type { BuildingGridLine, BuildingModel, GridAxis, Node, Project, Storey, Vector3 } from './types';

const EPSILON = 1e-8;

export interface GridIntersection {
  xLineId: string;
  zLineId: string;
  x: number;
  z: number;
  label: string;
}

export function createBuildingModel(): BuildingModel {
  return {
    typicalStoreyHeight: 3,
    storeys: [
      { id: 'storey-ground', name: 'Ground', elevation: 0, height: 3, role: 'ground' },
      { id: 'storey-roof', name: 'Roof', elevation: 3, height: 3, role: 'roof' },
    ],
    gridLines: [
      { id: 'grid-x-a', axis: 'x', label: 'A', coordinate: 0 }, { id: 'grid-x-b', axis: 'x', label: 'B', coordinate: 6 },
      { id: 'grid-z-1', axis: 'z', label: '1', coordinate: 0 }, { id: 'grid-z-2', axis: 'z', label: '2', coordinate: 6 },
    ],
    slabs: [], walls: [], surfaceMeshes: [], diaphragms: [],
  };
}

export function storeysByElevation(storeys: Storey[]): Storey[] {
  return [...storeys].sort((left, right) => left.elevation - right.elevation || left.id.localeCompare(right.id));
}

export function storeyAtElevation(project: Project, elevation: number): Storey | undefined {
  return project.building.storeys.find((storey) => Math.abs(storey.elevation - elevation) <= EPSILON);
}

export function gridLinesForAxis(project: Project, axis: GridAxis): BuildingGridLine[] {
  return project.building.gridLines.filter((line) => line.axis === axis).sort((left, right) => left.coordinate - right.coordinate || left.id.localeCompare(right.id));
}

export function gridIntersections(project: Project): GridIntersection[] {
  return gridLinesForAxis(project, 'x').flatMap((xLine) => gridLinesForAxis(project, 'z').map((zLine) => ({ xLineId: xLine.id, zLineId: zLine.id, x: xLine.coordinate, z: zLine.coordinate, label: `${xLine.label}${zLine.label}` })));
}

export function gridIntersection(project: Project, xLineId: string, zLineId: string): GridIntersection | undefined {
  return gridIntersections(project).find((point) => point.xLineId === xLineId && point.zLineId === zLineId);
}

export function findStoreyNode(project: Project, storeyId: string, x: number, z: number): Node | undefined {
  const storey = project.building.storeys.find((item) => item.id === storeyId);
  if (!storey) return undefined;
  return project.nodes.find((node) => node.storeyId === storeyId && Math.abs(node.position.x - x) <= EPSILON && Math.abs(node.position.y - storey.elevation) <= EPSILON && Math.abs(node.position.z - z) <= EPSILON);
}

export function planPoints(project: Project, nodeIds: string[]): Vector3[] | undefined {
  const nodeById = new Map(project.nodes.map((node) => [node.id, node]));
  const points = nodeIds.map((id) => nodeById.get(id));
  return points.some((point) => !point) ? undefined : points.map((point) => point!.position);
}

export function signedPlanArea(points: Vector3[]): number {
  return points.reduce((area, point, index) => { const next = points[(index + 1) % points.length]; return area + point.x * next.z - next.x * point.z; }, 0) / 2;
}

const orientation = (a: Vector3, b: Vector3, c: Vector3) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
const onSegment = (a: Vector3, b: Vector3, point: Vector3) => Math.abs(orientation(a, b, point)) <= EPSILON && point.x >= Math.min(a.x, b.x) - EPSILON && point.x <= Math.max(a.x, b.x) + EPSILON && point.z >= Math.min(a.z, b.z) - EPSILON && point.z <= Math.max(a.z, b.z) + EPSILON;

export function planSegmentsIntersect(a: Vector3, b: Vector3, c: Vector3, d: Vector3): boolean {
  const abC = orientation(a, b, c); const abD = orientation(a, b, d); const cdA = orientation(c, d, a); const cdB = orientation(c, d, b);
  if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON)) && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true;
  return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

export function isSimplePlanPolygon(points: Vector3[]): boolean {
  if (points.length < 3 || Math.abs(signedPlanArea(points)) <= EPSILON) return false;
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    if (Math.hypot(points[index].x - points[next].x, points[index].z - points[next].z) <= EPSILON) return false;
    for (let other = index + 1; other < points.length; other += 1) {
      const otherNext = (other + 1) % points.length;
      if (index === other || next === other || otherNext === index) continue;
      if (planSegmentsIntersect(points[index], points[next], points[other], points[otherNext])) return false;
    }
  }
  return true;
}

/** Boundary points count as outside for openings, avoiding ambiguous disconnected shell geometry. */
export function pointStrictlyInsidePlanPolygon(point: Vector3, polygon: Vector3[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[previous]; const b = polygon[index];
    if (onSegment(a, b, point)) return false;
    if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

export function planPolygonBoundariesIntersect(left: Vector3[], right: Vector3[]): boolean {
  for (let index = 0; index < left.length; index += 1) for (let other = 0; other < right.length; other += 1) if (planSegmentsIntersect(left[index], left[(index + 1) % left.length], right[other], right[(other + 1) % right.length])) return true;
  return false;
}

export function planPolygonsIntersect(left: Vector3[], right: Vector3[]): boolean {
  return planPolygonBoundariesIntersect(left, right) || pointStrictlyInsidePlanPolygon(left[0], right) || pointStrictlyInsidePlanPolygon(right[0], left);
}
