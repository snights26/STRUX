/**
 * The application domain is deliberately independent of rendering and solver code.
 * All positions are stored in SI base units (metres, newtons, pascals, kg/m³).
 */
export const PROJECT_SCHEMA_VERSION = 4 as const;

/**
 * Canonical project coordinates. Every renderer and future solver adapter must
 * preserve this convention; the viewport maps these values directly to Three.js.
 */
export const COORDINATE_CONVENTION = {
  handedness: 'right-handed',
  x: 'global horizontal project axis',
  y: 'global vertical axis, positive upward',
  z: 'global horizontal project axis',
  loadComponents: 'global X, Y, Z force and moment components',
} as const;

export type Id = string;

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface ForceVector {
  fx: number;
  fy: number;
  fz: number;
  mx: number;
  my: number;
  mz: number;
}

export type UnitSystem = 'metric' | 'imperial';
export type ModelEntityKind = 'node' | 'member' | 'support' | 'nodalLoad' | 'memberPointLoad' | 'memberDistributedLoad' | 'selfWeightLoad' | 'surfacePressureLoad' | 'storey' | 'gridLine' | 'slab' | 'wall' | 'surfaceMesh' | 'diaphragm' | 'nodalSpring' | 'settlement' | 'rigidLink' | 'thermalLoad' | 'imposedDisplacement' | 'windLoad' | 'seismicLoad';
export type MemberType = 'beam' | 'column' | 'brace';
export type MaterialKind = 'steel' | 'concrete' | 'timber' | 'custom';
export type SectionShape = 'rectangular' | 'circular' | 'i-section' | 'custom';
export type SupportType = 'fixed' | 'pinned' | 'roller-x' | 'roller-z' | 'custom';
export type LoadCaseCategory = 'dead' | 'live' | 'wind' | 'seismic' | 'other';
export type GlobalLoadDirection = 'global-x' | 'global-y' | 'global-z';
export type MemberLoadDirection = GlobalLoadDirection | 'local-x' | 'local-y' | 'local-z';
export type DofVector = [boolean, boolean, boolean, boolean, boolean, boolean];
/** Translational values are metres and rotational values are radians. */
export interface KinematicVector { ux: number; uy: number; uz: number; rx: number; ry: number; rz: number; }
/** Translational spring stiffness is N/m; rotational stiffness is N·m/rad. */
export interface SpringStiffness { kx: number; ky: number; kz: number; krx: number; kry: number; krz: number; }

export interface Node {
  id: Id;
  name: string;
  position: Vector3;
  /** Reserved for coordinate-system and point-element use. */
  tags?: string[];
  /** Optional building organization only; coordinates remain the source of truth. */
  storeyId?: Id;
}

export interface Material {
  id: Id;
  name: string;
  kind: MaterialKind;
  elasticModulus: number;
  poissonRatio: number;
  density: number;
  yieldStrength?: number;
}

export interface Section {
  id: Id;
  name: string;
  shape: SectionShape;
  area: number;
  iy: number;
  iz: number;
  torsionalConstant: number;
  depth?: number;
  width?: number;
  /** Optional catalogue provenance. Geometry dimensions use SI metres; properties remain SI m²/m⁴. */
  catalogue?: SectionCatalogueMetadata;
}

export type SectionFamily = 'general' | 'rectangular' | 'circular' | 'i-section';

export interface SectionGeometry {
  /** Explicitly prevents mixing millimetre catalogue dimensions into SI model data. */
  units: 'SI-m';
  depth?: number;
  width?: number;
  flangeThickness?: number;
  webThickness?: number;
}

export interface SectionProvenance {
  source: string;
  edition?: string;
  reference?: string;
}

export interface SectionCatalogueMetadata {
  family: SectionFamily;
  designation: string;
  /** Area and second moments are always SI m² and m⁴. */
  propertyUnits: 'SI-m2-m4';
  geometry: SectionGeometry;
  provenance: SectionProvenance;
}

