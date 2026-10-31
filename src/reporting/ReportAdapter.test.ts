import { describe, expect, it } from 'vitest';
import { createProject } from '../model/project';
import { createHtmlCalculationReport, createPdfCalculationReport } from './ReportAdapter';
import type { SolverResult } from '../solver/contracts';

describe('experimental calculation reports', () => {
  it('exports only actual solver provenance and case data', () => {
    const project = createProject('Report Frame');
    project.nodes.push({ id: 'n1', name: 'N1', position: { x: 0, y: 0, z: 0 } });
    const result: SolverResult = {
      version: 2, status: 'success', experimental: true, engine: { name: 'PyNiteFEA', version: '3.2.1' }, inputHash: 'fnv1a-test', projectRevision: project.updatedAt, diagnostics: [],
      cases: [{ id: 'lc-dead', name: 'Dead Load', kind: 'load-case', nodalResults: [{ nodeId: 'n1', displacement: { x: 0, y: -0.001, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, reaction: { fx: 0, fy: 10_000, fz: 0, mx: 0, my: 0, mz: 0 } }], memberResults: [], surfaceResults: [] }],
    };
    const html = createHtmlCalculationReport(project, result, result.cases[0], 'metric');
    expect(html).toContain('fnv1a-test');
    expect(html).toContain('EXPERIMENTAL');
    expect(html).toContain('10.00 kN');
    const pdf = new TextDecoder().decode(createPdfCalculationReport(project, result, result.cases[0], 'metric'));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('fnv1a-test');
  });
});
