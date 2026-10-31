import type { ForceVector, Vector3 } from '../model/types';

/** v2 adds verified PyNite Quad3D surface-shell data and results. */
export const SOLVER_INPUT_VERSION = 2 as const;
export const SOLVER_RESULT_VERSION = 2 as const;

export type SolverLoadDirection = 'FX' | 'FY' | 'FZ' | 'MX' | 'MY' | 'MZ' | 'Fx' | 'Fy' | 'Fz';

export interface SolverDiagnostic {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  path?: string;
}

export interface SolverNode { id: string; name: string; position: Vector3; }
export interface SolverMaterial { id: string; name: string; elasticModulus: number; shearModulus: number; poissonRatio: number; density: number; yieldStrength?: number; }
export interface SolverSection { id: string; name: string; area: number; iy: number; iz: number; torsionalConstant: number; }
export interface SolverMember { id: string; name: string; startNodeId: string; endNodeId: string; materialId: string; sectionId: string; rotationDegrees: number; releases: [boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean]; }
export interface SolverSupport { nodeId: string; restraints: [boolean, boolean, boolean, boolean, boolean, boolean]; }
export interface SolverNodalLoad { id: string; nodeId: string; caseId: string; values: ForceVector; }
export interface SolverMemberPointLoad { id: string; memberId: string; caseId: string; direction: SolverLoadDirection; magnitude: number; x: number; source: 'member-point'; }
export interface SolverMemberDistributedLoad { id: string; memberId: string; caseId: string; direction: Exclude<SolverLoadDirection, 'MX' | 'MY' | 'MZ'>; startMagnitude: number; endMagnitude: number; source: 'member-distributed' | 'self-weight'; }
export interface SolverLoadCase { id: string; name: string; }
export interface SolverLoadCombination { id: string; name: string; factors: Record<string, number>; kind: 'load-case' | 'combination'; }
export interface SolverSurfaceNode { id: string; position: Vector3; }
export interface SolverSurfaceElement { id: string; nodeIds: [string, string, string, string]; }
/** PyNite Quad3D has verified public support only for general quad4 shells. */
export interface SolverSurfaceMesh {
  id: string;
  name: string;
  sourceKind: 'slab' | 'wall';
  sourceId: string;
  materialId: string;
  thickness: number;
  nodes: SolverSurfaceNode[];
  elements: SolverSurfaceElement[];
}
/** Signed Pa scalar; positive follows the reported PyNite element local +Z axis. */
export interface SolverSurfacePressureLoad { id: string; surfaceMeshId: string; caseId: string; pressure: number; }

export interface SolverInput {
  version: typeof SOLVER_INPUT_VERSION;
  engine: { name: 'PyNiteFEA'; version: '3.2.1' };
  inputHash: string;
  projectId: string;
  projectRevision: string;
  coordinateConvention: 'right-handed-x-y-up-z';
  units: 'SI-m-N-Pa';
  nodeNameById: Record<string, string>;
  memberNameById: Record<string, string>;
  materialNameById: Record<string, string>;
  sectionNameById: Record<string, string>;
  /** meshId/nodeId keys resolve to existing or generated deterministic PyNite nodes. */
  surfaceNodeNameByRef: Record<string, string>;
  /** meshId/elementId keys resolve to deterministic PyNite Quad3D element names. */
  surfaceElementNameByRef: Record<string, string>;
  nodes: SolverNode[];
  materials: SolverMaterial[];
  sections: SolverSection[];
  members: SolverMember[];
  supports: SolverSupport[];
  loadCases: SolverLoadCase[];
  loadCombinations: SolverLoadCombination[];
  nodalLoads: SolverNodalLoad[];
  memberPointLoads: SolverMemberPointLoad[];
  memberDistributedLoads: SolverMemberDistributedLoad[];
  surfaceMeshes: SolverSurfaceMesh[];
  surfacePressureLoads: SolverSurfacePressureLoad[];
}

export interface NodalResult {
  nodeId: string;
  displacement: Vector3;
  rotation: Vector3;
  reaction: ForceVector;
}

export interface MemberDiagramSample {
  x: number;
  deflectionY: number;
  deflectionZ: number;
  axial: number;
  shearY: number;
  shearZ: number;
  momentY: number;
  momentZ: number;
}

export interface MemberResult { memberId: string; length: number; samples: MemberDiagramSample[]; }
export interface SurfaceNodeResult { nodeId: string; displacement: Vector3; rotation: Vector3; reaction: ForceVector; }
export interface SurfaceElementResult {
  elementId: string;
  /** Centre-point result in the verified PyNite Quad3D local element axes. */
  moments: { mx: number; my: number; mxy: number };
  shears: { qx: number; qy: number };
  /** Plane-stress components in Pa, not a design-stress check. */
  membraneStress: { sx: number; sy: number; txy: number };
  localAxes: { x: Vector3; y: Vector3; z: Vector3 };
}
export interface SurfaceMeshResult { meshId: string; nodeResults: SurfaceNodeResult[]; elementResults: SurfaceElementResult[]; }
export interface SolverCaseResult { id: string; name: string; kind: 'load-case' | 'combination'; nodalResults: NodalResult[]; memberResults: MemberResult[]; surfaceResults: SurfaceMeshResult[]; }

export interface SolverResult {
  version: typeof SOLVER_RESULT_VERSION;
  status: 'success' | 'rejected' | 'error' | 'timeout';
  experimental: true;
  engine: { name: 'PyNiteFEA'; version: string };
  inputHash: string;
  projectRevision: string;
  diagnostics: SolverDiagnostic[];
  cases: SolverCaseResult[];
}

export function rejectedSolverResult(inputHash: string, projectRevision: string, diagnostics: SolverDiagnostic[]): SolverResult {
  return { version: SOLVER_RESULT_VERSION, status: 'rejected', experimental: true, engine: { name: 'PyNiteFEA', version: '3.2.1' }, inputHash, projectRevision, diagnostics, cases: [] };
}
