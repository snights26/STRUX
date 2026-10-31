import { describe, expect, it } from 'vitest';
import { gridIntersections, storeysByElevation } from './building';
import { createProject } from './project';
import { historyReducer, type HistoryState } from './reducer';
import { parseProject, serializeProject } from './serialization';
import { SolverTranslationError, translateProject } from '../solver/translateProject';
import { validateProject } from './validation';

const state = (): HistoryState => ({ project: createProject('M7 Building'), past: [], future: [] });
const planNode = (id: string, x: number, z: number) => ({ id, name: id, position: { x, y: 3, z }, storeyId: 'storey-roof' });

describe('M7 building model', () => {
  it('manages unique ground, typical and roof elevations', () => {
    let current = state();
    expect(storeysByElevation(current.project.building.storeys).map((storey) => storey.elevation)).toEqual([0, 3]);
    current = historyReducer(current, { type: 'add-storey' });
    const level = current.project.building.storeys.find((storey) => storey.role === 'typical')!;
    const roof = current.project.building.storeys.find((storey) => storey.role === 'roof')!;
    expect(level.elevation).toBe(3);
    expect(roof.elevation).toBe(6);
    expect(validateProject(current.project).filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('deletes an unreferenced ground or roof only when a typical level can inherit the role', () => {
    let current = historyReducer(state(), { type: 'add-storey' });
    current = historyReducer(current, { type: 'delete-storey', id: 'storey-ground' });
    expect(current.project.building.storeys.map((storey) => storey.role).sort()).toEqual(['ground', 'roof']);
    expect(validateProject(current.project).filter((issue) => issue.severity === 'error')).toEqual([]);
    const original = state();
    const protectedProject = historyReducer(original, { type: 'delete-storey', id: 'storey-ground' });
    expect(protectedProject).toBe(original);
  });

  it('generates editable X/Z grids and deterministic intersections', () => {
    let current = state();
    expect(gridIntersections(current.project)).toHaveLength(4);
    current = historyReducer(current, { type: 'add-grid-line', axis: 'x' });
    const line = current.project.building.gridLines.at(-1)!;
    current = historyReducer(current, { type: 'update-grid-line', id: line.id, changes: { label: 'C', coordinate: 12 } });
    expect(gridIntersections(current.project).find((point) => point.label === 'C2')).toMatchObject({ x: 12, z: 6 });
  });

  it('creates columns and beams connected to storey/grid nodes', () => {
    let current = state();
    current = historyReducer(current, { type: 'generate-building-column', xLineId: 'grid-x-a', zLineId: 'grid-z-1', startStoreyId: 'storey-ground', endStoreyId: 'storey-roof' });
    current = historyReducer(current, { type: 'generate-building-beam', startXLineId: 'grid-x-a', startZLineId: 'grid-z-1', endXLineId: 'grid-x-b', endZLineId: 'grid-z-1', storeyId: 'storey-roof' });
    const [column, beam] = current.project.members;
    expect(column).toMatchObject({ type: 'column', storeyId: 'storey-ground', endStoreyId: 'storey-roof' });
    expect(beam).toMatchObject({ type: 'beam', storeyId: 'storey-roof' });
    expect(current.project.nodes.find((node) => node.id === column.startNodeId)?.position.y).toBe(0);
    expect(current.project.nodes.find((node) => node.id === column.endNodeId)?.position.y).toBe(3);
    expect(validateProject(current.project).filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('copies floor beams to a target storey with connected target nodes', () => {
    let current = historyReducer(state(), { type: 'add-storey' });
    const level = current.project.building.storeys.find((storey) => storey.role === 'typical')!;
    current = historyReducer(current, { type: 'generate-building-beam', startXLineId: 'grid-x-a', startZLineId: 'grid-z-1', endXLineId: 'grid-x-b', endZLineId: 'grid-z-1', storeyId: level.id });
    current = historyReducer(current, { type: 'copy-storey-members', sourceStoreyId: level.id, targetStoreyId: 'storey-roof' });
    const copied = current.project.members.find((member) => member.storeyId === 'storey-roof')!;
    expect(copied.type).toBe('beam');
    expect(current.project.nodes.find((node) => node.id === copied.startNodeId)?.position.y).toBe(6);
    expect(current.project.members).toHaveLength(2);
  });

  it('validates slab outlines/openings and structural wall plan geometry', () => {
    let current = state();
    current.project.nodes.push(planNode('a', 0, 0), planNode('b', 6, 0), planNode('c', 6, 6), planNode('d', 0, 6), planNode('e', 2, 2), planNode('f', 4, 2), planNode('g', 4, 4), planNode('h', 2, 4));
    current = historyReducer(current, { type: 'add-slab', storeyId: 'storey-roof', boundaryNodeIds: ['a', 'b', 'c', 'd'] });
    const slab = current.project.building.slabs[0];
    current = historyReducer(current, { type: 'add-slab-opening', slabId: slab.id, boundaryNodeIds: ['e', 'f', 'g', 'h'] });
    current = historyReducer(current, { type: 'add-wall', storeyId: 'storey-roof', startNodeId: 'a', endNodeId: 'b' });
    expect(validateProject(current.project).filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(current.project.building.walls[0]?.thickness).toBe(0.2);
    const roundTrip = parseProject(serializeProject(current.project));
    expect(roundTrip.errors).toEqual([]);
    expect(roundTrip.project?.building.slabs[0]?.openings[0]?.boundaryNodeIds).toEqual(['e', 'f', 'g', 'h']);
    expect(roundTrip.project?.building.walls[0]?.storeyId).toBe('storey-roof');
    const invalid = structuredClone(current.project);
    invalid.building.slabs[0].openings[0].boundaryNodeIds = ['a', 'e', 'f'];
    expect(validateProject(invalid).some((issue) => issue.message.includes('Opening must lie strictly inside'))).toBe(true);
  });

  it('migrates schema-v2 JSON, preserves building data, and keeps floor actions undoable', () => {
    const raw = JSON.parse(serializeProject(createProject()));
    raw.schemaVersion = 2; delete raw.building;
    const migrated = parseProject(JSON.stringify(raw));
    expect(migrated.errors).toEqual([]);
    expect(migrated.project?.schemaVersion).toBe(4);
    let current = state();
    current = historyReducer(current, { type: 'add-storey' });
    expect(current.project.building.storeys).toHaveLength(3);
    current = historyReducer(current, { type: 'undo' });
    expect(current.project.building.storeys).toHaveLength(2);
    current = historyReducer(current, { type: 'redo' });
    expect(current.project.building.storeys).toHaveLength(3);
  });

  it('rejects invalid building references and refuses unmeshed surface analysis', () => {
    const project = createProject();
    project.building.gridLines.push({ id: 'duplicate-grid', axis: 'x', label: 'A', coordinate: 0 });
    project.building.walls.push({ id: 'bad-wall', name: 'Bad', storeyId: 'missing', startNodeId: 'missing', endNodeId: 'missing', thickness: 0, materialId: 'missing' });
    const messages = validateProject(project).map((issue) => issue.message);
    expect(messages).toContain('Grid labels must be unique within an axis.');
    expect(messages).toContain('Wall references a missing storey.');
    const surfaceProject = createProject();
    surfaceProject.nodes.push(planNode('a', 0, 0), planNode('b', 6, 0), planNode('c', 6, 6), planNode('d', 0, 6));
    surfaceProject.building.slabs.push({ id: 'slab', name: 'S1', storeyId: 'storey-roof', boundaryNodeIds: ['a', 'b', 'c', 'd'], thickness: 0.15, materialId: surfaceProject.materials[0].id, openings: [] });
    try { translateProject(surfaceProject); throw new Error('Expected the surface model to be rejected.'); }
    catch (error) { expect(error).toBeInstanceOf(SolverTranslationError); expect((error as SolverTranslationError).diagnostics.some((item) => item.code === 'UNMESHED_SURFACE_SOURCE')).toBe(true); }
  });

  it('protects nodes that are referenced by modeled floor surfaces', () => {
    let current = state();
    current.project.nodes.push(planNode('a', 0, 0), planNode('b', 6, 0), planNode('c', 6, 6), planNode('d', 0, 6));
    current = historyReducer(current, { type: 'add-slab', storeyId: 'storey-roof', boundaryNodeIds: ['a', 'b', 'c', 'd'] });
    current = historyReducer(current, { type: 'delete-entity', kind: 'node', id: 'a' });
    expect(current.project.nodes.some((node) => node.id === 'a')).toBe(true);
    expect(current.project.building.slabs[0].boundaryNodeIds).toContain('a');
  });
});
