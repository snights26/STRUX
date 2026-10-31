import { MATERIAL_LIBRARY, SECTION_LIBRARY } from './library';
import { PROJECT_SCHEMA_VERSION, type Project } from './types';

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function createProject(name = 'Untitled Structure'): Project {
  const now = new Date().toISOString();
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: createId('project'),
    name,
    description: '',
    createdAt: now,
    updatedAt: now,
    settings: { unitSystem: 'metric', gridSpacing: 1, gridExtents: 20 },
    nodes: [],
    members: [],
    materials: structuredClone(MATERIAL_LIBRARY),
    sections: structuredClone(SECTION_LIBRARY),
    supports: [],
    loadCases: [{ id: 'lc-dead', name: 'Dead Load', category: 'dead', isActive: true }],
    loadCombinations: [],
    nodalLoads: [],
    memberPointLoads: [],
    memberDistributedLoads: [],
    selfWeightLoads: [],
    extensions: {},
  };
}

export function withTimestamp(project: Project): Project {
  return { ...project, updatedAt: new Date().toISOString() };
}
