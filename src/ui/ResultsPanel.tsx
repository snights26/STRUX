import { useEffect, useMemo, useState } from 'react';
import { downloadCalculationArtifact, createHtmlCalculationReport, createPdfCalculationReport, calculationSummary } from '../reporting/ReportAdapter';
import { formatDisplacement, formatUnit } from '../model/units';
import type { Project, UnitSystem } from '../model/types';
import type { MemberDiagramSample, SolverResult } from '../solver/contracts';

interface ResultsPanelProps {
  project: Project;
  result: SolverResult;
  selectedCaseId: string | null;
  onSelectCase: (id: string) => void;
  onClose: () => void;
}

const value = (number: number, units: UnitSystem, quantity: 'force' | 'moment' | 'length' | 'forcePerLength' | 'momentPerLength' | 'stress') => quantity === 'length' ? formatDisplacement(number, units) : formatUnit(number, units, quantity);

function Diagram({ title, samples, valueKey, units, quantity }: { title: string; samples: MemberDiagramSample[]; valueKey: keyof Pick<MemberDiagramSample, 'axial' | 'shearY' | 'momentZ'>; units: UnitSystem; quantity: 'force' | 'moment' }) {
  const values = samples.map((sample) => sample[valueKey]);
  const maximum = Math.max(1e-12, ...values.map((item) => Math.abs(item)));
  const points = samples.map((sample, index) => `${(index / Math.max(1, samples.length - 1)) * 240},${60 - sample[valueKey] / maximum * 48}`).join(' ');
  return <section className="result-diagram"><h4>{title}</h4><svg viewBox="0 0 240 120" role="img" aria-label={`${title} diagram`}><line x1="0" y1="60" x2="240" y2="60" /><polyline points={points} /></svg><small>±{value(maximum, units, quantity)}</small></section>;
}

export function ResultsPanel({ project, result, selectedCaseId, onSelectCase, onClose }: ResultsPanelProps) {
  const units = project.settings.unitSystem;
  const selectedCase = result.cases.find((item) => item.id === selectedCaseId) ?? result.cases[0];
  const [memberId, setMemberId] = useState<string>('');
  useEffect(() => { if (selectedCase && !selectedCase.memberResults.some((item) => item.memberId === memberId)) setMemberId(selectedCase.memberResults[0]?.memberId ?? ''); }, [selectedCase, memberId]);
  const member = selectedCase?.memberResults.find((item) => item.memberId === memberId) ?? selectedCase?.memberResults[0];
  const nodeName = (id: string) => project.nodes.find((node) => node.id === id)?.name ?? id;
  const memberName = (id: string) => project.members.find((item) => item.id === id)?.name ?? id;
  const summary = useMemo(() => selectedCase ? calculationSummary(project, result, selectedCase, units) : [], [project, result, selectedCase, units]);
  return <aside className="inspector panel results-panel"><div className="panel-title"><span>EXPERIMENTAL RESULTS</span><button className="icon-button" onClick={onClose}>×</button></div><div className="inspector-scroll">
    {result.status !== 'success' && <><p className="type-label">NO RESULTS</p>{result.diagnostics.map((item, index) => <p className="solver-diagnostic" key={index}>{item.code}: {item.message}</p>)}</>}
    {result.status === 'success' && selectedCase && <div className="property-form"><p className="type-label">EXPERIMENTAL · {result.engine.name} {result.engine.version}</p><Field label="Load case / combination"><select value={selectedCase.id} onChange={(event) => onSelectCase(event.target.value)}>{result.cases.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.kind})</option>)}</select></Field><p className="empty-copy">Input hash: {result.inputHash}</p><div className="result-actions"><button onClick={() => downloadCalculationArtifact(createHtmlCalculationReport(project, result, selectedCase, units), 'text/html', 'strux-experimental-summary.html')}>Export HTML</button><button onClick={() => downloadCalculationArtifact(createPdfCalculationReport(project, result, selectedCase, units), 'application/pdf', 'strux-experimental-summary.pdf')}>Export PDF</button></div><h3>Calculation summary</h3>{summary.map((line) => <small className="summary-line" key={line}>{line}</small>)}<h3>Nodal displacements</h3><table className="result-table"><thead><tr><th>Node</th><th>DX</th><th>DY</th><th>DZ</th></tr></thead><tbody>{selectedCase.nodalResults.map((node) => <tr key={node.nodeId}><td>{nodeName(node.nodeId)}</td><td>{value(node.displacement.x, units, 'length')}</td><td>{value(node.displacement.y, units, 'length')}</td><td>{value(node.displacement.z, units, 'length')}</td></tr>)}</tbody></table><h3>Support reactions</h3><table className="result-table"><thead><tr><th>Node</th><th>FX</th><th>FY</th><th>FZ</th><th>MZ</th></tr></thead><tbody>{selectedCase.nodalResults.filter((node) => Object.values(node.reaction).some((reaction) => Math.abs(reaction) > 1e-9)).map((node) => <tr key={node.nodeId}><td>{nodeName(node.nodeId)}</td><td>{value(node.reaction.fx, units, 'force')}</td><td>{value(node.reaction.fy, units, 'force')}</td><td>{value(node.reaction.fz, units, 'force')}</td><td>{value(node.reaction.mz, units, 'moment')}</td></tr>)}</tbody></table><h3>Member diagrams</h3><Field label="Member"><select value={member?.memberId ?? ''} onChange={(event) => setMemberId(event.target.value)}>{selectedCase.memberResults.map((item) => <option key={item.memberId} value={item.memberId}>{memberName(item.memberId)}</option>)}</select></Field>{member && <><Diagram title="Axial force" samples={member.samples} valueKey="axial" units={units} quantity="force" /><Diagram title="Shear force · local Y" samples={member.samples} valueKey="shearY" units={units} quantity="force" /><Diagram title="Bending moment · local Z" samples={member.samples} valueKey="momentZ" units={units} quantity="moment" /></>}{selectedCase.surfaceResults.length > 0 && <><h3>Quad shell centre results <small>LOCAL / EXPERIMENTAL</small></h3><p className="empty-copy">No stress contours are generated. M values are bending resultants (moment per unit width); S values are membrane stresses.</p><table className="result-table"><thead><tr><th>Mesh / element</th><th>Mx</th><th>My</th><th>Qx</th><th>Sx</th><th>Sy</th></tr></thead><tbody>{selectedCase.surfaceResults.flatMap((surface) => surface.elementResults.map((element) => <tr key={`${surface.meshId}-${element.elementId}`}><td>{surface.meshId} / {element.elementId}</td><td>{value(element.moments.mx, units, 'momentPerLength')}</td><td>{value(element.moments.my, units, 'momentPerLength')}</td><td>{value(element.shears.qx, units, 'forcePerLength')}</td><td>{value(element.membraneStress.sx, units, 'stress')}</td><td>{value(element.membraneStress.sy, units, 'stress')}</td></tr>))}</tbody></table></>}</div>}
  </div></aside>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