export interface Member {
  id: Id;
  name: string;
  type: MemberType;
  startNodeId: Id;
  endNodeId: Id;
  materialId: Id;
  sectionId: Id;
  /** Local axis roll in radians. Kept now for solver/IFC compatibility. */
  rollAngle: number;
  /** Released displacement/rotation DOFs at each end. These are input only until a solver supports them. */
  endReleases: MemberEndReleases;
  /** Building-model organization. Columns can span two named storeys. */
  storeyId?: Id;
  endStoreyId?: Id;
  /** Global SI vectors from analytical joint to physical member end. Solver use is not verified. */
  endOffsets?: MemberEndOffsets;
}

export interface MemberEndReleases {
  start: DofVector;
  end: DofVector;
}

export interface MemberEndOffsets {
  start: Vector3;
  end: Vector3;
  coordinateSystem: 'global';
}

export interface Support {
  id: Id;
  nodeId: Id;
  type: SupportType;
  restraints: DofVector;
}

export interface LoadCase {
  id: Id;
  name: string;
  category: LoadCaseCategory;
  isActive: boolean;
}

export interface LoadCombinationFactor {
  loadCaseId: Id;
  factor: number;
}

export interface LoadCombination {
  id: Id;
  name: string;
  factors: LoadCombinationFactor[];
}

export interface NodalLoad {
  id: Id;
  nodeId: Id;
  loadCaseId: Id;
  values: ForceVector;
  name?: string;
}

/** Point-force location is a normalized distance from the member start in [0, 1]. */
export interface MemberPointLoad {
  id: Id;
  memberId: Id;
  loadCaseId: Id;
  direction: MemberLoadDirection;
  magnitude: number;
  position: number;
  name?: string;
}

/** Intensities are stored in N/m at the member start and end respectively. */
export interface MemberDistributedLoad {
  id: Id;
  memberId: Id;
  loadCaseId: Id;
  direction: MemberLoadDirection;
  startMagnitude: number;
  endMagnitude: number;
  name?: string;
}

/** Mass-derived loading is declared only; no self-weight calculation occurs in Phase 1. */
export interface SelfWeightLoad {
  id: Id;
  loadCaseId: Id;
  direction: GlobalLoadDirection;
  factor: number;
  name?: string;
}

/**
 * Signed pressure in Pa applied by the verified PyNite Quad3D convention.
 * Positive acts in an element's local +Z direction. Local axes are reported
 * with every experimental result; no global-pressure conversion is implied.
 */
export interface SurfacePressureLoad {
  id: Id;
  name: string;
  surfaceMeshId: Id;
  loadCaseId: Id;
  pressure: number;
}

export interface ProjectSettings {
  unitSystem: UnitSystem;
  gridSpacing: number;
  gridExtents: number;
}

export type StoreyRole = 'ground' | 'typical' | 'roof';

export interface Storey {
  id: Id;
  name: string;
  elevation: number;
  height: number;
  role: StoreyRole;
}

export type GridAxis = 'x' | 'z';

/** A grid line is infinite in its own plan axis and positioned in the other. */
export interface BuildingGridLine {
  id: Id;
  axis: GridAxis;
  label: string;
  coordinate: number;
}

/** Plan geometry is represented by connected existing nodes, never inferred by the solver. */
export interface FloorOpening {
  id: Id;
  name: string;
  boundaryNodeIds: Id[];
}

/** A current quad4 mesh can be analysed experimentally; generated tri3 opening meshes remain authoring-only. */
export interface Slab {
  id: Id;
  name: string;
  storeyId: Id;
  boundaryNodeIds: Id[];
  thickness: number;
  materialId: Id;
  openings: FloorOpening[];
  /** Optional floor-to-diaphragm assignment. The referenced diaphragm owns this storey. */
  diaphragmId?: Id;
}

/** Wall-panel geometry. A current, validated quad4 mesh is eligible for experimental Quad3D analysis. */
export interface StructuralWall {
  id: Id;
  name: string;
  storeyId: Id;
  startNodeId: Id;
  endNodeId: Id;
  thickness: number;
  materialId: Id;
}

export interface MeshDensitySettings {
  /** Maximum target edge length in SI metres; refinement stops when all edges satisfy it. */
  targetElementSize: number;
  /** Quality threshold used for warnings; aspect ratio is longest edge divided by shortest altitude. */
  maxAspectRatio: number;
}

