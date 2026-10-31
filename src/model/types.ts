/**
 * The application domain is deliberately independent of rendering and solver code.
 * All positions are stored in SI base units (metres, newtons, pascals, kg/m³).
 */
export const PROJECT_SCHEMA_VERSION = 2 as const;

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
export type ModelEntityKind = 'node' | 'member' | 'support' | 'nodalLoad' | 'memberPointLoad' | 'memberDistributedLoad' | 'selfWeightLoad';
export type MemberType = 'beam' | 'column' | 'brace';
export type MaterialKind = 'steel' | 'concrete' | 'timber' | 'custom';
export type SectionShape = 'rectangular' | 'circular' | 'i-section' | 'custom';
export type SupportType = 'fixed' | 'pinned' | 'roller-x' | 'roller-z' | 'custom';
export type LoadCaseCategory = 'dead' | 'live' | 'wind' | 'seismic' | 'other';
export type GlobalLoadDirection = 'global-x' | 'global-y' | 'global-z';
export type MemberLoadDirection = GlobalLoadDirection | 'local-x' | 'local-y' | 'local-z';
export type DofVector = [boolean, boolean, boolean, boolean, boolean, boolean];

export interface Node {
  id: Id;
  name: string;
  position: Vector3;
  /** Reserved for coordinate-system and point-element use. */
  tags?: string[];
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
}

export interface MemberEndReleases {
  start: DofVector;
  end: DofVector;
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

export interface ProjectSettings {
  unitSystem: UnitSystem;
  gridSpacing: number;
  gridExtents: number;
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
