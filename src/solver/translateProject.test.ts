import { describe, expect, it } from 'vitest';
import { createProject } from '../model/project';
import { historyReducer, type HistoryState } from '../model/reducer';
import { resultMatchesProject, translateProject, SolverTranslationError } from './translateProject';

const state = (): HistoryState => ({ project: createProject('Solver input'), past: [], future: [] });

function frame(): HistoryState {
  let current = historyReducer(state(), { type: 'add-node', position: { x: 0, y: 0, z: 0 } });
  current = historyReducer(current, { type: 'add-node', position: { x: 3, y: 0, z: 0 } });
  current = historyReducer(current, { type: 'add-member', startNodeId: current.project.nodes[0].id, endNodeId: current.project.nodes[1].id });
  return current;
}

describe('PyNite solver-input translation', () => {
  it('maps deterministic names, SI coordinates, material shear modulus, supports and nodal loads', () => {
    let current = frame();
    const [start, end] = current.project.nodes;
    current = historyReducer(current, { type: 'set-support', nodeId: start.id, supportType: 'fixed' });
    current = historyReducer(current, { type: 'add-load', nodeId: end.id });
    const input = translateProject(current.project);
    expect(input.coordinateConvention).toBe('right-handed-x-y-up-z');
    expect(input.units).toBe('SI-m-N-Pa');
    expect(input.nodes.map((node) => node.name)).toEqual(['N_0001', 'N_0002']);
    expect(input.members[0].rotationDegrees).toBe(0);
    expect(input.materials[0].shearModulus).toBeCloseTo(input.materials[0].elasticModulus / (2 * (1 + input.materials[0].poissonRatio)));
    expect(input.supports[0].restraints).toEqual([true, true, true, true, true, true]);
    expect(input.nodalLoads[0].values.fy).toBe(-10_000);
    expect(input.loadCombinations).toEqual([{ id: 'lc-dead', name: 'Dead Load', factors: { 'lc-dead': 1 }, kind: 'load-case' }]);
  });

  it('maps member directions, distances, load combinations, releases, and SI self-weight without duplication', () => {
    let current = frame();
    const member = current.project.members[0];
    current = historyReducer(current, { type: 'add-load-case' });
    const live = current.project.loadCases.at(-1)!;
    current = historyReducer(current, { type: 'update-load-case', id: live.id, changes: { name: 'Live', category: 'live', isActive: true } });
    current = historyReducer(current, { type: 'add-member-point-load', memberId: member.id });
    current = historyReducer(current, { type: 'update-member-point-load', id: current.project.memberPointLoads[0].id, changes: { direction: 'local-y', position: 0.25 } });
    current = historyReducer(current, { type: 'add-member-distributed-load', memberId: member.id });
    current = historyReducer(current, { type: 'update-member-distributed-load', id: current.project.memberDistributedLoads[0].id, changes: { direction: 'global-z', startMagnitude: -2000, endMagnitude: -3000 } });
    current = historyReducer(current, { type: 'add-self-weight-load' });
    current = historyReducer(current, { type: 'add-load-combination' });
    const combination = current.project.loadCombinations[0];
    current = historyReducer(current, { type: 'update-load-combination', id: combination.id, changes: { factors: [{ loadCaseId: 'lc-dead', factor: 1.2 }, { loadCaseId: live.id, factor: 1.6 }] } });
    current = historyReducer(current, { type: 'update-member-releases', id: member.id, endReleases: { start: [false, false, false, false, false, true], end: [false, false, false, false, false, true] } });
    const input = translateProject(current.project);
    expect(input.memberPointLoads[0]).toMatchObject({ direction: 'Fy', x: 0.75, caseId: live.id });
    expect(input.memberDistributedLoads.find((load) => load.source === 'member-distributed')).toMatchObject({ direction: 'FZ', startMagnitude: -2000, endMagnitude: -3000 });
    const selfWeight = input.memberDistributedLoads.find((load) => load.source === 'self-weight')!;
    expect(selfWeight.direction).toBe('FY');
    expect(selfWeight.startMagnitude).toBeCloseTo(-current.project.materials[0].density * current.project.sections[0].area * 9.80665);
    expect(input.members[0].releases[5]).toBe(true);
    expect(input.members[0].releases[11]).toBe(true);
    expect(input.loadCombinations.find((item) => item.id === combination.id)?.factors).toEqual({ 'lc-dead': 1.2, [live.id]: 1.6 });
  });

  it('rejects validation failures and unknown extensions instead of omitting them', () => {
    const current = frame();
    current.project.extensions.experimentalShell = { unsupported: true };
    expect(() => translateProject(current.project)).toThrow(SolverTranslationError);
    try { translateProject(current.project); } catch (error) { expect((error as SolverTranslationError).diagnostics[0].code).toBe('UNSUPPORTED_EXTENSION'); }
  });

  it('binds experimental results to the exact translated model revision and hash', () => {
    const current = frame();
    const input = translateProject(current.project);
    const result = { version: 2 as const, status: 'success' as const, experimental: true as const, engine: { name: 'PyNiteFEA' as const, version: '3.2.1' }, inputHash: input.inputHash, projectRevision: input.projectRevision, diagnostics: [], cases: [] };
    expect(resultMatchesProject(current.project, result)).toBe(true);
    const changed = structuredClone(current.project); changed.updatedAt = '2099-01-01T00:00:00.000Z';
    expect(resultMatchesProject(changed, result)).toBe(false);
  });
});
