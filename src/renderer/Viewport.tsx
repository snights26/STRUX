import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { BufferGeometry, CanvasTexture, Line as ThreeLine, LineBasicMaterial, Sprite, SpriteMaterial, Vector3 as ThreeVector3 } from 'three';
import { OrbitControls as NativeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useEffect, useMemo, useState } from 'react';
import { calculateMemberLocalAxes } from '../model/coordinates';
import type { Project, Selection, Vector3 } from '../model/types';

type ToolMode = 'select' | 'node' | 'member' | 'support' | 'load';
export type CameraPreset = 'isometric' | 'top' | 'front' | 'right';

export const CAMERA_PRESETS: { id: CameraPreset; label: string }[] = [
  { id: 'isometric', label: 'ISO' }, { id: 'top', label: 'TOP' }, { id: 'front', label: 'FRONT' }, { id: 'right', label: 'RIGHT' },
];

interface ViewportProps {
  project: Project;
  selection: Selection | null;
  selectedNodeIds: string[];
  mode: ToolMode;
  pendingMemberNodeId: string | null;
  cameraPreset: CameraPreset;
  onCameraPreset: (preset: CameraPreset) => void;
  onSelect: (selection: Selection, additive?: boolean) => void;
  onGroundHit: (position: Vector3) => void;
}

function CameraControls({ preset }: { preset: CameraPreset }) {
  const { camera, gl } = useThree();
  const controls = useMemo(() => new NativeOrbitControls(camera, gl.domElement), [camera, gl]);
  useEffect(() => {
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI / 2.02;
    return () => controls.dispose();
  }, [controls]);
  useEffect(() => {
    const positions: Record<CameraPreset, [number, number, number]> = {
      isometric: [9, 8, 11], top: [0, 20, 0.001], front: [0, 5, 20], right: [20, 5, 0.001],
    };
    camera.position.set(...positions[preset]); controls.target.set(0, 0, 0); controls.update();
  }, [camera, controls, preset]);
  useFrame(() => controls.update());
  return null;
}

function ModelLine({ points, color, onClick }: { points: [number, number, number][]; color: string; onClick?: (event: ThreeEvent<MouseEvent>) => void }) {
  const geometry = useMemo(() => {
    const next = new BufferGeometry(); next.setFromPoints(points.map(([x, y, z]) => new ThreeVector3(x, y, z))); return next;
  }, [points]);
  const material = useMemo(() => new LineBasicMaterial({ color }), [color]);
  const line = useMemo(() => new ThreeLine(geometry, material), [geometry, material]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  return <primitive object={line} onClick={onClick} />;
}

function NodeLabel({ text, position }: { text: string; position: Vector3 }) {
  const label = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create node label canvas.');
    context.fillStyle = 'rgba(12, 22, 35, 0.82)'; context.fillRect(4, 4, 248, 56);
    context.font = '600 54px Segoe UI, sans-serif'; context.fillStyle = '#e4f3ff'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, 128, 32);
    const texture = new CanvasTexture(canvas); const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
    const sprite = new Sprite(material); sprite.scale.set(1.4, 0.35, 1);
    return { sprite, texture, material };
  }, [text]);
  useEffect(() => () => { label.texture.dispose(); label.material.dispose(); }, [label]);
  return <primitive object={label.sprite} position={[position.x, position.y + 0.25, position.z]} />;
}

function PointNode({ name, position, selected, onClick }: { name: string; position: Vector3; selected: boolean; onClick: (additive: boolean) => void }) {
  return <group position={[position.x, position.y, position.z]} name={name}>
    <mesh onClick={(event) => { event.stopPropagation(); onClick(event.shiftKey); }}>
      <sphereGeometry args={[selected ? 0.13 : 0.09, 16, 16]} />
      <meshStandardMaterial color={selected ? '#ffbf4a' : '#dce8f8'} emissive={selected ? '#7a4d00' : '#101827'} />
    </mesh>
  </group>;
}

function MemberAxesGlyph({ start, end, rollAngle }: { start: Vector3; end: Vector3; rollAngle: number }) {
  const axes = calculateMemberLocalAxes(start, end, rollAngle);
  const origin: [number, number, number] = [(start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2];
  const scale = Math.min(1.2, Math.max(0.32, Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z) * 0.14));
  const endpoint = (axis: Vector3): [number, number, number] => [origin[0] + axis.x * scale, origin[1] + axis.y * scale, origin[2] + axis.z * scale];
  return <group><ModelLine points={[origin, endpoint(axes.x)]} color="#ef6678" /><ModelLine points={[origin, endpoint(axes.y)]} color="#70dc92" /><ModelLine points={[origin, endpoint(axes.z)]} color="#70b7ff" /></group>;
}

