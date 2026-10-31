import { describe, expect, it } from 'vitest';
import { createProject } from './project';
import { calculateMemberLocalAxes, snapPositionToGrid } from './coordinates';
import { historyReducer, type HistoryState } from './reducer';
import { parseProject, serializeProject } from './serialization';
import { COORDINATE_CONVENTION } from './types';
import { fromDisplay, toDisplay } from './units';
import { validateMemberDistributedLoad, validateMemberPointLoad, validateNodalLoad, validateProject, validateSelfWeightLoad } from './validation';

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

  it('translates a node set as one undoable model action', () => {
    let current = historyReducer(state(), { type: 'add-node', position: { x: 0, y: 0, z: 0 } });
    current = historyReducer(current, { type: 'add-node', position: { x: 2, y: 0, z: 0 } });
    const ids = current.project.nodes.map((node) => node.id);
    current = historyReducer(current, { type: 'translate-nodes', ids, delta: { x: 0, y: 3, z: -1 } });
    expect(current.project.nodes.map((node) => node.position)).toEqual([{ x: 0, y: 3, z: -1 }, { x: 2, y: 3, z: -1 }]);
    current = historyReducer(current, { type: 'undo' });
    expect(current.project.nodes.map((node) => node.position)).toEqual([{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }]);
    current = historyReducer(current, { type: 'redo' });
    expect(current.project.nodes.map((node) => node.position)).toEqual([{ x: 0, y: 3, z: -1 }, { x: 2, y: 3, z: -1 }]);
  });

  it('maintains project consistency through JSON serialization', () => {
    let current = historyReducer(state(), { type: 'add-node', position: { x: 1.25, y: 0, z: 8 } });
    const imported = parseProject(serializeProject(current.project));
    expect(imported.errors).toEqual([]);
    expect(imported.project?.name).toBe('Test Frame');
    expect(imported.project?.nodes[0].position.x).toBe(1.25);
  });

  it('migrates a version 1 project to the version 2 engineering-input schema', () => {
    let current = historyReducer(state(), { type: 'add-node', position: { x: 0, y: 0, z: 0 } });
    current = historyReducer(current, { type: 'add-node', position: { x: 3, y: 0, z: 0 } });
    current = historyReducer(current, { type: 'add-member', startNodeId: current.project.nodes[0].id, endNodeId: current.project.nodes[1].id });
    const legacy = JSON.parse(serializeProject(current.project));
    legacy.schemaVersion = 1;
    delete legacy.loadCombinations; delete legacy.memberPointLoads; delete legacy.memberDistributedLoads; delete legacy.selfWeightLoads;
    delete legacy.members[0].endReleases;
    const imported = parseProject(JSON.stringify(legacy));
    expect(imported.errors).toEqual([]);
    expect(imported.project?.schemaVersion).toBe(2);
    expect(imported.project?.members[0].endReleases.start).toEqual([false, false, false, false, false, false]);
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

  it('creates and retains multiple load cases, combinations, member loads and self-weight declarations', () => {
    let current = historyReducer(state(), { type: 'add-node', position: { x: 0, y: 0, z: 0 } });
    current = historyReducer(current, { type: 'add-node', position: { x: 6, y: 0, z: 0 } });
    const [a, b] = current.project.nodes;
    current = historyReducer(current, { type: 'add-member', startNodeId: a.id, endNodeId: b.id });
    current = historyReducer(current, { type: 'add-load-case' });
    const live = current.project.loadCases.at(-1)!;
    current = historyReducer(current, { type: 'update-load-case', id: live.id, changes: { name: 'Live', category: 'live', isActive: true } });
    current = historyReducer(current, { type: 'add-load-combination' });
    const combination = current.project.loadCombinations[0];
    current = historyReducer(current, { type: 'update-load-combination', id: combination.id, changes: { factors: [{ loadCaseId: 'lc-dead', factor: 1.2 }, { loadCaseId: live.id, factor: 1.6 }] } });
    current = historyReducer(current, { type: 'add-member-point-load', memberId: current.project.members[0].id });
    current = historyReducer(current, { type: 'add-member-distributed-load', memberId: current.project.members[0].id });
    current = historyReducer(current, { type: 'add-self-weight-load' });
    current = historyReducer(current, { type: 'update-member-point-load', id: current.project.memberPointLoads[0].id, changes: { direction: 'local-z', magnitude: -12_000, position: 0.25 } });
    current = historyReducer(current, { type: 'update-member-distributed-load', id: current.project.memberDistributedLoads[0].id, changes: { direction: 'local-y', startMagnitude: -3_000, endMagnitude: -6_000 } });
    current = historyReducer(current, { type: 'update-self-weight-load', id: current.project.selfWeightLoads[0].id, changes: { direction: 'global-z', factor: 0.9 } });
    current = historyReducer(current, { type: 'update-member-releases', id: current.project.members[0].id, endReleases: { start: [false, false, false, false, false, false], end: [false, false, false, true, true, true] } });
    expect(current.project.loadCases).toHaveLength(2);
    expect(current.project.loadCombinations[0].factors).toHaveLength(2);
    expect(current.project.memberPointLoads[0]).toMatchObject({ loadCaseId: live.id, direction: 'local-z', magnitude: -12_000, position: 0.25 });
    expect(current.project.memberDistributedLoads[0]).toMatchObject({ direction: 'local-y', startMagnitude: -3_000, endMagnitude: -6_000 });
    expect(current.project.selfWeightLoads[0]).toMatchObject({ direction: 'global-z', factor: 0.9 });
    expect(current.project.members[0].endReleases.end[3]).toBe(true);
    expect(parseProject(serializeProject(current.project)).errors).toEqual([]);
  });

  it('protects referenced load cases and library items and cascades member loads on member deletion', () => {
    let current = historyReducer(state(), { type: 'add-node', position: { x: 0, y: 0, z: 0 } });
    current = historyReducer(current, { type: 'add-node', position: { x: 4, y: 0, z: 0 } });
    current = historyReducer(current, { type: 'add-member', startNodeId: current.project.nodes[0].id, endNodeId: current.project.nodes[1].id });
    const member = current.project.members[0];
    current = historyReducer(current, { type: 'add-member-point-load', memberId: member.id });
    current = historyReducer(current, { type: 'add-member-distributed-load', memberId: member.id });
    const sameMaterial = historyReducer(current, { type: 'delete-material', id: member.materialId });
    const sameCase = historyReducer(current, { type: 'delete-load-case', id: 'lc-dead' });
    expect(sameMaterial).toBe(current);
    expect(sameCase).toBe(current);
    current = historyReducer(current, { type: 'delete-entity', kind: 'member', id: member.id });
    expect(current.project.memberPointLoads).toHaveLength(0);
    expect(current.project.memberDistributedLoads).toHaveLength(0);
  });

  it('edits removable library records, six-DOF supports, and unreferenced load definitions', () => {
    let current = state();
    current = historyReducer(current, { type: 'add-material' });
    const material = current.project.materials.at(-1)!;
    current = historyReducer(current, { type: 'update-material', id: material.id, changes: { name: 'Research alloy', density: 7_900 } });
    expect(current.project.materials.at(-1)).toMatchObject({ name: 'Research alloy', density: 7_900 });
    current = historyReducer(current, { type: 'delete-material', id: material.id });
    expect(current.project.materials.some((item) => item.id === material.id)).toBe(false);
    current = historyReducer(current, { type: 'add-section' });
    const section = current.project.sections.at(-1)!;
    current = historyReducer(current, { type: 'update-section', id: section.id, changes: { name: 'Research section', area: 0.02 } });
    expect(current.project.sections.at(-1)).toMatchObject({ name: 'Research section', area: 0.02 });
    current = historyReducer(current, { type: 'delete-section', id: section.id });
    expect(current.project.sections.some((item) => item.id === section.id)).toBe(false);
    current = historyReducer(current, { type: 'add-node', position: { x: 0, y: 0, z: 0 } });
    const node = current.project.nodes[0];
    current = historyReducer(current, { type: 'set-support', nodeId: node.id, supportType: 'pinned' });
    const support = current.project.supports[0];
    current = historyReducer(current, { type: 'update-support', id: support.id, changes: { type: 'custom', restraints: [true, false, true, false, true, false] } });
    expect(current.project.supports[0].restraints).toEqual([true, false, true, false, true, false]);
    current = historyReducer(current, { type: 'add-load-case' });
    const transientCase = current.project.loadCases.at(-1)!;
    current = historyReducer(current, { type: 'delete-load-case', id: transientCase.id });
    expect(current.project.loadCases.some((item) => item.id === transientCase.id)).toBe(false);
    current = historyReducer(current, { type: 'add-load-combination' });
    const transientCombination = current.project.loadCombinations[0];
    current = historyReducer(current, { type: 'delete-load-combination', id: transientCombination.id });
    expect(current.project.loadCombinations).toHaveLength(0);
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

  it('round-trips M3 area, inertia, distributed-force and density units', () => {
    expect(fromDisplay(toDisplay(0.25, 'imperial', 'area'), 'imperial', 'area')).toBeCloseTo(0.25, 10);
    expect(fromDisplay(toDisplay(0.003, 'imperial', 'secondMoment'), 'imperial', 'secondMoment')).toBeCloseTo(0.003, 10);
    expect(fromDisplay(toDisplay(-5_000, 'imperial', 'forcePerLength'), 'imperial', 'forcePerLength')).toBeCloseTo(-5_000, 10);
    expect(fromDisplay(toDisplay(7_850, 'imperial', 'density'), 'imperial', 'density')).toBeCloseTo(7_850, 10);
  });
});

describe('interactive coordinates', () => {
  it('snaps 3D placement candidates to the configured construction grid', () => {
    expect(snapPositionToGrid({ x: 1.24, y: 3.76, z: -2.51 }, 0.5)).toEqual({ x: 1, y: 4, z: -2.5 });
  });

  it('rejects an invalid construction grid interval', () => {
    expect(() => snapPositionToGrid({ x: 0, y: 0, z: 0 }, 0)).toThrow('Grid spacing');
  });

  it('constructs orthogonal right-handed local member axes', () => {
    const axes = calculateMemberLocalAxes({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 });
    expect(axes.x).toEqual({ x: 1, y: 0, z: 0 });
    expect(axes.y.y).toBeCloseTo(1);
    expect(axes.z.z).toBeCloseTo(1);
  });

  it('applies member roll around its local X axis', () => {
    const axes = calculateMemberLocalAxes({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, Math.PI / 2);
    expect(axes.y.z).toBeCloseTo(1);
    expect(axes.z.y).toBeCloseTo(-1);
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

  it('rejects invalid member loads, self weight, section data, references, combinations and release vectors', () => {
    let current = historyReducer(state(), { type: 'add-node', position: { x: 0, y: 0, z: 0 } });
    current = historyReducer(current, { type: 'add-node', position: { x: 3, y: 0, z: 0 } });
    current = historyReducer(current, { type: 'add-member', startNodeId: current.project.nodes[0].id, endNodeId: current.project.nodes[1].id });
    const project = structuredClone(current.project);
    project.sections[0].area = 0;
    project.members[0].endReleases = { start: [false, false] as unknown as [boolean, boolean, boolean, boolean, boolean, boolean], end: [false, false, false, false, false, false] };
    project.loadCombinations.push({ id: 'combo', name: 'Bad', factors: [{ loadCaseId: 'missing', factor: 1 }, { loadCaseId: 'missing', factor: 1 }] });
    project.memberPointLoads.push({ id: 'point', memberId: 'missing', loadCaseId: 'lc-dead', direction: 'local-y', magnitude: 1, position: 1.2 });
    project.memberDistributedLoads.push({ id: 'udl', memberId: project.members[0].id, loadCaseId: 'missing', direction: 'bad' as never, startMagnitude: Number.NaN, endMagnitude: 0 });
    project.selfWeightLoads.push({ id: 'sw', loadCaseId: 'lc-dead', direction: 'local-y' as never, factor: 0 });
    const messages = validateProject(project).map((issue) => issue.message);
    expect(messages).toContain('area must be a positive finite value.');
    expect(messages).toContain('Member releases must provide six boolean DOFs at each end.');
    expect(messages).toContain('Combination references a missing load case.');
    expect(messages).toContain('A load case may appear only once in a combination.');
    expect(messages).toContain('Point load references a missing member.');
    expect(messages).toContain('Point-load position must be a normalized value in [0, 1].');
    expect(messages).toContain('Distributed-load start magnitude must be finite.');
    expect(messages).toContain('Self-weight direction must use a global axis.');
  });

  it('validates all six support DOFs and standalone M3 load records', () => {
    expect(validateMemberPointLoad({ id: 'p', memberId: 'm', loadCaseId: 'lc', direction: 'global-y', magnitude: -1, position: 0.5 })).toEqual([]);
    expect(validateMemberDistributedLoad({ id: 'd', memberId: 'm', loadCaseId: 'lc', direction: 'local-z', startMagnitude: -1, endMagnitude: -2 })).toEqual([]);
    expect(validateSelfWeightLoad({ id: 's', loadCaseId: 'lc', direction: 'global-y', factor: -1 })).toEqual([]);
    const project = createProject();
    project.nodes.push({ id: 'n1', name: 'N1', position: { x: 0, y: 0, z: 0 } });
    project.supports.push({ id: 's1', nodeId: 'n1', type: 'custom', restraints: [false, false, false, false, false, false] });
    expect(validateProject(project).some((issue) => issue.message === 'A support must restrain at least one DOF.')).toBe(true);
  });
});
