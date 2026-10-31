import type { Project } from '../model/types';

export interface ReportAdapter {
  create(project: Project): Promise<never>;
}

export class NotImplementedReportAdapter implements ReportAdapter {
  async create(_project: Project): Promise<never> {
    throw new Error('Reporting requires calculated analysis results and is not implemented in Phase 1.');
  }
}
