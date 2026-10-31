import { describe, expect, it } from 'vitest';
import { createProject } from './project';
import { snapPositionToGrid } from './coordinates';
import { historyReducer, type HistoryState } from './reducer';
import { parseProject, serializeProject } from './serialization';
import { COORDINATE_CONVENTION } from './types';
import { fromDisplay, toDisplay } from './units';
import { validateNodalLoad, validateProject } from './validation';

const state = (): HistoryState => ({ project: createProject('Test Frame'), past: [], future: [] });

describe('structural model', () => {
  it('creates nodes with typed Cartesian coordinates', () => {
    const next = historyReducer(state(), { type: 'add-node', position: { x: 2.5, y: 3, z: -1.25 } });
    expect(next.project.nodes).toHaveLength(1);
    expect(next.project.nodes[0].position).toEqual({ x: 2.5, y: 3, z: -1.25 });
  });

  it('removes dependent members, supports and loads when removing a node', () => {
    let current = historyReducer(state(), { type: 'add-node', position: { x: 0, y: 0, z: 0 } });
    current = historyReducer(current, { type: 'add-node', position: { x: 6, y: 0, z: 0 } });
    const [a, b] = current.project.nodes;
    current = historyReducer(current, { type: 'add-member', startNodeId: a.id, endNodeId: b.id });
    current = historyReducer(current, { type: 'set-support', nodeId: a.id, supportType: 'pinned' });
    current = historyReducer(current, { type: 'add-load', nodeId: a.id });
    current = historyReducer(current, { type: 'delete-entity', kind: 'node', id: a.id });
    expect(current.project.nodes).toHaveLength(1);
    expect(current.project.members).toHaveLength(0);
    expect(current.project.supports).toHaveLength(0);
    expect(current.project.nodalLoads).toHaveLength(0);
  });

  it('maintains project consistency through JSON serialization', () => {
    let current = historyReducer(state(), { type: 'add-node', position: { x: 1.25, y: 0, z: 8 } });
    const imported = parseProject(serializeProject(current.project));
    expect(imported.errors).toEqual([]);
    expect(imported.project?.name).toBe('Test Frame');
    expect(imported.project?.nodes[0].position.x).toBe(1.25);
  });

  it('rejects an unsupported project schema version', () => {
    const raw = JSON.parse(serializeProject(createProject()));
    raw.schemaVersion = 99;
    expect(parseProject(JSON.stringify(raw)).errors[0]).toContain('Unsupported schema');
  });

  it('rejects malformed entity JSON at the import boundary', () => {
    const raw = JSON.parse(serializeProject(createProject()));
    raw.nodes.push({ id: 'n1', name: 'Bad node', position: { x: 'not-a-number', y: 0, z: 0 } });
    expect(parseProject(JSON.stringify(raw)).errors).toContain('Node payload is malformed.');
  });

  it('rejects a zero-length member before a solver can receive it', () => {
    let current = historyReducer(state(), { type: 'add-node', position: { x: 1, y: 2, z: 3 } });
    current = historyReducer(current, { type: 'add-node', position: { x: 1, y: 2, z: 3 } });
    const [a, b] = current.project.nodes;
    current = historyReducer(current, { type: 'add-member', startNodeId: a.id, endNodeId: b.id });
    expect(validateProject(current.project).some((issue) => issue.message === 'Member length must be greater than zero.')).toBe(true);
  });
});

describe('units', () => {
  it('declares a right-handed global system with Y positive upward', () => {
    expect(COORDINATE_CONVENTION.handedness).toBe('right-handed');
    expect(COORDINATE_CONVENTION.y).toContain('positive upward');
  });

  it('round-trips SI length through feet', () => {
    const metres = 3.75;
    expect(fromDisplay(toDisplay(metres, 'imperial', 'length'), 'imperial', 'length')).toBeCloseTo(metres, 10);
  });

  it('converts 10 kN to the stored SI force value', () => {
    expect(fromDisplay(10, 'metric', 'force')).toBe(10_000);
  });
});

describe('interactive coordinates', () => {
  it('snaps 3D placement candidates to the configured construction grid', () => {
    expect(snapPositionToGrid({ x: 1.24, y: 3.76, z: -2.51 }, 0.5)).toEqual({ x: 1, y: 4, z: -2.5 });
  });

  it('rejects an invalid construction grid interval', () => {
    expect(() => snapPositionToGrid({ x: 0, y: 0, z: 0 }, 0)).toThrow('Grid spacing');
  });
});

describe('load validation', () => {
  it('flags non-finite load values', () => {
    const project = createProject();
    const issue = validateNodalLoad({ id: 'l1', nodeId: 'n1', loadCaseId: 'lc-dead', values: { fx: Number.NaN, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } });
    expect(issue).toHaveLength(1);
    expect(issue[0].path).toBe('values.fx');
    expect(validateProject(project)).toEqual([]);
  });
});