function ModelScene({ project, selection, selectedNodeIds, pendingMemberNodeId, onSelect, onGroundHit, cameraPreset, showLabels }: ViewportProps & { showLabels: boolean }) {
  const nodeMap = useMemo(() => new Map(project.nodes.map((node) => [node.id, node])), [project.nodes]);
  const gridDivisions = Math.max(1, Math.round((project.settings.gridExtents * 2) / project.settings.gridSpacing));
  const groundClick = (event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); onGroundHit({ x: Math.round(event.point.x * 100) / 100, y: 0, z: Math.round(event.point.z * 100) / 100 }); };
  return <>
    <color attach="background" args={['#111824']} /><ambientLight intensity={1.1} /><directionalLight position={[8, 12, 6]} intensity={1.4} />
    <gridHelper args={[project.settings.gridExtents * 2, gridDivisions, '#45627f', '#2b3d55']} position={[0, -0.012, 0]} /><axesHelper args={[2]} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} onPointerDown={groundClick}><planeGeometry args={[project.settings.gridExtents * 2, project.settings.gridExtents * 2]} /><meshBasicMaterial transparent opacity={0} /></mesh>
    {project.members.map((member) => {
      const start = nodeMap.get(member.startNodeId); const end = nodeMap.get(member.endNodeId); if (!start || !end) return null;
      const active = selection?.kind === 'member' && selection.id === member.id;
      return <group key={member.id}><ModelLine points={[[start.position.x, start.position.y, start.position.z], [end.position.x, end.position.y, end.position.z]]} color={active ? '#ffbf4a' : '#77b8ff'} onClick={(event) => { event.stopPropagation(); onSelect({ kind: 'member', id: member.id }); }} />{active && <MemberAxesGlyph start={start.position} end={end.position} rollAngle={member.rollAngle} />}</group>;
    })}
    {project.supports.map((support) => { const node = nodeMap.get(support.nodeId); if (!node) return null; const active = selection?.kind === 'support' && selection.id === support.id; return <mesh key={support.id} position={[node.position.x, node.position.y - 0.2, node.position.z]} onClick={(event) => { event.stopPropagation(); onSelect({ kind: 'support', id: support.id }); }}><coneGeometry args={[0.18, 0.28, 4]} /><meshStandardMaterial color={active ? '#ffbf4a' : '#72dcc6'} /></mesh>; })}
    {project.nodalLoads.map((load) => { const node = nodeMap.get(load.nodeId); if (!node) return null; const active = selection?.kind === 'nodalLoad' && selection.id === load.id; const color = active ? '#ffbf4a' : '#e77f8f'; return <group key={load.id} position={[node.position.x, node.position.y + 0.52, node.position.z]} onClick={(event) => { event.stopPropagation(); onSelect({ kind: 'nodalLoad', id: load.id }); }}><ModelLine points={[[0, 0.35, 0], [0, -0.28, 0]]} color={color} /><mesh position={[0, -0.32, 0]}><coneGeometry args={[0.1, 0.2, 12]} /><meshStandardMaterial color={color} /></mesh></group>; })}
    {project.nodes.map((node) => <group key={node.id}><PointNode {...node} selected={selectedNodeIds.includes(node.id) || pendingMemberNodeId === node.id} onClick={(additive) => onSelect({ kind: 'node', id: node.id }, additive)} />{showLabels && <NodeLabel text={node.name} position={node.position} />}</group>)}
    <CameraControls preset={cameraPreset} />
  </>;
}

export function Viewport(props: ViewportProps) {
  const [showLabels, setShowLabels] = useState(true);
  return <div className={`viewport mode-${props.mode}`}>
    <Canvas camera={{ position: [9, 8, 11], fov: 42 }} dpr={[1, 2]}><ModelScene {...props} showLabels={showLabels} /></Canvas>
    <div className="viewport-badge"><span className="dot" /> 3D MODEL · X / Y / Z (m)</div>
    <div className="view-controls"><span>VIEW</span>{CAMERA_PRESETS.map((preset) => <button key={preset.id} className={props.cameraPreset === preset.id ? 'active' : ''} onClick={() => props.onCameraPreset(preset.id)}>{preset.label}</button>)}<button className={showLabels ? 'active' : ''} onClick={() => setShowLabels((value) => !value)}>LABELS</button></div>
    {props.mode === 'member' && <div className="mode-hint">{props.pendingMemberNodeId ? 'Select the end node' : 'Select the start node'}</div>}
    {props.mode === 'node' && <div className="mode-hint">Click the grid to place a grid-snapped node, or enter exact coordinates below</div>}
  </div>;
}

export type { ToolMode };
