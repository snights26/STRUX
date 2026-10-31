import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createProject } from './model/project';
import { historyReducer, type HistoryState } from './model/reducer';
import { parseProject } from './model/serialization';
import { fromDisplay, toDisplay, unitLabel } from './model/units';
import { validateProject } from './model/validation';
import type { Selection, UnitSystem, Vector3 } from './model/types';
import { importProjectFromFile, openProjectFile, saveProjectFile } from './persistence/projectFile';
import { Viewport, type CameraPreset, type ToolMode } from './renderer/Viewport';
import { snapPositionOnWorkingPlane, type ModelingView, type WorkingPlane } from './renderer/modelingPlane';
import { TauriPyNiteSolverAdapter } from './solver/SolverAdapter';
import type { SolverResult } from './solver/contracts';
import { resultMatchesProject } from './solver/translateProject';
import { Inspector } from './ui/Inspector';
import { ModelTree } from './ui/ModelTree';
import { ResultsPanel } from './ui/ResultsPanel';
import './styles.css';

const STORAGE_KEY = 'strux.project.v1';
const initialProject = () => {
  try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) return parseProject(saved).project ?? createProject(); } catch { /* local storage unavailable */ }
  return createProject('Concept Frame');
};

const toolItems: { mode: ToolMode; icon: string; label: string; key: string }[] = [
  { mode: 'select', icon: '⌁', label: 'Select', key: 'V' },
  { mode: 'node', icon: '＋', label: 'Node', key: 'N' },
  { mode: 'member', icon: '╱', label: 'Member', key: 'M' },
  { mode: 'support', icon: '▽', label: 'Support', key: 'S' },
  { mode: 'load', icon: '↓', label: 'Nodal Load', key: 'L' },
];

function ExactNodePanel({ draft, unitSystem, onChange, onAdd }: { draft: Vector3; unitSystem: UnitSystem; onChange: (next: Vector3) => void; onAdd: () => void }) {
  const parse = (value: string) => Number.isFinite(Number(value)) ? Number(value) : 0;
  return <form className="exact-node-panel" onSubmit={(event) => { event.preventDefault(); onAdd(); }}><span>EXACT NODE ({unitLabel(unitSystem, 'length')})</span>{(['x', 'y', 'z'] as const).map((axis) => <label key={axis}>{axis.toUpperCase()}<input aria-label={`Exact node ${axis.toUpperCase()}`} type="number" step="0.1" value={toDisplay(draft[axis], unitSystem, 'length')} onChange={(event) => onChange({ ...draft, [axis]: fromDisplay(parse(event.target.value), unitSystem, 'length') })} /></label>)}<button type="submit">Place</button></form>;
}