export type SurfaceMeshSourceKind = 'slab' | 'wall';
export type ShellElementType = 'tri3' | 'quad4';

/** Generated authoring mesh. Only validated quad4 meshes have an experimental PyNite Quad3D mapping. */
export interface SurfaceMeshNode { id: Id; position: Vector3; }
export interface SurfaceMeshElement { id: Id; type: ShellElementType; nodeIds: Id[]; }
export interface SurfaceMesh {
  id: Id;
  name: string;
  sourceKind: SurfaceMeshSourceKind;
  sourceId: Id;
  density: MeshDensitySettings;
  /** Detects source geometry edits that require explicit regeneration. */
  sourceSignature: string;
  nodes: SurfaceMeshNode[];
  elements: SurfaceMeshElement[];
}

export type DiaphragmType = 'rigid' | 'semi-rigid';
export interface Diaphragm {
  id: Id;
  name: string;
  storeyId: Id;
  type: DiaphragmType;
  nodeIds: Id[];
  /** Required for semi-rigid metadata only, in N/m. No stiffness formulation exists yet. */
  inPlaneStiffness?: number;
}

export interface NodalSpring { id: Id; name: string; nodeId: Id; stiffness: SpringStiffness; }
export interface SettlementDefinition { id: Id; name: string; nodeId: Id; loadCaseId: Id; values: KinematicVector; }
export interface RigidLink { id: Id; name: string; masterNodeId: Id; slaveNodeId: Id; restrainedDofs: DofVector; }

/** Input metadata only. Temperature is a delta in K (identical increment to °C); alpha is 1/K. */
export interface ThermalLoad { id: Id; name: string; memberId: Id; loadCaseId: Id; deltaTemperature: number; thermalExpansionCoefficient: number; }
export interface ImposedDisplacement { id: Id; name: string; nodeId: Id; loadCaseId: Id; values: KinematicVector; }
/** Pressure is Pa. This declaration intentionally generates no load effects. */
export interface WindLoadDefinition { id: Id; name: string; loadCaseId: Id; direction: GlobalLoadDirection; pressure: number; provenance?: string; }
/** Design acceleration is m/s². This declaration intentionally generates no load effects. */
export interface SeismicLoadDefinition { id: Id; name: string; loadCaseId: Id; direction: Extract<GlobalLoadDirection, 'global-x' | 'global-z'>; designAcceleration: number; importanceFactor: number; responseReductionFactor: number; provenance?: string; }

export interface BuildingModel {
  typicalStoreyHeight: number;
  storeys: Storey[];
  gridLines: BuildingGridLine[];
  slabs: Slab[];
  walls: StructuralWall[];
  surfaceMeshes: SurfaceMesh[];
  diaphragms: Diaphragm[];
}

export interface Project {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  id: Id;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  settings: ProjectSettings;
  nodes: Node[];
  members: Member[];
  materials: Material[];
  sections: Section[];
  supports: Support[];
  loadCases: LoadCase[];
  loadCombinations: LoadCombination[];
  nodalLoads: NodalLoad[];
  memberPointLoads: MemberPointLoad[];
  memberDistributedLoads: MemberDistributedLoad[];
  selfWeightLoads: SelfWeightLoad[];
  surfacePressureLoads: SurfacePressureLoad[];
  nodalSprings: NodalSpring[];
  settlements: SettlementDefinition[];
  rigidLinks: RigidLink[];
  thermalLoads: ThermalLoad[];
  imposedDisplacements: ImposedDisplacement[];
  windLoads: WindLoadDefinition[];
  seismicLoads: SeismicLoadDefinition[];
  building: BuildingModel;
  /** Future namespaces: plates, shells, elements, results, design, IFC. */
  extensions: Record<string, unknown>;
}

export interface ModelIssue {
  severity: 'error' | 'warning';
  path: string;
  message: string;
}

export interface Selection {
  kind: ModelEntityKind;
  id: Id;
}

export const RESTRAINTS: Record<Exclude<SupportType, 'custom'>, Support['restraints']> = {
  fixed: [true, true, true, true, true, true],
  pinned: [true, true, true, false, false, false],
  'roller-x': [false, true, true, false, false, false],
  'roller-z': [true, true, false, false, false, false],
};
