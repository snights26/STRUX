import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { BufferGeometry, CanvasTexture, Line as ThreeLine, LineBasicMaterial, Sprite, SpriteMaterial, Vector3 as ThreeVector3 } from 'three';
import { OrbitControls as NativeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useEffect, useMemo, useState } from 'react';
import { calculateMemberLocalAxes } from '../model/coordinates';
import { cameraOrientationFor, modelingViewForCamera, pointOnWorkingPlane, workingPlaneCoordinateLabel, workingPlaneVisual, type CameraPreset, type ModelingView, type WorkingPlane } from './modelingPlane';
import { fromDisplay, toDisplay, unitLabel } from '../model/units';
import type { Project, Selection, UnitSystem, Vector3 } from '../model/types';
import type { SolverCaseResult } from '../solver/contracts';

type ToolMode = 'select' | 'node' | 'member' | 'support' | 'load';

export const CAMERA_PRESETS: { id: CameraPreset; label: string }[] = [
  { id: 'isometric', label: 'ISO' }, { id: 'top', label: 'TOP' }, { id: 'front', label: 'FRONT' }, { id: 'side', label: 'SIDE' },
];

interface ViewportProps {
  project: Project;
  selection: Selection | null;
  selectedNodeIds: string[];
  selectedMemberIds: string[];
  visibleStoreyIds: string[];
  activeStoreyId?: string;
  mode: ToolMode;
  pendingMemberNodeId: string | null;
  cameraPreset: CameraPreset;
  onCameraPreset: (preset: CameraPreset) => void;
  onSelect: (selection: Selection, additive?: boolean) => void;
  onGroundHit: (position: Vector3, plane: WorkingPlane) => void;
  workingPlaneOffsets: Record<ModelingView, number>;
  onWorkingPlaneOffset: (view: ModelingView, offset: number) => void;
  unitSystem: UnitSystem;
  analysisCase?: SolverCaseResult;
}

