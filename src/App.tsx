import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createProject } from './model/project';
import { snapPositionToGrid } from './model/coordinates';
import { historyReducer, type HistoryState } from './model/reducer';
import { parseProject } from './model/serialization';
import { validateProject } from './model/validation';
import type { Selection, UnitSystem } from './model/types';
import { importProjectFromFile, openProjectFile, saveProjectFile } from './persistence/projectFile';
import { Viewport, type ToolMode } from './renderer/Viewport';
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

export default function App() {
  const [history, dispatch] = useReducer(historyReducer, undefined, (): HistoryState => ({ project: initialProject(), past: [], future: [] }));
  const [selection, setSelection] = useState<Selection | null>(null);
  const [mode, setMode] = useState<ToolMode>('select');
  const [pendingMemberNodeId, setPendingMemberNodeId] = useState<string | null>(null);
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
      if (event.key === 'Escape') { setSelection(null); setPendingMemberNodeId(null); setMode('select'); }
    };
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  });

  function activateMode(next: ToolMode) { setMode(next); setPendingMemberNodeId(null); }
  function onSelect(next: Selection) {
    if (mode === 'member' && next.kind === 'node') {
      if (pendingMemberNodeId && pendingMemberNodeId !== next.id) { dispatch({ type: 'add-member', startNodeId: pendingMemberNodeId, endNodeId: next.id }); setPendingMemberNodeId(null); setMode('select'); }
      else setPendingMemberNodeId(next.id);
      setSelection(next); return;
    }
    if (mode === 'support' && next.kind === 'node') { dispatch({ type: 'set-support', nodeId: next.id, supportType: 'pinned' }); setSelection(next); setFileMessage('Pinned support assigned'); return; }
    if (mode === 'load' && next.kind === 'node') { dispatch({ type: 'add-load', nodeId: next.id }); setSelection(next); setFileMessage('Nodal load created'); return; }
    setSelection(next);
  }
  function onGroundHit(position: { x: number; y: number; z: number }) {
    if (mode === 'node') {
      const snappedPosition = snapPositionToGrid(position, history.project.settings.gridSpacing);
      dispatch({ type: 'add-node', position: snappedPosition });
      setFileMessage(`Node created at ${snappedPosition.x}, ${snappedPosition.y}, ${snappedPosition.z} m`);
    }
    else if (mode === 'select') setSelection(null);
  }
  async function save() {
    try { const path = await saveProjectFile(history.project); if (path) setFileMessage(`Saved ${path}`); } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save project.'); }
  }
  async function openNative() {
    try { const result = await openProjectFile(); if (result.project) { dispatch({ type: 'replace', project: result.project }); setSelection(null); setFileMessage(`Opened ${result.path ?? 'project'}`); } else if (result.errors.length) setNotice(result.errors.join('\n')); else if (!('__TAURI_INTERNALS__' in window)) inputRef.current?.click(); } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not open project.'); }
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    const result = await importProjectFromFile(file);
    if (result.project) { dispatch({ type: 'replace', project: result.project }); setSelection(null); setFileMessage(`Imported ${file.name}`); }
    else setNotice(result.errors.join('\n'));
  }
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
      <ModelTree project={history.project} selection={selection} onSelect={onSelect} />
      <section className="canvas-area"><Viewport project={history.project} selection={selection} mode={mode} pendingMemberNodeId={pendingMemberNodeId} onSelect={onSelect} onGroundHit={onGroundHit} /></section>
      <Inspector project={history.project} selection={selection} dispatch={dispatch} />
    </section>
    <footer className="statusbar"><span><i className="save-indicator" />{fileMessage}</span><span>{selectedText}</span><span>{history.project.nodes.length} nodes · {history.project.members.length} members · {history.project.nodalLoads.length} loads</span><span className={issues.some((issue) => issue.severity === 'error') ? 'status-error' : ''}>{issues.length ? `${issues.length} model check${issues.length > 1 ? 's' : ''}` : 'Model data valid'}</span></footer>
    {notice && <div className="modal-backdrop" role="presentation" onMouseDown={() => setNotice(null)}><section className="notice-modal" role="dialog" aria-modal="true" aria-labelledby="notice-title" onMouseDown={(event) => event.stopPropagation()}><span className="notice-symbol">!</span><h2 id="notice-title">Phase 1 notice</h2><p>{notice}</p><button className="primary-button" onClick={() => setNotice(null)}>Understood</button></section></div>}
  </main>;
}
