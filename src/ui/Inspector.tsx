import { useState, type Dispatch, type FormEvent } from 'react';
import { findSelection, type ProjectAction } from '../model/reducer';
import { fromDisplay, toDisplay, unitLabel } from '../model/units';
import type { Project, Selection, UnitSystem } from '../model/types';

interface InspectorProps {
  project: Project;
  selection: Selection | null;
  selectedNodeIds: string[];
  dispatch: Dispatch<ProjectAction>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

const numeric = (value: string) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function Inspector({ project, selection, selectedNodeIds, dispatch }: InspectorProps) {
  const entity = findSelection(project, selection);
  const units = project.settings.unitSystem;
  const deleteCurrent = () => selection && dispatch({ type: 'delete-entity', kind: selection.kind, id: selection.id });
  return <aside className="inspector panel">
    <div className="panel-title"><span>PROPERTIES</span>{selection && <button className="icon-button danger" title="Delete selected" onClick={deleteCurrent}>⌫</button>}</div>
    <div className="inspector-scroll">
      {!selection && <ProjectProperties project={project} dispatch={dispatch} />}
      {selectedNodeIds.length > 1 && <NodeSetProperties nodeIds={selectedNodeIds} units={units} dispatch={dispatch} />}
      {selection?.kind === 'node' && selectedNodeIds.length <= 1 && entity !== null && <NodeProperties node={entity as Project['nodes'][number]} units={units} dispatch={dispatch} />}
      {selection?.kind === 'member' && entity !== null && <MemberProperties member={entity as Project['members'][number]} project={project} dispatch={dispatch} />}
      {selection?.kind === 'support' && entity !== null && <SupportProperties support={entity as Project['supports'][number]} project={project} dispatch={dispatch} />}
      {selection?.kind === 'nodalLoad' && entity !== null && <LoadProperties load={entity as Project['nodalLoads'][number]} project={project} units={units} dispatch={dispatch} />}
    </div>
  </aside>;
}

function NodeSetProperties({ nodeIds, units, dispatch }: { nodeIds: string[]; units: UnitSystem; dispatch: Dispatch<ProjectAction> }) {
  const [delta, setDelta] = useState({ x: 0, y: 0, z: 0 });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    dispatch({ type: 'translate-nodes', ids: nodeIds, delta: { x: fromDisplay(delta.x, units, 'length'), y: fromDisplay(delta.y, units, 'length'), z: fromDisplay(delta.z, units, 'length') } });
    setDelta({ x: 0, y: 0, z: 0 });
  };
  return <form className="property-form" onSubmit={submit}><h3>{nodeIds.length} Nodes</h3><p className="type-label">SELECTION SET</p><p className="empty-copy">Shift-click nodes in the viewport to add or remove them. Apply one atomic translation; it can be undone with Ctrl+Z.</p><h3>Translate <small>({unitLabel(units, 'length')})</small></h3>{(['x', 'y', 'z'] as const).map((axis) => <Field key={axis} label={`Δ${axis.toUpperCase()}`}><input type="number" step="0.1" value={delta[axis]} onChange={(event) => setDelta({ ...delta, [axis]: numeric(event.target.value) })} /></Field>)}<button className="form-button" type="submit">Apply translation</button></form>;
}

function ProjectProperties({ project, dispatch }: { project: Project; dispatch: Dispatch<ProjectAction> }) {
  return <div className="property-form"><p className="empty-copy">Select an object to edit it. Project values are stored in SI units and displayed in your chosen system.</p>
    <h3>Project</h3><Field label="Name"><input value={project.name} onChange={(event) => dispatch({ type: 'update-project', changes: { name: event.target.value, description: project.description } })} /></Field>
    <Field label="Description"><textarea value={project.description} rows={3} onChange={(event) => dispatch({ type: 'update-project', changes: { name: project.name, description: event.target.value } })} /></Field>
    <h3>Display</h3><Field label="Unit system"><select value={project.settings.unitSystem} onChange={(event) => dispatch({ type: 'update-project', changes: { settings: { ...project.settings, unitSystem: event.target.value as UnitSystem } } })}><option value="metric">Metric (m, kN)</option><option value="imperial">Imperial (ft, kip)</option></select></Field>
    <Field label="Grid spacing (m)"><input type="number" min="0.1" step="0.1" value={project.settings.gridSpacing} onChange={(event) => dispatch({ type: 'update-project', changes: { settings: { ...project.settings, gridSpacing: Math.max(0.1, numeric(event.target.value)) } } })} /></Field>
    <h3>Libraries</h3><div className="library-summary"><span>{project.materials.length} materials</span><span>{project.sections.length} sections</span>{project.materials.map((material) => <small key={material.id}>{material.name}</small>)}{project.sections.map((section) => <small key={section.id}>{section.name}</small>)}</div>
  </div>;
}

