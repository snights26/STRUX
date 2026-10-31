import type { Project, Selection } from '../model/types';

interface ModelTreeProps {
  project: Project;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
}

function Group({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return <section className="tree-group"><div className="tree-heading"><span>{label}</span><span>{count}</span></div>{children}</section>;
}

function TreeItem({ label, sublabel, active, onClick }: { label: string; sublabel?: string; active: boolean; onClick: () => void }) {
  return <button className={`tree-item${active ? ' active' : ''}`} onClick={onClick}><span className="tree-item-icon">◇</span><span className="tree-item-text"><b>{label}</b>{sublabel && <small>{sublabel}</small>}</span></button>;
}

export function ModelTree({ project, selection, onSelect }: ModelTreeProps) {
  const nodeName = (id: string) => project.nodes.find((node) => node.id === id)?.name ?? 'Missing node';
  return <aside className="model-tree panel">
    <div className="panel-title"><span>MODEL</span><span className="panel-count">{project.nodes.length + project.members.length}</span></div>
    <div className="tree-scroll">
      <Group label="NODES" count={project.nodes.length}>{project.nodes.map((node) => <TreeItem key={node.id} label={node.name} sublabel={`(${node.position.x.toFixed(2)}, ${node.position.y.toFixed(2)}, ${node.position.z.toFixed(2)})`} active={selection?.kind === 'node' && selection.id === node.id} onClick={() => onSelect({ kind: 'node', id: node.id })} />)}</Group>
      <Group label="MEMBERS" count={project.members.length}>{project.members.map((member) => <TreeItem key={member.id} label={member.name} sublabel={`${nodeName(member.startNodeId)} → ${nodeName(member.endNodeId)}`} active={selection?.kind === 'member' && selection.id === member.id} onClick={() => onSelect({ kind: 'member', id: member.id })} />)}</Group>
      <Group label="SUPPORTS" count={project.supports.length}>{project.supports.map((support) => <TreeItem key={support.id} label={`${support.type} · ${nodeName(support.nodeId)}`} active={selection?.kind === 'support' && selection.id === support.id} onClick={() => onSelect({ kind: 'support', id: support.id })} />)}</Group>
      <Group label="LOADS" count={project.nodalLoads.length}>{project.nodalLoads.map((load) => <TreeItem key={load.id} label={load.name ?? 'Nodal load'} sublabel={nodeName(load.nodeId)} active={selection?.kind === 'nodalLoad' && selection.id === load.id} onClick={() => onSelect({ kind: 'nodalLoad', id: load.id })} />)}</Group>
    </div>
  </aside>;
}
