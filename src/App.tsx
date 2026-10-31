import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createProject } from './model/project';
import { snapPositionToGrid } from './model/coordinates';
import { historyReducer, type HistoryState } from './model/reducer';
import { parseProject } from './model/serialization';
import { fromDisplay, toDisplay, unitLabel } from './model/units';
import { validateProject } from './model/validation';
import type { Selection, UnitSystem, Vector3 } from './model/types';
import { importProjectFromFile, openProjectFile, saveProjectFile } from './persistence/projectFile';
import { Viewport, type CameraPreset, type ToolMode } from './renderer/Viewport';
import { Inspector } from './ui/Inspector';
import { ModelTree } from './ui/ModelTree';
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
  const [mode, setMode] = useState<ToolMode>('select');
  const [pendingMemberNodeId, setPendingMemberNodeId] = useState<string | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('isometric');
  const [nodeDraft, setNodeDraft] = useState<Vector3>({ x: 0, y: 0, z: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const [fileMessage, setFileMessage] = useState('Autosaved locally');
  const inputRef = useRef<HTMLInputElement>(null);
  const issues = useMemo(() => validateProject(history.project), [history.project]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history.project)); } catch { /* storage persistence is optional */ }
  }, [history.project]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); dispatch({ type: event.shiftKey ? 'redo' : 'undo' }); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); dispatch({ type: 'redo' }); return; }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      const tool = toolItems.find((item) => item.key.toLowerCase() === event.key.toLowerCase());
      if (tool) activateMode(tool.mode);
      if (event.key === 'Escape') { setSelection(null); setSelectedNodeIds([]); setPendingMemberNodeId(null); setMode('select'); }
    };
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  });

  function activateMode(next: ToolMode) { setMode(next); setPendingMemberNodeId(null); }
  function onSelect(next: Selection, additive = false) {
    if (mode === 'member' && next.kind === 'node') {
      if (pendingMemberNodeId && pendingMemberNodeId !== next.id) { dispatch({ type: 'add-member', startNodeId: pendingMemberNodeId, endNodeId: next.id }); setPendingMemberNodeId(null); setMode('select'); }
      else setPendingMemberNodeId(next.id);
      setSelectedNodeIds([next.id]); setSelection(next); return;
    }
    if (mode === 'support' && next.kind === 'node') { dispatch({ type: 'set-support', nodeId: next.id, supportType: 'pinned' }); setSelectedNodeIds([next.id]); setSelection(next); setFileMessage('Pinned support assigned'); return; }
    if (mode === 'load' && next.kind === 'node') { dispatch({ type: 'add-load', nodeId: next.id }); setSelectedNodeIds([next.id]); setSelection(next); setFileMessage('Nodal load created'); return; }
    if (next.kind === 'node') {
      const nextIds = additive ? (selectedNodeIds.includes(next.id) ? selectedNodeIds.filter((id) => id !== next.id) : [...selectedNodeIds, next.id]) : [next.id];
      setSelectedNodeIds(nextIds);
      setSelection(nextIds.length ? (nextIds.includes(next.id) ? next : { kind: 'node', id: nextIds[0] }) : null);
      return;
    }
    setSelectedNodeIds([]); setSelection(next);
  }
  function onGroundHit(position: { x: number; y: number; z: number }) {
    if (mode === 'node') {
      const snappedPosition = snapPositionToGrid(position, history.project.settings.gridSpacing);
      dispatch({ type: 'add-node', position: snappedPosition });
      setFileMessage(`Node created at ${snappedPosition.x}, ${snappedPosition.y}, ${snappedPosition.z} m`);
    }
    else if (mode === 'select') { setSelection(null); setSelectedNodeIds([]); }
  }
  async function save() {
    try { const path = await saveProjectFile(history.project); if (path) setFileMessage(`Saved ${path}`); } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save project.'); }
  }
  async function openNative() {
    try { const result = await openProjectFile(); if (result.project) { dispatch({ type: 'replace', project: result.project }); setSelection(null); setSelectedNodeIds([]); setFileMessage(`Opened ${result.path ?? 'project'}`); } else if (result.errors.length) setNotice(result.errors.join('\n')); else if (!('__TAURI_INTERNALS__' in window)) inputRef.current?.click(); } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not open project.'); }
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    const result = await importProjectFromFile(file);
    if (result.project) { dispatch({ type: 'replace', project: result.project }); setSelection(null); setSelectedNodeIds([]); setFileMessage(`Imported ${file.name}`); }
    else setNotice(result.errors.join('\n'));
  }
  const loadCount = history.project.nodalLoads.length + history.project.memberPointLoads.length + history.project.memberDistributedLoads.length + history.project.selfWeightLoads.length;
  const selectedText = selection ? `${selection.kind === 'nodalLoad' ? 'load' : selection.kind} selected` : 'Nothing selected';
  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">S</span><span>STRUX</span><small>PHASE 1</small></div>
      <div className="project-name"><span>PROJECT</span><strong>{history.project.name}</strong></div>
      <div className="top-actions"><button onClick={openNative}>Open</button><button onClick={save}>Save JSON</button><input ref={inputRef} hidden type="file" accept="application/json,.json,.strux.json" onChange={(event) => void importFile(event.target.files?.[0])} /><button className="analysis-button" onClick={() => setNotice('Structural analysis and design are not implemented in Phase 1. No engineering results have been calculated.')}>▶ Analyze</button></div>
    </header>
    <nav className="toolbar" aria-label="Modeling tools">
      <div className="tool-cluster">{toolItems.map((tool) => <button key={tool.mode} className={`tool${mode === tool.mode ? ' active' : ''}`} onClick={() => activateMode(tool.mode)} title={`${tool.label} (${tool.key})`}><span>{tool.icon}</span>{tool.label}</button>)}</div>
      <div className="toolbar-spacer" />
      <button className="tool undo" disabled={!history.past.length} onClick={() => dispatch({ type: 'undo' })}>↶ Undo</button><button className="tool undo" disabled={!history.future.length} onClick={() => dispatch({ type: 'redo' })}>↷ Redo</button>
      <label className="units-control">Units<select value={history.project.settings.unitSystem} onChange={(event) => dispatch({ type: 'update-project', changes: { settings: { ...history.project.settings, unitSystem: event.target.value as UnitSystem } } })}><option value="metric">Metric</option><option value="imperial">Imperial</option></select></label>
    </nav>
    <section className="workspace">
      <ModelTree project={history.project} selection={selection} selectedNodeIds={selectedNodeIds} onSelect={onSelect} />
      <section className="canvas-area"><Viewport project={history.project} selection={selection} selectedNodeIds={selectedNodeIds} mode={mode} pendingMemberNodeId={pendingMemberNodeId} cameraPreset={cameraPreset} onCameraPreset={setCameraPreset} onSelect={onSelect} onGroundHit={onGroundHit} />{mode === 'node' && <ExactNodePanel draft={nodeDraft} unitSystem={history.project.settings.unitSystem} onChange={setNodeDraft} onAdd={() => { dispatch({ type: 'add-node', position: nodeDraft }); setFileMessage(`Exact node created at ${nodeDraft.x}, ${nodeDraft.y}, ${nodeDraft.z} m`); }} />}</section>
      <Inspector project={history.project} selection={selection} selectedNodeIds={selectedNodeIds} dispatch={dispatch} />
    </section>
    <footer className="statusbar"><span><i className="save-indicator" />{fileMessage}</span><span>{selectedText}</span><span>{history.project.nodes.length} nodes · {history.project.members.length} members · {loadCount} loads</span><span className={issues.some((issue) => issue.severity === 'error') ? 'status-error' : ''}>{issues.length ? `${issues.length} model check${issues.length > 1 ? 's' : ''}` : 'Model data valid'}</span></footer>
    {notice && <div className="modal-backdrop" role="presentation" onMouseDown={() => setNotice(null)}><section className="notice-modal" role="dialog" aria-modal="true" aria-labelledby="notice-title" onMouseDown={(event) => event.stopPropagation()}><span className="notice-symbol">!</span><h2 id="notice-title">Phase 1 notice</h2><p>{notice}</p><button className="primary-button" onClick={() => setNotice(null)}>Understood</button></section></div>}
  </main>;
}
