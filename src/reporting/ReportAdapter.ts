import { formatDisplacement, formatUnit } from '../model/units';
import type { Project, UnitSystem } from '../model/types';
import type { SolverCaseResult, SolverResult } from '../solver/contracts';

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]!));
const safePdf = (value: string) => value.replace(/[^\x20-\x7e]/g, '?').replace(/[()\\]/g, '\\$&');

export function calculationSummary(project: Project, result: SolverResult, selectedCase: SolverCaseResult, units: UnitSystem): string[] {
  const reaction = selectedCase.nodalResults.reduce((total, node) => ({ fx: total.fx + node.reaction.fx, fy: total.fy + node.reaction.fy, fz: total.fz + node.reaction.fz, mx: total.mx + node.reaction.mx, my: total.my + node.reaction.my, mz: total.mz + node.reaction.mz }), { fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 });
  return [
    `STRUX experimental linear-static calculation summary`, `Project: ${project.name}`, `Result: ${selectedCase.name} (${selectedCase.kind})`, `Provenance: ${result.inputHash} / ${result.projectRevision}`,
    `Engine: ${result.engine.name} ${result.engine.version}`, `Nodes: ${selectedCase.nodalResults.length}; Members: ${selectedCase.memberResults.length}; Quad shell meshes: ${selectedCase.surfaceResults.length}`,
    `Total reactions: Fx ${formatUnit(reaction.fx, units, 'force')}, Fy ${formatUnit(reaction.fy, units, 'force')}, Fz ${formatUnit(reaction.fz, units, 'force')}`,
    `Experimental only. Independent professor verification is required before engineering use.`,
  ];
}

export function createHtmlCalculationReport(project: Project, result: SolverResult, selectedCase: SolverCaseResult, units: UnitSystem): string {
  const rows = selectedCase.nodalResults.map((node) => `<tr><td>${escapeHtml(project.nodes.find((item) => item.id === node.nodeId)?.name ?? node.nodeId)}</td><td>${formatDisplacement(node.displacement.x, units)}</td><td>${formatDisplacement(node.displacement.y, units)}</td><td>${formatDisplacement(node.displacement.z, units)}</td><td>${formatUnit(node.reaction.fx, units, 'force')}</td><td>${formatUnit(node.reaction.fy, units, 'force')}</td><td>${formatUnit(node.reaction.fz, units, 'force')}</td></tr>`).join('');
  const summary = calculationSummary(project, result, selectedCase, units).map((line) => `<p>${escapeHtml(line)}</p>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>STRUX Experimental Calculation Summary</title><style>body{font:14px Arial;margin:32px;color:#132033}h1{font-size:21px}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border:1px solid #aab7c6;padding:6px;text-align:right}th:first-child,td:first-child{text-align:left}.warning{border:1px solid #b07d23;background:#fff7df;padding:10px}</style></head><body><h1>STRUX — Experimental Calculation Summary</h1><div class="warning">EXPERIMENTAL solver output. Do not use for safety-critical engineering decisions.</div>${summary}<h2>Nodal displacements and reactions</h2><table><thead><tr><th>Node</th><th>DX</th><th>DY</th><th>DZ</th><th>Rx</th><th>Ry</th><th>Rz</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

export function createPdfCalculationReport(project: Project, result: SolverResult, selectedCase: SolverCaseResult, units: UnitSystem): ArrayBuffer {
  const lines = [...calculationSummary(project, result, selectedCase, units), ...selectedCase.nodalResults.slice(0, 32).map((node) => `${project.nodes.find((item) => item.id === node.nodeId)?.name ?? node.nodeId}: DY ${formatDisplacement(node.displacement.y, units)}; Ry ${formatUnit(node.reaction.fy, units, 'force')}`)];
  const stream = `BT\n/F1 10 Tf\n50 770 Td\n${lines.map((line, index) => `${index ? '0 -14 Td\n' : ''}(${safePdf(line)}) Tj`).join('\n')}\nET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length; pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf).buffer as ArrayBuffer;
}

export function downloadCalculationArtifact(content: BlobPart, mimeType: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export interface ReportAdapter { create(project: Project, result: SolverResult, selectedCase: SolverCaseResult, units: UnitSystem): Promise<string>; }
export class ExperimentalHtmlReportAdapter implements ReportAdapter { async create(project: Project, result: SolverResult, selectedCase: SolverCaseResult, units: UnitSystem): Promise<string> { return createHtmlCalculationReport(project, result, selectedCase, units); } }
