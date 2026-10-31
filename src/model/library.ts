import type { Material, Section } from './types';

export const MATERIAL_LIBRARY: Material[] = [
  { id: 'mat-steel-s355', name: 'Steel S355', kind: 'steel', elasticModulus: 200e9, poissonRatio: 0.3, density: 7850, yieldStrength: 355e6 },
  { id: 'mat-concrete-m30', name: 'Concrete M30', kind: 'concrete', elasticModulus: 27.4e9, poissonRatio: 0.2, density: 2500 },
];

export const SECTION_LIBRARY: Section[] = [
  { id: 'sec-rect-300x500', name: 'RC 300 × 500', shape: 'rectangular', area: 0.15, iy: 0.003125, iz: 0.01125, torsionalConstant: 0.002816, depth: 0.5, width: 0.3 },
  { id: 'sec-rect-300x300', name: 'RC 300 × 300', shape: 'rectangular', area: 0.09, iy: 0.000675, iz: 0.000675, torsionalConstant: 0.00114, depth: 0.3, width: 0.3 },
  { id: 'sec-i-254x146', name: 'UB 254 × 146', shape: 'i-section', area: 0.00548, iy: 0.000088, iz: 0.00000635, torsionalConstant: 0.000000127, depth: 0.254, width: 0.146 },
];
