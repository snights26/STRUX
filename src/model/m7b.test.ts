import { describe, expect, it } from 'vitest';
import { importDxfAnalyticalGeometry, parseDxfAnalyticalGeometry } from '../import/dxf';
import { createProject } from './project';
import { historyReducer, type HistoryState } from './reducer';
import { parseProject, serializeProject } from './serialization';
import { checkMeshQuality, generateSlabMesh, generateWallMesh } from './mesh';
import { validateProject } from './validation';
import { SolverTranslationError, translateProject } from '../solver/translateProject';

const state = (): HistoryState => ({ project: createProject('M7B'), past: [], future: [] });
const roofNode = (id: string, x: number, z: number) => ({ id, name: id, storeyId: 'storey-roof', position: { x, y: 3, z } });
const errors = (project: ReturnType<typeof createProject>) => validateProject(project).filter((issue) => issue.severity === 'error');

function slabModel(): HistoryState {
  let current = state();
  current.project.nodes.push(roofNode('a', 0, 0), roofNode('b', 4, 0), roofNode('c', 4, 2), roofNode('d', 0, 2));
  current = historyReducer(current, { type: 'add-slab', storeyId: 'storey-roof', boundaryNodeIds: ['a', 'b', 'c', 'd'] });
  return current;
}

describe('M7B extended structural modeling inputs', () => {
  it('generates conforming slab and wall authoring meshes with density and stale-source checks', () => {
    let current = slabModel();
    const slab = current.project.building.slabs[0];
    const slabMesh = generateSlabMesh(current.project, slab.id, 'mesh-slab', { targetElementSize: 1, maxAspectRatio: 8 });
    expect(slabMesh.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    // The 4.47 m diagonal controls three uniform refinements: 2 × 4³ triangles.
    expect(slabMesh.mesh?.elements.length).toBe(128);
    expect(checkMeshQuality(slabMesh.mesh!).filter((item) => item.severity === 'error')).toEqual([]);
    current = historyReducer(current, { type: 'generate-slab-mesh', slabId: slab.id, density: { targetElementSize: 1, maxAspectRatio: 8 } });
    expect(current.project.building.surfaceMeshes).toHaveLength(1);
    current = historyReducer(current, { type: 'update-node', id: 'a', changes: { position: { x: -1, y: 3, z: 0 } } });
    expect(validateProject(current.project).some((issue) => issue.message.includes('Surface mesh is stale'))).toBe(true);

    let wallState = slabModel();
    wallState = historyReducer(wallState, { type: 'add-wall', storeyId: 'storey-roof', startNodeId: 'a', endNodeId: 'b' });
    const wallMesh = generateWallMesh(wallState.project, wallState.project.building.walls[0].id, 'mesh-wall', { targetElementSize: 1, maxAspectRatio: 8 });
    expect(wallMesh.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    expect(wallMesh.mesh?.elements).toHaveLength(12);
  });

  it('detects degenerate and disconnected mesh geometry and density limits', () => {
    const current = slabModel();
    const slab = current.project.building.slabs[0];
    const quality = checkMeshQuality({ id: 'bad', name: 'Bad', sourceKind: 'slab', sourceId: slab.id, sourceSignature: 'x', density: { targetElementSize: 1, maxAspectRatio: 2 }, nodes: [{ id: 'n1', position: { x: 0, y: 0, z: 0 } }, { id: 'n2', position: { x: 1, y: 0, z: 0 } }, { id: 'n3', position: { x: 2, y: 0, z: 0 } }, { id: 'n4', position: { x: 10, y: 0, z: 0 } }, { id: 'n5', position: { x: 11, y: 0, z: 0 } }, { id: 'n6', position: { x: 10, y: 0, z: 1 } }, { id: 'n7', position: { x: 0, y: 0, z: 1 } }], elements: [{ id: 'e1', type: 'tri3', nodeIds: ['n1', 'n2', 'n3'] }, { id: 'e2', type: 'tri3', nodeIds: ['n4', 'n5', 'n6'] }, { id: 'e3', type: 'tri3', nodeIds: ['n1', 'n2', 'n7'] }] });
    expect(quality.map((issue) => issue.code)).toContain('DEGENERATE_MESH_ELEMENT');
    expect(quality.map((issue) => issue.code)).toContain('DISCONNECTED_MESH');
    const slender = checkMeshQuality({ id: 'slender', name: 'Slender', sourceKind: 'slab', sourceId: slab.id, sourceSignature: 'x', density: { targetElementSize: 1, maxAspectRatio: 2 }, nodes: [{ id: 'a', position: { x: 0, y: 0, z: 0 } }, { id: 'b', position: { x: 10, y: 0, z: 0 } }, { id: 'c', position: { x: 0, y: 0, z: 0.1 } }], elements: [{ id: 'thin', type: 'tri3', nodeIds: ['a', 'b', 'c'] }] });
    expect(slender.map((issue) => issue.code)).toContain('HIGH_ASPECT_RATIO');
    const denseSource = slabModel();
    expect(generateSlabMesh(denseSource.project, denseSource.project.building.slabs[0].id, 'dense', { targetElementSize: 0.001, maxAspectRatio: 8 }).diagnostics.some((item) => item.code === 'MESH_DENSITY_EXCESSIVE')).toBe(true);
  });

  it('validates diaphragms, springs, settlements, offsets, rigid links and advanced loads', () => {
    let current = slabModel();
    current = historyReducer(current, { type: 'add-diaphragm', storeyId: 'storey-roof', nodeIds: ['a', 'b', 'c'], diaphragmType: 'semi-rigid' });
    const diaphragm = current.project.building.diaphragms[0];
    current = historyReducer(current, { type: 'update-slab', id: current.project.building.slabs[0].id, changes: { diaphragmId: diaphragm.id } });
    current = historyReducer(current, { type: 'add-member', startNodeId: 'a', endNodeId: 'b' });
    const member = current.project.members[0];
    current = historyReducer(current, { type: 'update-member', id: member.id, changes: { endOffsets: { coordinateSystem: 'global', start: { x: 0.05, y: 0, z: 0 }, end: { x: -0.05, y: 0, z: 0 } } } });
    current = historyReducer(current, { type: 'add-nodal-spring', nodeId: 'a' });
    current = historyReducer(current, { type: 'add-settlement', nodeId: 'a' });
    current = historyReducer(current, { type: 'add-rigid-link', masterNodeId: 'a', slaveNodeId: 'd' });
    current = historyReducer(current, { type: 'add-thermal-load', memberId: member.id });
    current = historyReducer(current, { type: 'add-imposed-displacement', nodeId: 'b' });
    current = historyReducer(current, { type: 'add-wind-load' });
    current = historyReducer(current, { type: 'add-seismic-load' });
    expect(errors(current.project)).toEqual([]);
    const invalid = structuredClone(current.project); invalid.nodalSprings[0].stiffness.ky = -1; invalid.rigidLinks[0].masterNodeId = invalid.rigidLinks[0].slaveNodeId;
    expect(validateProject(invalid).map((issue) => issue.message)).toEqual(expect.arrayContaining(['ky must be a finite non-negative stiffness.', 'Rigid-link master and slave nodes must differ.']));
  });

  it('validates explicit SI section catalogue geometry and provenance', () => {
    const project = createProject(); const section = project.sections[0];
    Object.assign(section, { shape: 'rectangular', area: 0.2, iy: 0.5 * 0.4 ** 3 / 12, iz: 0.4 * 0.5 ** 3 / 12, catalogue: { family: 'rectangular' as const, designation: 'R500x400', propertyUnits: 'SI-m2-m4' as const, geometry: { units: 'SI-m' as const, depth: 0.5, width: 0.4 }, provenance: { source: 'Academic fixture', reference: 'M7B test' } } });
    expect(errors(project)).toEqual([]);
    section.area = 0.1;
    expect(validateProject(project).some((issue) => issue.message.includes('Rectangular catalogue dimensions'))).toBe(true);
  });

  it('imports supported DXF LINE/POLYLINE plan geometry with units, mapping and duplicate diagnostics', () => {
    const dxf = `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n10\n0\n20\n0\n30\n0\n11\n1000\n21\n0\n31\n0\n0\nLINE\n10\n1000\n20\n0\n30\n0\n11\n0\n21\n0\n31\n0\n0\nLWPOLYLINE\n90\n3\n70\n1\n10\n0\n20\n0\n10\n1000\n20\n0\n10\n1000\n20\n1000\n0\nCIRCLE\n10\n0\n20\n0\n40\n100\n0\nENDSEC\n0\nEOF`;
    const geometry = parseDxfAnalyticalGeometry(dxf, { targetElevation: 3 });
    expect(geometry.units).toBe('millimetre');
    expect(geometry.segments).toHaveLength(3);
    expect(geometry.segments[0].end).toEqual({ x: 1, y: 3, z: 0 });
    expect(geometry.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining(['DUPLICATE_DXF_GEOMETRY', 'UNSUPPORTED_DXF_ENTITY']));
    const imported = importDxfAnalyticalGeometry(createProject(), dxf, { targetElevation: 3, storeyId: 'storey-roof' });
    expect(imported.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    expect(imported.addedMemberIds).toHaveLength(3);
    expect(errors(imported.project!)).toEqual([]);
    const classic = `0\nSECTION\n2\nENTITIES\n0\nPOLYLINE\n70\n0\n0\nVERTEX\n10\n0\n20\n0\n0\nVERTEX\n10\n1\n20\n0\n0\nSEQEND\n0\nENDSEC\n0\nEOF`;
    expect(parseDxfAnalyticalGeometry(classic).segments).toMatchObject([{ sourceEntity: 'POLYLINE', start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 } }]);
  });

  it('migrates schema-v3 M7A JSON and rejects every unsupported M7B solver input', () => {
    const raw = JSON.parse(serializeProject(createProject())); raw.schemaVersion = 3;
    delete raw.nodalSprings; delete raw.settlements; delete raw.rigidLinks; delete raw.thermalLoads; delete raw.imposedDisplacements; delete raw.windLoads; delete raw.seismicLoads; delete raw.building.surfaceMeshes; delete raw.building.diaphragms;
    const migrated = parseProject(JSON.stringify(raw));
    expect(migrated.errors).toEqual([]); expect(migrated.project?.schemaVersion).toBe(4); expect(migrated.project?.nodalSprings).toEqual([]);
    let advanced = slabModel(); const slab = advanced.project.building.slabs[0];
    advanced = historyReducer(advanced, { type: 'generate-slab-mesh', slabId: slab.id, density: { targetElementSize: 2, maxAspectRatio: 8 } });
    advanced = historyReducer(advanced, { type: 'add-diaphragm', storeyId: 'storey-roof', nodeIds: ['a', 'b', 'c'] });
    advanced = historyReducer(advanced, { type: 'add-member', startNodeId: 'a', endNodeId: 'b' });
    const member = advanced.project.members[0];
    advanced = historyReducer(advanced, { type: 'update-member', id: member.id, changes: { endOffsets: { coordinateSystem: 'global', start: { x: 0.1, y: 0, z: 0 }, end: { x: -0.1, y: 0, z: 0 } } } });
    advanced = historyReducer(advanced, { type: 'add-nodal-spring', nodeId: 'a' });
    advanced = historyReducer(advanced, { type: 'add-settlement', nodeId: 'a' });
    advanced = historyReducer(advanced, { type: 'add-rigid-link', masterNodeId: 'a', slaveNodeId: 'd' });
    advanced = historyReducer(advanced, { type: 'add-thermal-load', memberId: member.id });
    advanced = historyReducer(advanced, { type: 'add-imposed-displacement', nodeId: 'b' });
    advanced = historyReducer(advanced, { type: 'add-wind-load' });
    advanced = historyReducer(advanced, { type: 'add-seismic-load' });
    expect(errors(advanced.project)).toEqual([]);
    try { translateProject(advanced.project); throw new Error('Expected unsupported M7B input rejection.'); }
    catch (error) { expect(error).toBeInstanceOf(SolverTranslationError); expect((error as SolverTranslationError).diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining(['UNSUPPORTED_SURFACE_ELEMENT', 'UNSUPPORTED_DIAPHRAGM_CONSTRAINTS', 'UNSUPPORTED_FOUNDATION_INPUTS', 'UNSUPPORTED_RIGID_CONNECTIVITY', 'UNSUPPORTED_ADVANCED_LOADS'])); }
  });
});
