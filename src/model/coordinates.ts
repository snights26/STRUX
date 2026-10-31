import type { Vector3 } from './types';

export interface MemberLocalAxes {
  x: Vector3;
  y: Vector3;
  z: Vector3;
}

const length = (vector: Vector3) => Math.hypot(vector.x, vector.y, vector.z);
const cross = (left: Vector3, right: Vector3): Vector3 => ({
  x: left.y * right.z - left.z * right.y,
  y: left.z * right.x - left.x * right.z,
  z: left.x * right.y - left.y * right.x,
});
const normalize = (vector: Vector3): Vector3 => {
  const magnitude = length(vector);
  if (magnitude <= 1e-12) throw new Error('A member axis requires distinct node positions.');
  return { x: vector.x / magnitude, y: vector.y / magnitude, z: vector.z / magnitude };
};

/**
 * Deterministic construction-grid snapping for interactive placement.
 * Model coordinates remain metres; only the placement candidate is rounded.
 */
export function snapCoordinateToGrid(value: number, spacing: number): number {
  if (!Number.isFinite(value)) throw new Error('Coordinate to snap must be finite.');
  if (!Number.isFinite(spacing) || spacing <= 0) throw new Error('Grid spacing must be a positive finite value.');
  return Number((Math.round(value / spacing) * spacing).toFixed(12));
}

export function snapPositionToGrid(position: Vector3, spacing: number): Vector3 {
  return {
    x: snapCoordinateToGrid(position.x, spacing),
    y: snapCoordinateToGrid(position.y, spacing),
    z: snapCoordinateToGrid(position.z, spacing),
  };
}

/**
 * Display-only right-handed member axes. Local X runs from start to end node;
 * local Y/Z rotate around X by rollAngle. This is not yet a solver convention.
 */
export function calculateMemberLocalAxes(start: Vector3, end: Vector3, rollAngle = 0): MemberLocalAxes {
  const x = normalize({ x: end.x - start.x, y: end.y - start.y, z: end.z - start.z });
  const reference = Math.abs(x.y) < 0.95 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
  const unrolledZ = normalize(cross(x, reference));
  const unrolledY = normalize(cross(unrolledZ, x));
  const cosine = Math.cos(rollAngle);
  const sine = Math.sin(rollAngle);
  return {
    x,
    y: { x: unrolledY.x * cosine + unrolledZ.x * sine, y: unrolledY.y * cosine + unrolledZ.y * sine, z: unrolledY.z * cosine + unrolledZ.z * sine },
    z: { x: unrolledZ.x * cosine - unrolledY.x * sine, y: unrolledZ.y * cosine - unrolledY.y * sine, z: unrolledZ.z * cosine - unrolledY.z * sine },
  };
}
