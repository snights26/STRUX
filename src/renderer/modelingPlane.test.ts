import { describe, expect, it } from 'vitest';
import { createProject } from '../model/project';
import { historyReducer, type HistoryState } from '../model/reducer';
import { cameraOrientationFor, modelingViewForCamera, pointOnWorkingPlane, snapPositionOnWorkingPlane, workingPlaneVisual } from './modelingPlane';

describe('multi-view modeling planes', () => {
  it('maps ray intersections onto the explicit Top, Front, and Side global planes', () => {
    const hit = { x: 2.1, y: 8.2, z: -3.1 };
    expect(pointOnWorkingPlane(hit, { view: 'top', offset: 4 })).toEqual({ x: 2.1, y: 4, z: -3.1 });
    expect(pointOnWorkingPlane(hit, { view: 'front', offset: 7 })).toEqual({ x: 2.1, y: 8.2, z: 7 });
    expect(pointOnWorkingPlane(hit, { view: 'side', offset: -5 })).toEqual({ x: -5, y: 8.2, z: -3.1 });
  });

  it('snaps only the two active plane axes and preserves each exact working-plane offset', () => {
    const hit = { x: 2.24, y: 8.26, z: -3.26 };
    expect(snapPositionOnWorkingPlane(hit, { view: 'top', offset: 4.125 }, 0.5)).toEqual({ x: 2, y: 4.125, z: -3.5 });
    expect(snapPositionOnWorkingPlane(hit, { view: 'front', offset: 7.125 }, 0.5)).toEqual({ x: 2, y: 8.5, z: 7.125 });
    expect(snapPositionOnWorkingPlane(hit, { view: 'side', offset: -5.125 }, 0.5)).toEqual({ x: -5.125, y: 8.5, z: -3.5 });
  });

  it('creates a front-view node as one undoable action and restores it through redo', () => {
    const initial: HistoryState = { project: createProject('Multi-view test'), past: [], future: [] };
    const position = snapPositionOnWorkingPlane({ x: 1.76, y: 3.24, z: 99 }, { view: 'front', offset: 6.5 }, 0.5);
    let state = historyReducer(initial, { type: 'add-node', position });
    expect(state.project.nodes[0]?.position).toEqual({ x: 2, y: 3, z: 6.5 });
    state = historyReducer(state, { type: 'undo' });
    expect(state.project.nodes).toHaveLength(0);
    state = historyReducer(state, { type: 'redo' });
    expect(state.project.nodes[0]?.position).toEqual({ x: 2, y: 3, z: 6.5 });
  });

  it('defines grids and cameras perpendicular to the active plane with global +Y upward', () => {
    expect(modelingViewForCamera('isometric')).toBe('top');
    expect(workingPlaneVisual({ view: 'top', offset: 3 }).coordinateAxes).toBe('X–Z');
    expect(workingPlaneVisual({ view: 'front', offset: 3 }).coordinateAxes).toBe('X–Y');
    expect(workingPlaneVisual({ view: 'side', offset: 3 }).coordinateAxes).toBe('Z–Y');
    const top = cameraOrientationFor('top', { view: 'top', offset: 3 });
    const front = cameraOrientationFor('front', { view: 'front', offset: 3 });
    const side = cameraOrientationFor('side', { view: 'side', offset: 3 });
    expect(top.position[1]).toBeGreaterThan(top.target[1]);
    expect(front.position[2]).toBeGreaterThan(front.target[2]);
    expect(side.position[0]).toBeGreaterThan(side.target[0]);
    expect(front.up).toEqual([0, 1, 0]);
    expect(side.up).toEqual([0, 1, 0]);
  });
});