export default function App() {
  const [history, dispatch] = useReducer(historyReducer, undefined, (): HistoryState => ({ project: initialProject(), past: [], future: [] }));
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [mode, setMode] = useState<ToolMode>('select');
  const [pendingMemberNodeId, setPendingMemberNodeId] = useState<string | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('isometric');
  const [workingPlaneOffsets, setWorkingPlaneOffsets] = useState<Record<ModelingView, number>>({ top: 0, front: 0, side: 0 });
  const [activeStoreyId, setActiveStoreyId] = useState<string | null>(null);
  const [hiddenStoreyIds, setHiddenStoreyIds] = useState<string[]>([]);
  const [nodeDraft, setNodeDraft] = useState<Vector3>({ x: 0, y: 0, z: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const [fileMessage, setFileMessage] = useState('Autosaved locally');
  const [solverResult, setSolverResult] = useState<SolverResult | null>(null);
  const [resultCaseId, setResultCaseId] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const issues = useMemo(() => validateProject(history.project), [history.project]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history.project)); } catch { /* storage persistence is optional */ }
  }, [history.project]);
  useEffect(() => {
    if (solverResult && !resultMatchesProject(history.project, solverResult)) { setSolverResult(null); setResultCaseId(null); setShowResults(false); setFileMessage('Model changed; experimental results invalidated'); }
  }, [history.project, solverResult]);
  useEffect(() => {
    if (!history.project.building.storeys.some((storey) => storey.id === activeStoreyId)) setActiveStoreyId(history.project.building.storeys[0]?.id ?? null);
  }, [activeStoreyId, history.project.building.storeys]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); dispatch({ type: event.shiftKey ? 'redo' : 'undo' }); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); dispatch({ type: 'redo' }); return; }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      const tool = toolItems.find((item) => item.key.toLowerCase() === event.key.toLowerCase());
      if (tool) activateMode(tool.mode);
      if (event.key === 'Escape') { setSelection(null); setSelectedNodeIds([]); setSelectedMemberIds([]); setPendingMemberNodeId(null); setMode('select'); }
    };
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  });

  function activateMode(next: ToolMode) { setMode(next); setPendingMemberNodeId(null); }
  function onSelect(next: Selection, additive = false) {
    if (mode === 'member' && next.kind === 'node') {
      if (pendingMemberNodeId && pendingMemberNodeId !== next.id) { dispatch({ type: 'add-member', startNodeId: pendingMemberNodeId, endNodeId: next.id }); setPendingMemberNodeId(null); setMode('select'); }
      else setPendingMemberNodeId(next.id);
      setSelectedNodeIds([next.id]); setSelectedMemberIds([]); setSelection(next); return;
    }
    if (mode === 'support' && next.kind === 'node') { dispatch({ type: 'set-support', nodeId: next.id, supportType: 'pinned' }); setSelectedNodeIds([next.id]); setSelectedMemberIds([]); setSelection(next); setFileMessage('Pinned support assigned'); return; }
    if (mode === 'load' && next.kind === 'node') { dispatch({ type: 'add-load', nodeId: next.id }); setSelectedNodeIds([next.id]); setSelectedMemberIds([]); setSelection(next); setFileMessage('Nodal load created'); return; }
    if (next.kind === 'node') {
      const nextIds = additive ? (selectedNodeIds.includes(next.id) ? selectedNodeIds.filter((id) => id !== next.id) : [...selectedNodeIds, next.id]) : [next.id];
      setSelectedNodeIds(nextIds); setSelectedMemberIds([]);
      setSelection(nextIds.length ? (nextIds.includes(next.id) ? next : { kind: 'node', id: nextIds[0] }) : null);
      return;
    }
    if (next.kind === 'member') {
      const nextIds = additive ? (selectedMemberIds.includes(next.id) ? selectedMemberIds.filter((id) => id !== next.id) : [...selectedMemberIds, next.id]) : [next.id];
      setSelectedMemberIds(nextIds); setSelectedNodeIds([]); setSelection(nextIds.length ? (nextIds.includes(next.id) ? next : { kind: 'member', id: nextIds[0] }) : null); return;
    }
    // Retain a node set while selecting a slab so the selected loop can be used
    // to define a validated opening in that slab.
    if (next.kind === 'slab') { setSelectedMemberIds([]); setSelection(next); return; }
    setSelectedNodeIds([]); setSelectedMemberIds([]); setSelection(next);
  }
  const storeyForPosition = (position: Vector3) => history.project.building.storeys.find((storey) => Math.abs(storey.elevation - position.y) <= 1e-8)?.id;
  function onGroundHit(position: Vector3, plane: WorkingPlane) {
    if (mode === 'node') {
      const snappedPosition = snapPositionOnWorkingPlane(position, plane, history.project.settings.gridSpacing);
      dispatch({ type: 'add-node', position: snappedPosition, storeyId: storeyForPosition(snappedPosition) });
      setFileMessage(`Node created at ${snappedPosition.x}, ${snappedPosition.y}, ${snappedPosition.z} m`);
    }
    else if (mode === 'select') { setSelection(null); setSelectedNodeIds([]); setSelectedMemberIds([]); }
  }
  async function save() {
    try { const path = await saveProjectFile(history.project); if (path) setFileMessage(`Saved ${path}`); } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save project.'); }
  }
  async function openNative() {
    try { const result = await openProjectFile(); if (result.project) { dispatch({ type: 'replace', project: result.project }); setSelection(null); setSelectedNodeIds([]); setSelectedMemberIds([]); setFileMessage(`Opened ${result.path ?? 'project'}`); } else if (result.errors.length) setNotice(result.errors.join('\n')); else if (!('__TAURI_INTERNALS__' in window)) inputRef.current?.click(); } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not open project.'); }
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    const result = await importProjectFromFile(file);
    if (result.project) { dispatch({ type: 'replace', project: result.project }); setSelection(null); setSelectedNodeIds([]); setSelectedMemberIds([]); setFileMessage(`Imported ${file.name}`); }
    else setNotice(result.errors.join('\n'));
  }
  async function analyze() {
    setFileMessage('Running isolated experimental PyNite analysis…');
    const result = await new TauriPyNiteSolverAdapter().analyze(history.project);
    setSolverResult(result); setResultCaseId(result.cases[0]?.id ?? null); setShowResults(true);
    if (result.status === 'success') setFileMessage(`Experimental results available for ${result.cases.length} case${result.cases.length === 1 ? '' : 's'}`);
    else setFileMessage('No analysis results were produced');
  }
  const loadCount = history.project.nodalLoads.length + history.project.memberPointLoads.length + history.project.memberDistributedLoads.length + history.project.selfWeightLoads.length;
  const selectedText = selection ? `${selection.kind === 'nodalLoad' ? 'load' : selection.kind} selected` : 'Nothing selected';
  const analysisCase = solverResult?.status === 'success' ? solverResult.cases.find((item) => item.id === resultCaseId) ?? solverResult.cases[0] : undefined;
  const visibleStoreyIds = history.project.building.storeys.filter((storey) => !hiddenStoreyIds.includes(storey.id)).map((storey) => storey.id);
  const activeStorey = history.project.building.storeys.find((storey) => storey.id === activeStoreyId);
  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">S</span><span>STRUX</span><small>PHASE 1</small></div>
      <div className="project-name"><span>PROJECT</span><strong>{history.project.name}</strong></div>
      <div className="top-actions"><button onClick={openNative}>Open</button><button onClick={save}>Save JSON</button><input ref={inputRef} hidden type="file" accept="application/json,.json,.strux.json" onChange={(event) => void importFile(event.target.files?.[0])} /><button disabled={!solverResult} onClick={() => setShowResults(true)}>Results</button><button className="analysis-button" onClick={() => void analyze()}>▶ Analyze</button></div>
    </header>
    <nav className="toolbar" aria-label="Modeling tools">
      <div className="tool-cluster">{toolItems.map((tool) => <button key={tool.mode} className={`tool${mode === tool.mode ? ' active' : ''}`} onClick={() => activateMode(tool.mode)} title={`${tool.label} (${tool.key})`}><span>{tool.icon}</span>{tool.label}</button>)}</div>
      <div className="toolbar-spacer" />
      <button className="tool undo" disabled={!history.past.length} onClick={() => dispatch({ type: 'undo' })}>↶ Undo</button><button className="tool undo" disabled={!history.future.length} onClick={() => dispatch({ type: 'redo' })}>↷ Redo</button>
      <label className="storey-control">Storey<select value={activeStoreyId ?? ''} onChange={(event) => setActiveStoreyId(event.target.value)}>{history.project.building.storeys.map((storey) => <option key={storey.id} value={storey.id}>{storey.name} · {toDisplay(storey.elevation, history.project.settings.unitSystem, 'length')}</option>)}</select></label><button className="tool undo" disabled={!activeStoreyId} onClick={() => activeStoreyId && setHiddenStoreyIds((items) => items.length === 1 && items[0] === activeStoreyId ? [] : history.project.building.storeys.filter((storey) => storey.id !== activeStoreyId).map((storey) => storey.id))}>Isolate</button><button className="tool undo" disabled={!activeStoreyId} onClick={() => activeStoreyId && setHiddenStoreyIds((items) => items.includes(activeStoreyId) ? items.filter((id) => id !== activeStoreyId) : [...items, activeStoreyId])}>Show / hide</button><button className="tool undo" onClick={() => setHiddenStoreyIds([])}>All floors</button><button className="tool undo" disabled={!activeStoreyId} onClick={() => { const ids = history.project.members.filter((member) => member.storeyId === activeStoreyId || member.endStoreyId === activeStoreyId).map((member) => member.id); setSelectedMemberIds(ids); setSelectedNodeIds([]); setSelection(ids.length ? { kind: 'member', id: ids[0] } : null); }}>Select floor</button>
      <label className="units-control">Units<select value={history.project.settings.unitSystem} onChange={(event) => dispatch({ type: 'update-project', changes: { settings: { ...history.project.settings, unitSystem: event.target.value as UnitSystem } } })}><option value="metric">Metric</option><option value="imperial">Imperial</option></select></label>
    </nav>
    <section className="workspace">
      <ModelTree project={history.project} selection={selection} selectedNodeIds={selectedNodeIds} selectedMemberIds={selectedMemberIds} onSelect={onSelect} />
      <section className="canvas-area"><Viewport project={history.project} selection={selection} selectedNodeIds={selectedNodeIds} selectedMemberIds={selectedMemberIds} visibleStoreyIds={visibleStoreyIds} activeStoreyId={activeStorey?.id} mode={mode} pendingMemberNodeId={pendingMemberNodeId} cameraPreset={cameraPreset} onCameraPreset={setCameraPreset} onSelect={onSelect} onGroundHit={onGroundHit} workingPlaneOffsets={workingPlaneOffsets} onWorkingPlaneOffset={(view, offset) => setWorkingPlaneOffsets((current) => ({ ...current, [view]: offset }))} unitSystem={history.project.settings.unitSystem} analysisCase={analysisCase} />{mode === 'node' && <ExactNodePanel draft={nodeDraft} unitSystem={history.project.settings.unitSystem} onChange={setNodeDraft} onAdd={() => { dispatch({ type: 'add-node', position: nodeDraft, storeyId: storeyForPosition(nodeDraft) }); setFileMessage(`Exact node created at ${nodeDraft.x}, ${nodeDraft.y}, ${nodeDraft.z} m`); }} />}</section>
      {showResults && solverResult ? <ResultsPanel project={history.project} result={solverResult} selectedCaseId={resultCaseId} onSelectCase={setResultCaseId} onClose={() => setShowResults(false)} /> : <Inspector project={history.project} selection={selection} selectedNodeIds={selectedNodeIds} activeStoreyId={activeStoreyId} onActiveStorey={setActiveStoreyId} dispatch={dispatch} />}
    </section>
    <footer className="statusbar"><span><i className="save-indicator" />{fileMessage}</span><span>{selectedText}</span><span>{history.project.nodes.length} nodes · {history.project.members.length} members · {loadCount} loads</span><span className={issues.some((issue) => issue.severity === 'error') ? 'status-error' : ''}>{issues.length ? `${issues.length} model check${issues.length > 1 ? 's' : ''}` : 'Model data valid'}</span></footer>
    {notice && <div className="modal-backdrop" role="presentation" onMouseDown={() => setNotice(null)}><section className="notice-modal" role="dialog" aria-modal="true" aria-labelledby="notice-title" onMouseDown={(event) => event.stopPropagation()}><span className="notice-symbol">!</span><h2 id="notice-title">Phase 1 notice</h2><p>{notice}</p><button className="primary-button" onClick={() => setNotice(null)}>Understood</button></section></div>}
  </main>;
}
