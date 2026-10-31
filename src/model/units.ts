import type { UnitSystem } from './types';

export type Quantity = 'length' | 'area' | 'secondMoment' | 'force' | 'forcePerLength' | 'moment' | 'stress' | 'density';

interface UnitDefinition {
  label: string;
  /** SI value per displayed unit */
  siPerDisplay: number;
  decimals: number;
}

const DEFINITIONS: Record<UnitSystem, Record<Quantity, UnitDefinition>> = {
  metric: {
    length: { label: 'm', siPerDisplay: 1, decimals: 3 },
    area: { label: 'm²', siPerDisplay: 1, decimals: 5 },
    secondMoment: { label: 'm⁴', siPerDisplay: 1, decimals: 7 },
    force: { label: 'kN', siPerDisplay: 1000, decimals: 2 },
    forcePerLength: { label: 'kN/m', siPerDisplay: 1000, decimals: 2 },
    moment: { label: 'kN·m', siPerDisplay: 1000, decimals: 2 },
    stress: { label: 'MPa', siPerDisplay: 1e6, decimals: 1 },
    density: { label: 'kg/m³', siPerDisplay: 1, decimals: 1 },
  },
  imperial: {
    length: { label: 'ft', siPerDisplay: 0.3048, decimals: 3 },
    area: { label: 'ft²', siPerDisplay: 0.09290304, decimals: 5 },
    secondMoment: { label: 'ft⁴', siPerDisplay: 0.0086309748412416, decimals: 7 },
    force: { label: 'kip', siPerDisplay: 4448.2216152605, decimals: 2 },
    forcePerLength: { label: 'kip/ft', siPerDisplay: 14593.902937205, decimals: 2 },
    moment: { label: 'kip·ft', siPerDisplay: 1355.8179483314, decimals: 2 },
    stress: { label: 'ksi', siPerDisplay: 6.894757293168e6, decimals: 2 },
    density: { label: 'lb/ft³', siPerDisplay: 16.01846337396, decimals: 1 },
  },
};

export function unitLabel(system: UnitSystem, quantity: Quantity): string {
  return DEFINITIONS[system][quantity].label;
}

export function toDisplay(siValue: number, system: UnitSystem, quantity: Quantity): number {
  return siValue / DEFINITIONS[system][quantity].siPerDisplay;
}

export function fromDisplay(displayValue: number, system: UnitSystem, quantity: Quantity): number {
  return displayValue * DEFINITIONS[system][quantity].siPerDisplay;
}

export function formatUnit(siValue: number, system: UnitSystem, quantity: Quantity): string {
  const definition = DEFINITIONS[system][quantity];
  return `${toDisplay(siValue, system, quantity).toFixed(definition.decimals)} ${definition.label}`;
}
