import type { UnitSystem } from './types';

export type Quantity = 'length' | 'force' | 'moment' | 'stress';

interface UnitDefinition {
  label: string;
  /** SI value per displayed unit */
  siPerDisplay: number;
  decimals: number;
}

const DEFINITIONS: Record<UnitSystem, Record<Quantity, UnitDefinition>> = {
  metric: {
    length: { label: 'm', siPerDisplay: 1, decimals: 3 },
    force: { label: 'kN', siPerDisplay: 1000, decimals: 2 },
    moment: { label: 'kN·m', siPerDisplay: 1000, decimals: 2 },
    stress: { label: 'MPa', siPerDisplay: 1e6, decimals: 1 },
  },
  imperial: {
    length: { label: 'ft', siPerDisplay: 0.3048, decimals: 3 },
    force: { label: 'kip', siPerDisplay: 4448.2216152605, decimals: 2 },
    moment: { label: 'kip·ft', siPerDisplay: 1355.8179483314, decimals: 2 },
    stress: { label: 'ksi', siPerDisplay: 6.894757293168e6, decimals: 2 },
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