function NodeProperties({ node, units, dispatch }: { node: Project['nodes'][number]; units: UnitSystem; dispatch: Dispatch<ProjectAction> }) {
  const changeCoordinate = (axis: 'x' | 'y' | 'z', input: string) => dispatch({ type: 'update-node', id: node.id, changes: { position: { ...node.position, [axis]: fromDisplay(numeric(input), units, 'length') } } });
  return <div className="property-form"><h3>{node.name}</h3><p className="type-label">NODE</p><Field label="Name"><input value={node.name} onChange={(event) => dispatch({ type: 'update-node', id: node.id, changes: { name: event.target.value } })} /></Field><h3>Coordinates <small>({unitLabel(units, 'length')})</small></h3>
    {(['x', 'y', 'z'] as const).map((axis) => <Field key={axis} label={axis.toUpperCase()}><input type="number" step="0.1" value={toDisplay(node.position[axis], units, 'length')} onChange={(event) => changeCoordinate(axis, event.target.value)} /></Field>)}
  </div>;
}

function MemberProperties({ member, project, dispatch }: { member: Project['members'][number]; project: Project; dispatch: Dispatch<ProjectAction> }) {
  const nodeName = (id: string) => project.nodes.find((node) => node.id === id)?.name ?? 'Missing node';
  return <div className="property-form"><h3>{member.name}</h3><p className="type-label">FRAME MEMBER</p><Field label="Name"><input value={member.name} onChange={(event) => dispatch({ type: 'update-member', id: member.id, changes: { name: event.target.value } })} /></Field><Field label="Type"><select value={member.type} onChange={(event) => dispatch({ type: 'update-member', id: member.id, changes: { type: event.target.value as Project['members'][number]['type'] } })}><option value="beam">Beam</option><option value="column">Column</option><option value="brace">Brace</option></select></Field><Field label="Start"><output>{nodeName(member.startNodeId)}</output></Field><Field label="End"><output>{nodeName(member.endNodeId)}</output></Field><Field label="Material"><select value={member.materialId} onChange={(event) => dispatch({ type: 'update-member', id: member.id, changes: { materialId: event.target.value } })}>{project.materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></Field><Field label="Section"><select value={member.sectionId} onChange={(event) => dispatch({ type: 'update-member', id: member.id, changes: { sectionId: event.target.value } })}>{project.sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></Field><h3>Local axis</h3><Field label="Roll (deg)"><input type="number" step="1" value={Number((member.rollAngle * 180 / Math.PI).toFixed(3))} onChange={(event) => dispatch({ type: 'update-member', id: member.id, changes: { rollAngle: numeric(event.target.value) * Math.PI / 180 } })} /></Field><p className="empty-copy">Select this member in the viewport to display its provisional local X/Y/Z axes. This display is not used by a solver yet.</p></div>;
}

function SupportProperties({ support, project, dispatch }: { support: Project['supports'][number]; project: Project; dispatch: Dispatch<ProjectAction> }) {
  const nodeName = project.nodes.find((node) => node.id === support.nodeId)?.name ?? 'Missing node';
  return <div className="property-form"><h3>Support</h3><p className="type-label">{nodeName}</p><Field label="Condition"><select value={support.type} onChange={(event) => dispatch({ type: 'update-support', id: support.id, changes: { type: event.target.value as Project['supports'][number]['type'] } })}><option value="fixed">Fixed</option><option value="pinned">Pinned</option><option value="roller-x">Roller X</option><option value="roller-z">Roller Z</option><option value="custom">Custom</option></select></Field><h3>Restraints</h3><div className="restraints">{['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((label, index) => <label key={label}><input type="checkbox" checked={support.restraints[index]} onChange={(event) => { const restraints = [...support.restraints] as typeof support.restraints; restraints[index] = event.target.checked; dispatch({ type: 'update-support', id: support.id, changes: { type: 'custom', restraints } }); }} />{label}</label>)}</div></div>;
}

function LoadProperties({ load, project, units, dispatch }: { load: Project['nodalLoads'][number]; project: Project; units: UnitSystem; dispatch: Dispatch<ProjectAction> }) {
  const change = (key: keyof typeof load.values, input: string) => dispatch({ type: 'update-load', id: load.id, changes: { values: { ...load.values, [key]: fromDisplay(numeric(input), units, key.startsWith('m') ? 'moment' : 'force') } } });
  return <div className="property-form"><h3>{load.name ?? 'Nodal load'}</h3><p className="type-label">NODE LOAD</p><Field label="Name"><input value={load.name ?? ''} onChange={(event) => dispatch({ type: 'update-load', id: load.id, changes: { name: event.target.value } })} /></Field><Field label="Load case"><select value={load.loadCaseId} onChange={(event) => dispatch({ type: 'update-load', id: load.id, changes: { loadCaseId: event.target.value } })}>{project.loadCases.map((loadCase) => <option key={loadCase.id} value={loadCase.id}>{loadCase.name}</option>)}</select></Field><h3>Forces <small>({unitLabel(units, 'force')})</small></h3>{(['fx', 'fy', 'fz'] as const).map((key) => <Field key={key} label={key.toUpperCase()}><input type="number" step="0.1" value={toDisplay(load.values[key], units, 'force')} onChange={(event) => change(key, event.target.value)} /></Field>)}<h3>Moments <small>({unitLabel(units, 'moment')})</small></h3>{(['mx', 'my', 'mz'] as const).map((key) => <Field key={key} label={key.toUpperCase()}><input type="number" step="0.1" value={toDisplay(load.values[key], units, 'moment')} onChange={(event) => change(key, event.target.value)} /></Field>)}</div>;
}
