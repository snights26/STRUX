import type { Project, Selection } from '../model/types';

interface ModelTreeProps {
  project: Project;
  selection: Selection | null;
  selectedNodeIds: string[];
  selectedMemberIds: string[];
  onSelect: (selection: Selection) => void;
}

function Group({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return <section className="tree-group"><div className="tree-heading"><span>{label}</span><span>{count}</span></div>{children}</section>;
}

function TreeItem({ label, sublabel, active, onClick }: { label: string; sublabel?: string; active: boolean; onClick: () => void }) {
  return <button className={`tree-item${active ? ' active' : ''}`} onClick={onClick}><span className="tree-item-icon">◇</span><span className="tree-item-text"><b>{label}</b>{sublabel && <small>{sublabel}</small>}</span></button>;
}

export function ModelTree({ project, selection, selectedNodeIds, selectedMemberIds, onSelect }: ModelTreeProps) {
  const nodeName = (id: string) => project.nodes.find((node) => node.id === id)?.name ?? 'Missing node';
  const memberName = (id: string) => project.members.find((member) => member.id === id)?.name ?? 'Missing member';
  return <aside className="model-tree panel">
    <div className="panel-title"><span>MODEL</span><span className="panel-count">{project.nodes.length + project.members.length}</span></div>
    <div className="tree-scroll">
      <Group label="NODES" count={project.nodes.length}>{project.nodes.map((node) => <TreeItem key={node.id} label={node.name} sublabel={`(${node.position.x.toFixed(2)}, ${node.position.y.toFixed(2)}, ${node.position.z.toFixed(2)})`} active={selectedNodeIds.includes(node.id)} onClick={() => onSelect({ kind: 'node', id: node.id })} />)}</Group>
      <Group label="MEMBERS" count={project.members.length}>{project.members.map((member) => <TreeItem key={member.id} label={member.name} sublabel={`${nodeName(member.startNodeId)} → ${nodeName(member.endNodeId)}`} active={selectedMemberIds.includes(member.id)} onClick={() => onSelect({ kind: 'member', id: member.id })} />)}</Group>
      <Group label="BUILDING" count={project.building.storeys.length + project.building.gridLines.length + project.building.slabs.length + project.building.walls.length + project.building.surfaceMeshes.length + project.building.diaphragms.length}>
        {project.building.storeys.map((storey) => <TreeItem key={storey.id} label={`${storey.name} · ${storey.role}`} sublabel={`EL ${storey.elevation.toFixed(2)} m`} active={selection?.kind === 'storey' && selection.id === storey.id} onClick={() => onSelect({ kind: 'storey', id: storey.id })} />)}
        {project.building.gridLines.map((line) => <TreeItem key={line.id} label={`Grid ${line.label}`} sublabel={`${line.axis.toUpperCase()} = ${line.coordinate.toFixed(2)} m`} active={selection?.kind === 'gridLine' && selection.id === line.id} onClick={() => onSelect({ kind: 'gridLine', id: line.id })} />)}
        {project.building.slabs.map((slab) => <TreeItem key={slab.id} label={slab.name} sublabel={`${slab.boundaryNodeIds.length} boundary nodes · modeling only`} active={selection?.kind === 'slab' && selection.id === slab.id} onClick={() => onSelect({ kind: 'slab', id: slab.id })} />)}
        {project.building.walls.map((wall) => <TreeItem key={wall.id} label={wall.name} sublabel="modeling only" active={selection?.kind === 'wall' && selection.id === wall.id} onClick={() => onSelect({ kind: 'wall', id: wall.id })} />)}
        {project.building.surfaceMeshes.map((mesh) => <TreeItem key={mesh.id} label={mesh.name} sublabel={`${mesh.elements.length} elements · ${mesh.elements.every((element) => element.type === 'quad4') ? 'experimental Quad3D' : 'tri3 input only'}`} active={selection?.kind === 'surfaceMesh' && selection.id === mesh.id} onClick={() => onSelect({ kind: 'surfaceMesh', id: mesh.id })} />)}
        {project.building.diaphragms.map((diaphragm) => <TreeItem key={diaphragm.id} label={diaphragm.name} sublabel={`${diaphragm.type} · solver unsupported`} active={selection?.kind === 'diaphragm' && selection.id === diaphragm.id} onClick={() => onSelect({ kind: 'diaphragm', id: diaphragm.id })} />)}
      </Group>
      <Group label="FOUNDATION / LINKS" count={project.nodalSprings.length + project.settlements.length + project.rigidLinks.length}>
        {project.nodalSprings.map((spring) => <TreeItem key={spring.id} label={spring.name} sublabel={nodeName(spring.nodeId)} active={selection?.kind === 'nodalSpring' && selection.id === spring.id} onClick={() => onSelect({ kind: 'nodalSpring', id: spring.id })} />)}
        {project.settlements.map((settlement) => <TreeItem key={settlement.id} label={settlement.name} sublabel={nodeName(settlement.nodeId)} active={selection?.kind === 'settlement' && selection.id === settlement.id} onClick={() => onSelect({ kind: 'settlement', id: settlement.id })} />)}
        {project.rigidLinks.map((link) => <TreeItem key={link.id} label={link.name} sublabel={`${nodeName(link.masterNodeId)} → ${nodeName(link.slaveNodeId)}`} active={selection?.kind === 'rigidLink' && selection.id === link.id} onClick={() => onSelect({ kind: 'rigidLink', id: link.id })} />)}
      </Group>
      <Group label="SUPPORTS" count={project.supports.length}>{project.supports.map((support) => <TreeItem key={support.id} label={`${support.type} · ${nodeName(support.nodeId)}`} active={selection?.kind === 'support' && selection.id === support.id} onClick={() => onSelect({ kind: 'support', id: support.id })} />)}</Group>
      <Group label="LOADS" count={project.nodalLoads.length + project.memberPointLoads.length + project.memberDistributedLoads.length + project.selfWeightLoads.length + project.surfacePressureLoads.length + project.thermalLoads.length + project.imposedDisplacements.length + project.windLoads.length + project.seismicLoads.length}>
        {project.nodalLoads.map((load) => <TreeItem key={load.id} label={load.name ?? 'Nodal load'} sublabel={nodeName(load.nodeId)} active={selection?.kind === 'nodalLoad' && selection.id === load.id} onClick={() => onSelect({ kind: 'nodalLoad', id: load.id })} />)}
        {project.memberPointLoads.map((load) => <TreeItem key={load.id} label={load.name ?? 'Member point load'} sublabel={memberName(load.memberId)} active={selection?.kind === 'memberPointLoad' && selection.id === load.id} onClick={() => onSelect({ kind: 'memberPointLoad', id: load.id })} />)}
        {project.memberDistributedLoads.map((load) => <TreeItem key={load.id} label={load.name ?? 'Member distributed load'} sublabel={memberName(load.memberId)} active={selection?.kind === 'memberDistributedLoad' && selection.id === load.id} onClick={() => onSelect({ kind: 'memberDistributedLoad', id: load.id })} />)}
        {project.selfWeightLoads.map((load) => <TreeItem key={load.id} label={load.name ?? 'Self weight'} sublabel={load.direction} active={selection?.kind === 'selfWeightLoad' && selection.id === load.id} onClick={() => onSelect({ kind: 'selfWeightLoad', id: load.id })} />)}
        {project.surfacePressureLoads.map((load) => <TreeItem key={load.id} label={load.name} sublabel={`${load.pressure} Pa · Quad3D`} active={selection?.kind === 'surfacePressureLoad' && selection.id === load.id} onClick={() => onSelect({ kind: 'surfacePressureLoad', id: load.id })} />)}
        {project.thermalLoads.map((load) => <TreeItem key={load.id} label={load.name} sublabel={`${memberName(load.memberId)} · input only`} active={selection?.kind === 'thermalLoad' && selection.id === load.id} onClick={() => onSelect({ kind: 'thermalLoad', id: load.id })} />)}
        {project.imposedDisplacements.map((load) => <TreeItem key={load.id} label={load.name} sublabel={`${nodeName(load.nodeId)} · input only`} active={selection?.kind === 'imposedDisplacement' && selection.id === load.id} onClick={() => onSelect({ kind: 'imposedDisplacement', id: load.id })} />)}
        {project.windLoads.map((load) => <TreeItem key={load.id} label={load.name} sublabel={`${load.direction} · input only`} active={selection?.kind === 'windLoad' && selection.id === load.id} onClick={() => onSelect({ kind: 'windLoad', id: load.id })} />)}
        {project.seismicLoads.map((load) => <TreeItem key={load.id} label={load.name} sublabel={`${load.direction} · input only`} active={selection?.kind === 'seismicLoad' && selection.id === load.id} onClick={() => onSelect({ kind: 'seismicLoad', id: load.id })} />)}
      </Group>
    </div>
  </aside>;
}
