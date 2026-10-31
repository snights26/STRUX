import { snapCoordinateToGrid } from '../model/coordinates';
import type { Vector3 } from '../model/types';

/** The three CAD working planes use the persisted global STRUX coordinate system. */
export type ModelingView = 'top' | 'front' | 'side';
export type CameraPreset = 'isometric' | ModelingView;

export interface WorkingPlane {
  view: ModelingView;
  /** SI metres: Y for top, Z for front, X for side. */
  offset: number;
}

export interface CameraOrientation {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
}

export interface WorkingPlaneVisual {
  label: string;
  coordinateAxes: string;
  offsetAxis: 'X' | 'Y' | 'Z';
  gridPosition: [number, number, number];
  gridRotation: [number, number, number];
  pickerPosition: [number, number, number];
  pickerRotation: [number, number, number];
}

const finite = (value: number, name: string) => {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite.`);
  return value;
};

/** ISO keeps the established top working plane rather than silently inventing a fourth plane. */
export function modelingViewForCamera(preset: CameraPreset): ModelingView {
  return preset === 'isometric' ? 'top' : preset;
}

export function workingPlaneCoordinateLabel(plane: WorkingPlane): string {
  const axis = plane.view === 'top' ? 'Y' : plane.view === 'front' ? 'Z' : 'X';
  return `${axis} = ${plane.offset} m`;
}

/**
 * Applies the active plane constraint to a ray/mesh intersection. This explicitly
 * discards the ray's normal coordinate so a click can never create a node off-plane.
 */
export function pointOnWorkingPlane(hit: Vector3, plane: WorkingPlane): Vector3 {
  finite(hit.x, 'Hit X'); finite(hit.y, 'Hit Y'); finite(hit.z, 'Hit Z'); finite(plane.offset, 'Working-plane offset');
  switch (plane.view) {
    case 'top': return { x: hit.x, y: plane.offset, z: hit.z };
    case 'front': return { x: hit.x, y: hit.y, z: plane.offset };
    case 'side': return { x: plane.offset, y: hit.y, z: hit.z };
  }
}

/** Snaps only in-plane coordinates; the selected plane offset remains exactly editable. */
export function snapPositionOnWorkingPlane(hit: Vector3, plane: WorkingPlane, spacing: number): Vector3 {
  const position = pointOnWorkingPlane(hit, plane);
  switch (plane.view) {
    case 'top': return { x: snapCoordinateToGrid(position.x, spacing), y: plane.offset, z: snapCoordinateToGrid(position.z, spacing) };
    case 'front': return { x: snapCoordinateToGrid(position.x, spacing), y: snapCoordinateToGrid(position.y, spacing), z: plane.offset };
    case 'side': return { x: plane.offset, y: snapCoordinateToGrid(position.y, spacing), z: snapCoordinateToGrid(position.z, spacing) };
  }
}

/** Geometry transforms for Three.js GridHelper (native plane is X-Z) and the hit plane (native is X-Y). */
export function workingPlaneVisual(plane: WorkingPlane): WorkingPlaneVisual {
  const offset = finite(plane.offset, 'Working-plane offset');
  switch (plane.view) {
    case 'top': return { label: 'TOP', coordinateAxes: 'X–Z', offsetAxis: 'Y', gridPosition: [0, offset, 0], gridRotation: [0, 0, 0], pickerPosition: [0, offset, 0], pickerRotation: [-Math.PI / 2, 0, 0] };
    case 'front': return { label: 'FRONT', coordinateAxes: 'X–Y', offsetAxis: 'Z', gridPosition: [0, 0, offset], gridRotation: [Math.PI / 2, 0, 0], pickerPosition: [0, 0, offset], pickerRotation: [0, 0, 0] };
    case 'side': return { label: 'SIDE', coordinateAxes: 'Z–Y', offsetAxis: 'X', gridPosition: [offset, 0, 0], gridRotation: [0, 0, Math.PI / 2], pickerPosition: [offset, 0, 0], pickerRotation: [0, Math.PI / 2, 0] };
  }
}

/** Fixed orthographic-style orientations while retaining the application's perspective camera. Global +Y is always up. */
export function cameraOrientationFor(preset: CameraPreset, plane: WorkingPlane, distance = 20): CameraOrientation {
  const view = modelingViewForCamera(preset);
  const offset = finite(plane.offset, 'Working-plane offset');
  const safeDistance = Math.max(1, finite(distance, 'Camera distance'));
  if (preset === 'isometric') return { position: [9, 8, 11], target: [0, 0, 0], up: [0, 1, 0] };
  if (view === 'top') return { position: [0, offset + safeDistance, 0.001], target: [0, offset, 0], up: [0, 0, -1] };
  if (view === 'front') return { position: [0, 0, offset + safeDistance], target: [0, 0, offset], up: [0, 1, 0] };
  return { position: [offset + safeDistance, 0, 0.001], target: [offset, 0, 0], up: [0, 1, 0] };
}
