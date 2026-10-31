import type { Project } from '../model/types';
import { rejectedSolverResult, type SolverResult } from './contracts';
import { projectInputHash, SolverTranslationError, translateProject } from './translateProject';

export interface SolverAdapter {
  analyze(project: Project, options?: { timeoutMs?: number }): Promise<SolverResult>;
}

/** Retained safe fallback for the limited web client and unavailable desktop runner. */
export class NotImplementedSolverAdapter implements SolverAdapter {
  async analyze(project: Project): Promise<SolverResult> {
    return rejectedSolverResult(projectInputHash(project), project.updatedAt, [{ severity: 'error', code: 'RUNNER_UNAVAILABLE', message: 'The isolated PyNite runner is available only to the configured STRUX desktop host. No analysis was performed.' }]);
  }
}

/** Tauri invokes the isolated Python process; React and Three.js never import PyNite. */
export class TauriPyNiteSolverAdapter implements SolverAdapter {
  async analyze(project: Project, options: { timeoutMs?: number } = {}): Promise<SolverResult> {
    let input;
    try { input = translateProject(project); }
    catch (error) {
      const diagnostics = error instanceof SolverTranslationError ? error.diagnostics : [{ severity: 'error' as const, code: 'TRANSLATION_ERROR', message: error instanceof Error ? error.message : 'Could not translate the model for analysis.' }];
      return rejectedSolverResult(projectInputHash(project), project.updatedAt, diagnostics);
    }
    if (!('__TAURI_INTERNALS__' in window)) return rejectedSolverResult(input.inputHash, input.projectRevision, [{ severity: 'error', code: 'RUNNER_UNAVAILABLE', message: 'The browser client has no Python process bridge. No analysis was performed.' }]);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const raw = await invoke<string>('run_pynite_analysis', { inputJson: JSON.stringify(input), timeoutMs: options.timeoutMs ?? 15_000 });
      const result = JSON.parse(raw) as SolverResult;
      if (result.inputHash !== input.inputHash || result.projectRevision !== input.projectRevision) return rejectedSolverResult(input.inputHash, input.projectRevision, [{ severity: 'error', code: 'PROVENANCE_MISMATCH', message: 'The runner returned results for a different model revision; they were discarded.' }]);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The isolated Python runner failed.';
      const status = /timeout/i.test(message) ? 'timeout' : 'error';
      return { ...rejectedSolverResult(input.inputHash, input.projectRevision, [{ severity: 'error', code: status === 'timeout' ? 'RUNNER_TIMEOUT' : 'RUNNER_PROCESS_ERROR', message }]), status };
    }
  }
}
