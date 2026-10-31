import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { BufferGeometry, Line as ThreeLine, LineBasicMaterial, Vector3 as ThreeVector3 } from 'three';
import { OrbitControls as NativeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useEffect, useMemo } from 'react';
import type { Project, Selection, Vector3 } from '../model/types';

type ToolMode = 'select' | 'node' | 'member' | 'support' | 'load';

interface ViewportProps {
  project: Project;
  selection: Selection | null;
  mode: ToolMode;
  pendingMemberNodeId: string | null;
  onSelect: (selection: Selection) => void;
  onGroundHit: (position: Vector3) => void;
}

function CameraControls() {
  const { camera, gl } = useThree();
  const controls = useMemo(() => new NativeOrbitControls(camera, gl.domElement), [camera, gl]);
  useEffect(() => {
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.05;
    return () => controls.dispose();
  }, [controls]);
  useFrame(() => controls.update());
  return null;
}

function ModelLine({ points, color, onClick }: { points: [number, number, number][]; color: string; onClick?: (event: ThreeEvent<MouseEvent>) => void }) {
  const geometry = useMemo(() => {
    const next = new BufferGeometry();
    next.setFromPoints(points.map(([x, y, z]) => new ThreeVector3(x, y, z)));
    return next;
  }, [points]);
  const material = useMemo(() => new LineBasicMaterial({ color }), [color]);
  const line = useMemo(() => new ThreeLine(geometry, material), [geometry, material]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  return <primitive object={line} onClick={onClick} />;
}

function PointNode({ name, position, selected, onClick }: { name: string; position: Vector3; selected: boolean; onClick: () => void }) {
  return <group position={[position.x, position.y, position.z]} name={name}>
    <mesh onClick={(event) => { event.stopPropagation(); onClick(); }}>
      <sphereGeometry args={[selected ? 0.13 : 0.09, 16, 16]} />
      <meshStandardMaterial color={selected ? '#ffbf4a' : '#dce8f8'} emissive={selected ? '#7a4d00' : '#101827'} />
    </mesh>
  </group>;
}

function ModelScene({ project, selection, pendingMemberNodeId, onSelect, onGroundHit }: ViewportProps) {
  const nodeMap = useMemo(() => new Map(project.nodes.map((node) => [node.id, node])), [project.nodes]);
  const gridDivisions = Math.max(1, Math.round((project.settings.gridExtents * 2) / project.settings.gridSpacing));
  const groundClick = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onGroundHit({ x: Math.round(event.point.x * 100) / 100, y: 0, z: Math.round(event.point.z * 100) / 100 });
  };
  return <>
    <color attach="background" args={['#111824']} />
    <ambientLight intensity={1.1} />
    <directionalLight position={[8, 12, 6]} intensity={1.4} />
    <gridHelper args={[project.settings.gridExtents * 2, gridDivisions, '#45627f', '#2b3d55']} position={[0, -0.012, 0]} />
    <axesHelper args={[2]} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} onPointerDown={groundClick}>
      <planeGeometry args={[project.settings.gridExtents * 2, project.settings.gridExtents * 2]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
    {project.members.map((member) => {
      const start = nodeMap.get(member.startNodeId); const end = nodeMap.get(member.endNodeId);
      if (!start || !end) return null;
      const active = selection?.kind === 'member' && selection.id === member.id;
      return <ModelLine key={member.id} points={[[start.position.x, start.position.y, start.position.z], [end.position.x, end.position.y, end.position.z]]} color={active ? '#ffbf4a' : '#77b8ff'} onClick={(event) => { event.stopPropagation(); onSelect({ kind: 'member', id: member.id }); }} />;
    })}
    {project.supports.map((support) => {
      const node = nodeMap.get(support.nodeId); if (!node) return null;
      const active = selection?.kind === 'support' && selection.id === support.id;
      return <mesh key={support.id} position={[node.position.x, node.position.y - 0.2, node.position.z]} onClick={(event) => { event.stopPropagation(); onSelect({ kind: 'support', id: support.id }); }}>
        <coneGeometry args={[0.18, 0.28, 4]} /><meshStandardMaterial color={active ? '#ffbf4a' : '#72dcc6'} />
      </mesh>;
    })}
    {project.nodalLoads.map((load) => {
      const node = nodeMap.get(load.nodeId); if (!node) return null;
      const active = selection?.kind === 'nodalLoad' && selection.id === load.id;
      const color = active ? '#ffbf4a' : '#e77f8f';
      return <group key={load.id} position={[node.position.x, node.position.y + 0.52, node.position.z]} onClick={(event) => { event.stopPropagation(); onSelect({ kind: 'nodalLoad', id: load.id }); }}>
        <ModelLine points={[[0, 0.35, 0], [0, -0.28, 0]]} color={color} />
        <mesh position={[0, -0.32, 0]}><coneGeometry args={[0.1, 0.2, 12]} /><meshStandardMaterial color={color} /></mesh>
      </group>;
    })}
    {project.nodes.map((node) => <PointNode key={node.id} {...node} selected={(selection?.kind === 'node' && selection.id === node.id) || pendingMemberNodeId === node.id} onClick={() => onSelect({ kind: 'node', id: node.id })} />)}
    <CameraControls />
  </>;
}

export function Viewport(props: ViewportProps) {
  return <div className={`viewport mode-${props.mode}`}>
    <Canvas camera={{ position: [9, 8, 11], fov: 42 }} dpr={[1, 2]}><ModelScene {...props} /></Canvas>
    <div className="viewport-badge"><span className="dot" /> 3D MODEL · X / Y / Z (m)</div>
    {props.mode === 'member' && <div className="mode-hint">{props.pendingMemberNodeId ? 'Select the end node' : 'Select the start node'}</div>}
    {props.mode === 'node' && <div className="mode-hint">Click the grid to place a node</div>}
  </div>;
}

export type { ToolMode };
