import { describe, expect, it } from 'vitest';
import { checkSlabOpeningConstraints, generateSlabMesh } from './mesh';
import { createProject } from './project';
import { historyReducer, type HistoryState } from './reducer';
import { parseProject, serializeProject } from './serialization';
import { validateProject } from './validation';

const state = (): HistoryState => ({ project: createProject('M7C'), past: [], future: [] });
const node = (id: string, x: number, z: number) => ({ id, name: id, storeyId: 'storey-roof', position: { x, y: 3, z } });

function slabWithOpening(): HistoryState {
  let current = state();
  current.project.nodes.push(node('a', 0, 0), node('b', 6, 0), node('c', 6, 6), node('d', 0, 6), node('h1', 2, 2), node('h2', 4, 2), node('h3', 4, 4), node('h4', 2, 4));
  current = historyReducer(current, { type: 'add-slab', storeyId: 'storey-roof', boundaryNodeIds: ['a', 'b', 'c', 'd'] });
  current = historyReducer(current, { type: 'add-slab-opening', slabId: current.project.building.slabs[0].id, boundaryNodeIds: ['h1', 'h2', 'h3', 'h4'] });
  return current;
}

describe('M7C constrained slab meshes and authoring commands', () => {
  it('deterministically triangulates a polygonal slab around an internal opening', () => {
    const current = slabWithOpening(); const slab = current.project.building.slabs[0];
    expect(validateProject(current.project).filter((issue) => issue.severity === 'error')).toEqual([]);
    const first = generateSlabMesh(current.project, slab.id, 'opening-mesh', { targetElementSize: 2, maxAspectRatio: 12 });
    const second = generateSlabMesh(current.project, slab.id, 'opening-mesh', { targetElementSize: 2, maxAspectRatio: 12 });
    expect(first.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    expect(first.mesh).toBeDefined();
    expect(first.mesh?.elements.length).toBeGreaterThan(0);
    expect(first.mesh?.nodes).toEqual(second.mesh?.nodes);
    expect(first.mesh?.elements).toEqual(second.mesh?.elements);
    expect(checkSlabOpeningConstraints(current.project, slab, first.mesh!)).toEqual([]);
  });

  it('keeps multiple disjoint internal openings as mesh constraints', () => {
    let current = state();
    current.project.nodes.push(node('a', 0, 0), node('b', 10, 0), node('c', 10, 6), node('d', 0, 6), node('l1', 1, 2), node('l2', 3, 2), node('l3', 3, 4), node('l4', 1, 4), node('r1', 7, 2), node('r2', 9, 2), node('r3', 9, 4), node('r4', 7, 4));
    current = historyReducer(current, { type: 'add-slab', storeyId: 'storey-roof', boundaryNodeIds: ['a', 'b', 'c', 'd'] });
    const slab = current.project.building.slabs[0];
    current = historyReducer(current, { type: 'add-slab-opening', slabId: slab.id, boundaryNodeIds: ['l1', 'l2', 'l3', 'l4'] });
    current = historyReducer(current, { type: 'add-slab-opening', slabId: slab.id, boundaryNodeIds: ['r1', 'r2', 'r3', 'r4'] });
    const generated = generateSlabMesh(current.project, slab.id, 'two-opening-mesh', { targetElementSize: 2, maxAspectRatio: 16 });
    expect(generated.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    expect(checkSlabOpeningConstraints(current.project, slab, generated.mesh!)).toEqual([]);
  });

  it('rejects persisted elements that enter an opening and keeps mesh generation undoable', () => {
    let current = slabWithOpening(); const slab = current.project.building.slabs[0];
    current = historyReducer(current, { type: 'generate-slab-mesh', slabId: slab.id, density: { targetElementSize: 2, maxAspectRatio: 12 } });
    expect(current.project.building.surfaceMeshes).toHaveLength(1);
    const meshId = current.project.building.surfaceMeshes[0].id;
    current = historyReducer(current, { type: 'undo' });
    expect(current.project.building.surfaceMeshes).toEqual([]);
    current = historyReducer(current, { type: 'redo' });
    expect(current.project.building.surfaceMeshes[0].id).toBe(meshId);
    const invalid = structuredClone(current.project);
    const mesh = invalid.building.surfaceMeshes[0];
    mesh.nodes.push({ id: 'inside-1', position: { x: 2.4, y: 3, z: 2.4 } }, { id: 'inside-2', position: { x: 3.2, y: 3, z: 2.4 } }, { id: 'inside-3', position: { x: 2.4, y: 3, z: 3.2 } });
    mesh.elements.push({ id: 'inside-element', type: 'tri3', nodeIds: ['inside-1', 'inside-2', 'inside-3'] });
    expect(validateProject(invalid).some((issue) => issue.message.includes('Mesh element lies inside or crosses a slab opening'))).toBe(true);
  });

  it('keeps diaphragm, foundation and rigid-link commands on the shared undo/redo history', () => {
    let current = slabWithOpening();
    current = historyReducer(current, { type: 'add-diaphragm', storeyId: 'storey-roof', nodeIds: ['a', 'b', 'c'] });
    current = historyReducer(current, { type: 'add-nodal-spring', nodeId: 'a' });
    current = historyReducer(current, { type: 'add-rigid-link', masterNodeId: 'a', slaveNodeId: 'b' });
    expect(current.project.building.diaphragms).toHaveLength(1);
    expect(current.project.nodalSprings).toHaveLength(1);
    expect(current.project.rigidLinks).toHaveLength(1);
    current = historyReducer(current, { type: 'undo' });
    expect(current.project.rigidLinks).toEqual([]);
    current = historyReducer(current, { type: 'undo' });
    expect(current.project.nodalSprings).toEqual([]);
    current = historyReducer(current, { type: 'redo' });
    expect(current.project.nodalSprings).toHaveLength(1);
  });

  it('round-trips schema-v4 constrained mesh data without enabling surface analysis', () => {
    let current = slabWithOpening(); const slab = current.project.building.slabs[0];
    current = historyReducer(current, { type: 'generate-slab-mesh', slabId: slab.id, density: { targetElementSize: 2, maxAspectRatio: 12 } });
    const parsed = parseProject(serializeProject(current.project));
    expect(parsed.errors).toEqual([]);
    expect(parsed.project?.schemaVersion).toBe(4);
    expect(parsed.project?.building.surfaceMeshes[0].elements.length).toBe(current.project.building.surfaceMeshes[0].elements.length);
  });
});
