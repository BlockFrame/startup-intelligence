export type ScenarioType = 'supply_chain' | 'tariff_shock';

export interface ScenarioTemplate {
  id: string;
  name: string;
  type: ScenarioType;
  description: string;
  affectedChokepointIds: string[];
}

export interface ScenarioVisualState {
  scenarioId: string;
  disruptedChokepointIds: string[];
  affectedIso2s: string[];
}

export interface ScenarioImpactCountry {
  iso2: string;
  name?: string;
  score?: number;
  impactPct: number;
}

export interface ScenarioResult {
  affectedChokepointIds: string[];
  topImpactCountries: ScenarioImpactCountry[];
}

export const SCENARIO_TEMPLATES: ScenarioTemplate[] = [];
