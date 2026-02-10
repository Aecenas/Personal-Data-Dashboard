// Enums and Types based on PRD

export type CardType = 'scalar' | 'series' | 'status';

export interface ScriptConfig {
  path: string;
  args: string[];
  env_path?: string;
}

export interface MappingConfig {
  value_key?: string; // For scalar
  x_key?: string;     // For series
  y_key?: string;     // For series
  label_key?: string; // For status/series
}

export interface UIConfig {
  color_theme: 'default' | 'blue' | 'green' | 'red' | 'yellow' | 'purple';
  size: '1x1' | '2x1' | '1x2' | '2x2';
  // 0-based coordinates. x: 0-3 (fixed 4 columns), y: 0-Infinity
  x: number;
  y: number;
}

export interface CardStatus {
  is_deleted: boolean;
  deleted_at: string | null;
}

// Data Contract Payload (from Python stdout)
export interface ScriptOutputScalar {
  value: number | string;
  unit?: string;
  trend?: 'up' | 'down' | 'flat';
  color?: 'success' | 'warning' | 'danger' | 'neutral';
}

export interface ScriptOutputSeriesItem {
  name: string;
  values: number[];
}

export interface ScriptOutputSeries {
  x_axis: string[];
  series: ScriptOutputSeriesItem[];
}

export interface CardData {
  isLoading: boolean;
  error?: string;
  lastUpdated?: number;
  payload?: ScriptOutputScalar | ScriptOutputSeries; // Simplified for UI
}

export interface Card {
  id: string;
  title: string;
  group: string;
  type: CardType;
  script_config: ScriptConfig;
  mapping_config: MappingConfig;
  ui_config: UIConfig;
  status: CardStatus;
  // Runtime state (not persisted in DB, but managed in store)
  runtimeData?: CardData;
}

export type ViewMode = 'dashboard' | 'recycle_bin' | 'settings';