import type { Vector3 } from './types';

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
