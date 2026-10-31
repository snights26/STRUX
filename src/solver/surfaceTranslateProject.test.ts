import { describe, expect, it } from 'vitest';
import { createProject } from '../model/project';
import { historyReducer, type HistoryState } from '../model/reducer';
import { parseProject, serializeProject } from '../model/serialization';
import { validateProject } from '../model/validation';
import { SolverTranslationError, translateProject } from './translateProject';

const state = (): HistoryState => ({ project: createProject('Surface solver'), past: [], future: [] });

function wallProject(): HistoryState {
  let current = historyReducer(state(), { type: 'add-node', position: { x: 0, y: 0, z: 0 }, storeyId: 'storey-ground' });
  current = historyReducer(current, { type: 'add-node', position: { x: 2, y: 0, z: 0 }, storeyId: 'storey-ground' });
  current = historyReducer(current, { type: 'add-wall', storeyId: 'storey-ground', startNodeId: current.project.nodes[0].id, endNodeId: current.project.nodes[1].id });
  return historyReducer(current, { type: 'generate-wall-mesh', wallId: current.project.building.walls[0].id, density: { targetElementSize: 1, maxAspectRatio: 8 } });
}

describe('PyNite Quad3D surface translation', () => {
  it('maps a current wall quad mesh, deterministic shared nodes, material, thickness, and pressure', () => {
    let current = wallProject();
    const mesh = current.project.building.surfaceMeshes[0];
    current = historyReducer(current, { type: 'add-surface-pressure-load', surfaceMeshId: mesh.id });
    const input = translateProject(current.project);
    expect(input.version).toBe(2);
    expect(input.surfaceMeshes).toHaveLength(1);
    expect(input.surfaceMeshes[0]).toMatchObject({ id: mesh.id, sourceKind: 'wall', thickness: current.project.building.walls[0].thickness });
    expect(input.surfaceMeshes[0].elements).toHaveLength(6);
    expect(input.surfacePressureLoads).toEqual([{ id: current.project.surfacePressureLoads[0].id, surfaceMeshId: mesh.id, caseId: 'lc-dead', pressure: 1000 }]);
    const baseMeshNode = mesh.nodes.find((node) => node.position.x === 0 && node.position.y === 0 && node.position.z === 0)!;
    expect(input.surfaceNodeNameByRef[`${mesh.id}/${baseMeshNode.id}`]).toBe(input.nodeNameById[current.project.nodes[0].id]);
    expect(Object.values(input.surfaceElementNameByRef)).toEqual(['Q_0001', 'Q_0002', 'Q_0003', 'Q_0004', 'Q_0005', 'Q_0006']);
  });

  it('rejects tri3 opening meshes rather than silently approximating them as quads', () => {
    let current = state();
    const positions = [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 2 }, { x: 0, y: 0, z: 2 }];
    for (const position of positions) current = historyReducer(current, { type: 'add-node', position, storeyId: 'storey-ground' });
    current = historyReducer(current, { type: 'add-slab', storeyId: 'storey-ground', boundaryNodeIds: current.project.nodes.map((node) => node.id) });
    current = historyReducer(current, { type: 'generate-slab-mesh', slabId: current.project.building.slabs[0].id, density: { targetElementSize: 1, maxAspectRatio: 8 } });
    expect(current.project.building.surfaceMeshes[0].elements.every((element) => element.type === 'tri3')).toBe(true);
    try { translateProject(current.project); throw new Error('Expected tri3 mesh rejection.'); } catch (error) {
      expect(error).toBeInstanceOf(SolverTranslationError);
      expect((error as SolverTranslationError).diagnostics.some((diagnostic) => diagnostic.code === 'UNSUPPORTED_SURFACE_ELEMENT')).toBe(true);
    }
  });

  it('preserves schema-v4 input by adding an empty surface-pressure collection and validates invalid references', () => {
    const project = wallProject().project;
    const oldV4 = JSON.parse(serializeProject(project));
    delete oldV4.surfacePressureLoads;
    const parsed = parseProject(JSON.stringify(oldV4));
    expect(parsed.errors).toEqual([]);
    expect(parsed.project?.surfacePressureLoads).toEqual([]);
    project.surfacePressureLoads.push({ id: 'invalid-pressure', name: 'Invalid', surfaceMeshId: 'missing', loadCaseId: 'missing', pressure: 0 });
    const messages = validateProject(project).map((issue) => issue.message);
    expect(messages.some((message) => message.includes('missing surface mesh'))).toBe(true);
    expect(messages.some((message) => message.includes('finite non-zero'))).toBe(true);
  });

  it('keeps surface-pressure model commands undoable and blocks deletion while referenced', () => {
    const current = wallProject();
    const mesh = current.project.building.surfaceMeshes[0];
    const withLoad = historyReducer(current, { type: 'add-surface-pressure-load', surfaceMeshId: mesh.id });
    const unchanged = historyReducer(withLoad, { type: 'delete-surface-mesh', id: mesh.id });
    expect(unchanged.project).toBe(withLoad.project);
    const regenerated = historyReducer(withLoad, { type: 'generate-wall-mesh', wallId: withLoad.project.building.walls[0].id, density: { targetElementSize: 1.5, maxAspectRatio: 8 } });
    expect(regenerated.project.building.surfaceMeshes[0].id).not.toBe(mesh.id);
    expect(regenerated.project.surfacePressureLoads[0].surfaceMeshId).toBe(regenerated.project.building.surfaceMeshes[0].id);
    expect(validateProject(regenerated.project).filter((issue) => issue.severity === 'error')).toEqual([]);
    const undone = historyReducer(regenerated, { type: 'undo' });
    expect(undone.project.building.surfaceMeshes[0].id).toBe(mesh.id);
    expect(undone.project.surfacePressureLoads[0].surfaceMeshId).toBe(mesh.id);
    const redone = historyReducer(undone, { type: 'redo' });
    expect(redone.project.surfacePressureLoads[0].surfaceMeshId).toBe(redone.project.building.surfaceMeshes[0].id);
  });
});
