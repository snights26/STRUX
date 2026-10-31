import type { Project } from '../model/types';

/**
 * Boundary for the future isolated Python/PyNite process.
 * No analysis is performed in Phase 1: returning an explicit state prevents
 * unverified structural numbers from ever being shown as results.
 */
export interface SolverAdapter {
  analyze(project: Project): Promise<never>;
}

export class NotImplementedSolverAdapter implements SolverAdapter {
  async analyze(_project: Project): Promise<never> {
    throw new Error('Structural analysis is not implemented in Phase 1. No results have been calculated.');
  }
}