function CameraControls({ preset, plane }: { preset: CameraPreset; plane: WorkingPlane }) {
  const { camera, gl } = useThree();
  const controls = useMemo(() => new NativeOrbitControls(camera, gl.domElement), [camera, gl]);
  useEffect(() => {
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI / 2.02;
    return () => controls.dispose();
  }, [controls]);
  useEffect(() => {
    const orientation = cameraOrientationFor(preset, plane);
    camera.position.set(...orientation.position); camera.up.set(...orientation.up); controls.target.set(...orientation.target); controls.update();
  }, [camera, controls, plane, preset]);
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

function ExperimentalResultOverlay({ project, result }: { project: Project; result: SolverCaseResult }) {
  const nodeResults = new Map(result.nodalResults.map((node) => [node.nodeId, node]));
  const surfaceResults = new Map(result.surfaceResults.map((mesh) => [mesh.meshId, new Map(mesh.nodeResults.map((node) => [node.nodeId, node]))]));
  const displacements = [...result.nodalResults, ...result.surfaceResults.flatMap((mesh) => mesh.nodeResults)];
  const maximumDisplacement = Math.max(1e-12, ...displacements.map((node) => Math.hypot(node.displacement.x, node.displacement.y, node.displacement.z)));
  const positions = [...project.nodes.map((node) => node.position), ...project.building.surfaceMeshes.flatMap((mesh) => mesh.nodes.map((node) => node.position))];
  const extents = positions.length > 1 ? Math.max(...positions.map((node) => Math.hypot(node.x, node.y, node.z)), 1) : 1;
  const deformationScale = Math.min(1_000, Math.max(1, extents * 0.12 / maximumDisplacement));
  const maximumReaction = Math.max(1e-12, ...result.nodalResults.map((node) => Math.hypot(node.reaction.fx, node.reaction.fy, node.reaction.fz)));
  return <group>
    {project.members.map((member) => {
      const start = project.nodes.find((node) => node.id === member.startNodeId); const end = project.nodes.find((node) => node.id === member.endNodeId);
      const startResult = nodeResults.get(member.startNodeId); const endResult = nodeResults.get(member.endNodeId);
      if (!start || !end || !startResult || !endResult) return null;
      return <ModelLine key={`deformed-${member.id}`} color="#ee79c2" points={[[start.position.x + startResult.displacement.x * deformationScale, start.position.y + startResult.displacement.y * deformationScale, start.position.z + startResult.displacement.z * deformationScale], [end.position.x + endResult.displacement.x * deformationScale, end.position.y + endResult.displacement.y * deformationScale, end.position.z + endResult.displacement.z * deformationScale]]} />;
    })}
    {project.nodes.map((node) => { const nodeResult = nodeResults.get(node.id); if (!nodeResult) return null; return <mesh key={`deformed-node-${node.id}`} position={[node.position.x + nodeResult.displacement.x * deformationScale, node.position.y + nodeResult.displacement.y * deformationScale, node.position.z + nodeResult.displacement.z * deformationScale]}><sphereGeometry args={[0.07, 12, 12]} /><meshStandardMaterial color="#ee79c2" emissive="#671d58" /></mesh>; })}
    {project.nodes.map((node) => { const nodeResult = nodeResults.get(node.id); if (!nodeResult) return null; const force = nodeResult.reaction; const magnitude = Math.hypot(force.fx, force.fy, force.fz); if (magnitude <= 1e-9) return null; const scale = Math.min(1.5, magnitude / maximumReaction * 0.9); return <ModelLine key={`reaction-${node.id}`} color="#ffbd55" points={[[node.position.x, node.position.y, node.position.z], [node.position.x + force.fx / magnitude * scale, node.position.y + force.fy / magnitude * scale, node.position.z + force.fz / magnitude * scale]]} />; })}
    {project.building.surfaceMeshes.map((mesh) => {
      const resultNodes = surfaceResults.get(mesh.id); if (!resultNodes) return null;
      const nodes = new Map(mesh.nodes.map((node) => [node.id, node]));
      return <group key={`deformed-surface-${mesh.id}`}>{mesh.elements.map((element) => {
        const positions = element.nodeIds.map((id) => nodes.get(id)); const values = element.nodeIds.map((id) => resultNodes.get(id));
        if (positions.some((node) => !node) || values.some((node) => !node)) return null;
        const points = positions.map((node, index) => [node!.position.x + values[index]!.displacement.x * deformationScale, node!.position.y + values[index]!.displacement.y * deformationScale, node!.position.z + values[index]!.displacement.z * deformationScale] as [number, number, number]);
        return <ModelLine key={`deformed-${element.id}`} color="#ee79c2" points={[...points, points[0]]} />;
      })}</group>;
    })}
  </group>;
}

function BuildingGeometry({ project, visibleStoreyIds, selection, onSelect, showLabels }: Pick<ViewportProps, 'project' | 'visibleStoreyIds' | 'selection' | 'onSelect'> & { showLabels: boolean }) {
  const nodes = useMemo(() => new Map(project.nodes.map((node) => [node.id, node])), [project.nodes]);
  const storeys = project.building.storeys.filter((storey) => visibleStoreyIds.includes(storey.id));
  const xLines = project.building.gridLines.filter((line) => line.axis === 'x');
  const zLines = project.building.gridLines.filter((line) => line.axis === 'z');
  const xCoordinates = xLines.map((line) => line.coordinate); const zCoordinates = zLines.map((line) => line.coordinate);
  const extent = project.settings.gridExtents;
  const minX = Math.min(-extent, ...xCoordinates) - 1; const maxX = Math.max(extent, ...xCoordinates) + 1;
  const minZ = Math.min(-extent, ...zCoordinates) - 1; const maxZ = Math.max(extent, ...zCoordinates) + 1;
  return <group>
    {storeys.flatMap((storey) => [
      ...xLines.map((line) => <group key={`${storey.id}-${line.id}`}><ModelLine points={[[line.coordinate, storey.elevation, minZ], [line.coordinate, storey.elevation, maxZ]]} color="#41627c" />{showLabels && <NodeLabel text={line.label} position={{ x: line.coordinate, y: storey.elevation, z: minZ }} />}</group>),
      ...zLines.map((line) => <group key={`${storey.id}-${line.id}`}><ModelLine points={[[minX, storey.elevation, line.coordinate], [maxX, storey.elevation, line.coordinate]]} color="#41627c" />{showLabels && <NodeLabel text={line.label} position={{ x: minX, y: storey.elevation, z: line.coordinate }} />}</group>),
    ])}
    {project.building.slabs.filter((slab) => visibleStoreyIds.includes(slab.storeyId)).map((slab) => {
      const boundary = slab.boundaryNodeIds.map((id) => nodes.get(id)).filter(Boolean); if (boundary.length !== slab.boundaryNodeIds.length) return null;
      const active = selection?.kind === 'slab' && selection.id === slab.id;
      const points = [...boundary, boundary[0]].map((node) => [node!.position.x, node!.position.y + 0.015, node!.position.z] as [number, number, number]);
      return <group key={slab.id}><ModelLine points={points} color={active ? '#ffbf4a' : '#9b7ae5'} onClick={(event) => { event.stopPropagation(); onSelect({ kind: 'slab', id: slab.id }); }} />{slab.openings.map((opening) => { const openingNodes = opening.boundaryNodeIds.map((id) => nodes.get(id)).filter(Boolean); if (openingNodes.length !== opening.boundaryNodeIds.length) return null; return <ModelLine key={opening.id} points={[...openingNodes, openingNodes[0]].map((node) => [node!.position.x, node!.position.y + 0.02, node!.position.z] as [number, number, number])} color="#d67adb" />; })}</group>;
    })}
    {project.building.walls.filter((wall) => visibleStoreyIds.includes(wall.storeyId)).map((wall) => {
      const start = nodes.get(wall.startNodeId); const end = nodes.get(wall.endNodeId); const storey = project.building.storeys.find((item) => item.id === wall.storeyId); if (!start || !end || !storey) return null;
      const active = selection?.kind === 'wall' && selection.id === wall.id; const color = active ? '#ffbf4a' : '#d58b6e'; const top = storey.elevation + storey.height;
      return <group key={wall.id}><ModelLine points={[[start.position.x, start.position.y, start.position.z], [end.position.x, end.position.y, end.position.z]]} color={color} onClick={(event) => { event.stopPropagation(); onSelect({ kind: 'wall', id: wall.id }); }} /><ModelLine points={[[start.position.x, top, start.position.z], [end.position.x, top, end.position.z]]} color={color} /><ModelLine points={[[start.position.x, start.position.y, start.position.z], [start.position.x, top, start.position.z]]} color={color} /><ModelLine points={[[end.position.x, end.position.y, end.position.z], [end.position.x, top, end.position.z]]} color={color} /></group>;
    })}
    {project.building.surfaceMeshes.filter((mesh) => {
      const storeyId = mesh.sourceKind === 'slab' ? project.building.slabs.find((slab) => slab.id === mesh.sourceId)?.storeyId : project.building.walls.find((wall) => wall.id === mesh.sourceId)?.storeyId;
      return !storeyId || visibleStoreyIds.includes(storeyId);
    }).map((mesh) => {
      const meshNodes = new Map(mesh.nodes.map((node) => [node.id, node])); const active = selection?.kind === 'surfaceMesh' && selection.id === mesh.id; const color = active ? '#ffbf4a' : '#54d9d0';
      return <group key={mesh.id}>{mesh.elements.map((element, index) => { const elementNodes = element.nodeIds.map((id) => meshNodes.get(id)); if (elementNodes.some((node) => !node)) return null; const points = [...elementNodes, elementNodes[0]].map((node) => [node!.position.x, node!.position.y + 0.025, node!.position.z] as [number, number, number]); return <ModelLine key={element.id} points={points} color={color} onClick={index === 0 ? (event) => { event.stopPropagation(); onSelect({ kind: 'surfaceMesh', id: mesh.id }); } : undefined} />; })}</group>;
    })}
  </group>;
}

function ModelScene({ project, selection, selectedNodeIds, selectedMemberIds, visibleStoreyIds, pendingMemberNodeId, onSelect, onGroundHit, cameraPreset, workingPlaneOffsets, showLabels, analysisCase }: ViewportProps & { showLabels: boolean }) {
  const nodeMap = useMemo(() => new Map(project.nodes.map((node) => [node.id, node])), [project.nodes]);
  const gridDivisions = Math.max(1, Math.round((project.settings.gridExtents * 2) / project.settings.gridSpacing));
  const workingView = modelingViewForCamera(cameraPreset);
  const workingPlane = useMemo<WorkingPlane>(() => ({ view: workingView, offset: workingPlaneOffsets[workingView] }), [workingPlaneOffsets, workingView]);
  const planeVisual = useMemo(() => workingPlaneVisual(workingPlane), [workingPlane]);
  const groundClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onGroundHit(pointOnWorkingPlane({ x: event.point.x, y: event.point.y, z: event.point.z }, workingPlane), workingPlane);
  };
  return <>
    <color attach="background" args={['#111824']} /><ambientLight intensity={1.1} /><directionalLight position={[8, 12, 6]} intensity={1.4} />
    <gridHelper args={[project.settings.gridExtents * 2, gridDivisions, '#45627f', '#2b3d55']} position={planeVisual.gridPosition} rotation={planeVisual.gridRotation} /><axesHelper args={[2]} />
    <mesh position={planeVisual.pickerPosition} rotation={planeVisual.pickerRotation} onClick={groundClick}><planeGeometry args={[project.settings.gridExtents * 2, project.settings.gridExtents * 2]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    <BuildingGeometry project={project} visibleStoreyIds={visibleStoreyIds} selection={selection} onSelect={onSelect} showLabels={showLabels} />
    {project.members.map((member) => {
      const start = nodeMap.get(member.startNodeId); const end = nodeMap.get(member.endNodeId); if (!start || !end) return null;
      if ((member.storeyId || member.endStoreyId) && !visibleStoreyIds.includes(member.storeyId ?? '') && !visibleStoreyIds.includes(member.endStoreyId ?? '')) return null;
      const active = selectedMemberIds.includes(member.id);
      return <group key={member.id}><ModelLine points={[[start.position.x, start.position.y, start.position.z], [end.position.x, end.position.y, end.position.z]]} color={active ? '#ffbf4a' : '#77b8ff'} onClick={(event) => { event.stopPropagation(); onSelect({ kind: 'member', id: member.id }, event.shiftKey); }} />{active && <MemberAxesGlyph start={start.position} end={end.position} rollAngle={member.rollAngle} />}</group>;
    })}
    {project.supports.map((support) => { const node = nodeMap.get(support.nodeId); if (!node || (node.storeyId && !visibleStoreyIds.includes(node.storeyId))) return null; const active = selection?.kind === 'support' && selection.id === support.id; return <mesh key={support.id} position={[node.position.x, node.position.y - 0.2, node.position.z]} onClick={(event) => { event.stopPropagation(); onSelect({ kind: 'support', id: support.id }); }}><coneGeometry args={[0.18, 0.28, 4]} /><meshStandardMaterial color={active ? '#ffbf4a' : '#72dcc6'} /></mesh>; })}
    {project.nodalLoads.map((load) => { const node = nodeMap.get(load.nodeId); if (!node || (node.storeyId && !visibleStoreyIds.includes(node.storeyId))) return null; const active = selection?.kind === 'nodalLoad' && selection.id === load.id; const color = active ? '#ffbf4a' : '#e77f8f'; return <group key={load.id} position={[node.position.x, node.position.y + 0.52, node.position.z]} onClick={(event) => { event.stopPropagation(); onSelect({ kind: 'nodalLoad', id: load.id }); }}><ModelLine points={[[0, 0.35, 0], [0, -0.28, 0]]} color={color} /><mesh position={[0, -0.32, 0]}><coneGeometry args={[0.1, 0.2, 12]} /><meshStandardMaterial color={color} /></mesh></group>; })}
    {project.nodes.filter((node) => !node.storeyId || visibleStoreyIds.includes(node.storeyId)).map((node) => <group key={node.id}><PointNode {...node} selected={selectedNodeIds.includes(node.id) || pendingMemberNodeId === node.id} onClick={(additive) => onSelect({ kind: 'node', id: node.id }, additive)} />{showLabels && <NodeLabel text={node.name} position={node.position} />}</group>)}
    {analysisCase && <ExperimentalResultOverlay project={project} result={analysisCase} />}
    <CameraControls preset={cameraPreset} plane={workingPlane} />
  </>;
}

export function Viewport(props: ViewportProps) {
  const [showLabels, setShowLabels] = useState(true);
  const workingView = modelingViewForCamera(props.cameraPreset);
  const workingPlane = { view: workingView, offset: props.workingPlaneOffsets[workingView] } satisfies WorkingPlane;
  const planeVisual = workingPlaneVisual(workingPlane);
  const displayedOffset = toDisplay(workingPlane.offset, props.unitSystem, 'length');
  const setOffset = (raw: string) => {
    const value = Number(raw);
    if (Number.isFinite(value)) props.onWorkingPlaneOffset(workingView, fromDisplay(value, props.unitSystem, 'length'));
  };
  return <div className={`viewport mode-${props.mode}`}>
    <Canvas camera={{ position: [9, 8, 11], fov: 42 }} dpr={[1, 2]}><ModelScene {...props} showLabels={showLabels} /></Canvas>
    <div className="viewport-badge"><span className="dot" /> {props.analysisCase ? 'EXPERIMENTAL RESULTS · magenta deformation · amber reactions' : '3D MODEL · X / Y / Z (m)'}</div>
    <div className="view-controls"><span>VIEW</span>{CAMERA_PRESETS.map((preset) => <button key={preset.id} className={props.cameraPreset === preset.id ? 'active' : ''} onClick={() => props.onCameraPreset(preset.id)}>{preset.label}</button>)}<button className={showLabels ? 'active' : ''} onClick={() => setShowLabels((value) => !value)}>LABELS</button></div>
    <div className="working-plane-indicator"><strong>{props.cameraPreset === 'isometric' ? 'ISO · ' : ''}{planeVisual.label} WORKING PLANE</strong><span>{planeVisual.coordinateAxes} grid · global {planeVisual.offsetAxis} =</span><input aria-label={`${planeVisual.label} working-plane ${planeVisual.offsetAxis} offset`} type="number" step="0.1" value={displayedOffset} onChange={(event) => setOffset(event.target.value)} /><em>{unitLabel(props.unitSystem, 'length')}</em><small>{workingPlaneCoordinateLabel(workingPlane)}</small></div>
    {props.mode === 'member' && <div className="mode-hint">{props.pendingMemberNodeId ? 'Select the end node' : 'Select the start node'}</div>}
    {props.mode === 'node' && <div className="mode-hint">Click the {planeVisual.label.toLowerCase()} grid to place a grid-snapped node on {workingPlaneCoordinateLabel(workingPlane)}, or enter exact coordinates below</div>}
  </div>;
}

export type { CameraPreset, ToolMode };
