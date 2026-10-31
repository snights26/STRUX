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
 * PyNiteFEA 3.2.1-compatible right-handed member axes. Local X runs from start
 * to end node; local Y/Z and roll follow the engine's Member3D transformation.
 */
export function calculateMemberLocalAxes(start: Vector3, end: Vector3, rollAngle = 0): MemberLocalAxes {
  const delta = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  const x = normalize(delta);
  let unrolledY: Vector3;
  let unrolledZ: Vector3;
  if (Math.abs(delta.x) <= 1e-12 && Math.abs(delta.z) <= 1e-12) {
    unrolledY = delta.y > 0 ? { x: -1, y: 0, z: 0 } : { x: 1, y: 0, z: 0 };
    unrolledZ = { x: 0, y: 0, z: 1 };
  } else if (Math.abs(delta.y) <= 1e-12) {
    unrolledY = { x: 0, y: 1, z: 0 };
    unrolledZ = normalize(cross(x, unrolledY));
  } else {
    const projection = { x: delta.x, y: 0, z: delta.z };
    unrolledZ = normalize(delta.y > 0 ? cross(projection, x) : cross(x, projection));
    unrolledY = normalize(cross(unrolledZ, x));
  }
  const cosine = Math.cos(rollAngle);
  const sine = Math.sin(rollAngle);
  return {
    x,
    y: { x: unrolledY.x * cosine + unrolledZ.x * sine, y: unrolledY.y * cosine + unrolledZ.y * sine, z: unrolledY.z * cosine + unrolledZ.z * sine },
    z: { x: unrolledZ.x * cosine + unrolledY.x * -sine, y: unrolledZ.y * cosine + unrolledY.y * -sine, z: unrolledZ.z * cosine + unrolledY.z * -sine },
  };
}
