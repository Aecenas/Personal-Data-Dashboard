export type CardType = 'scalar' | 'series' | 'status' | 'gauge';

export type RuntimeState = 'idle' | 'loading' | 'success' | 'error';
export type AppLanguage = 'en-US' | 'zh-CN';

export interface ScriptConfig {
  path: string;
  args: string[];
  env_path?: string;
}

export interface ScalarMappingConfig {
  value_key: string;
  unit_key?: string;
  trend_key?: string;
  color_key?: string;
}

export interface SeriesMappingConfig {
  x_axis_key: string;
  series_key: string;
  series_name_key: string;
  series_values_key: string;
}

export interface StatusMappingConfig {
  label_key: string;
  state_key: string;
  message_key?: string;
}

export interface GaugeMappingConfig {
  min_key: string;
  max_key: string;
  value_key: string;
  unit_key?: string;
}

export interface MappingConfig {
  scalar?: ScalarMappingConfig;
  series?: SeriesMappingConfig;
  status?: StatusMappingConfig;
  gauge?: GaugeMappingConfig;
}

export interface RefreshConfig {
  interval_sec: number;
  refresh_on_start: boolean;
  refresh_on_resume: boolean;
  timeout_ms: number;
}

export interface UIConfig {
  color_theme: 'default' | 'blue' | 'green' | 'red' | 'yellow' | 'purple';
  size: '1x1' | '2x1' | '1x2' | '2x2';
  x: number;
  y: number;
}

export interface LayoutPosition {
  x: number;
  y: number;
}

export type LayoutPositionMap = Record<string, LayoutPosition>;

export interface CardStatus {
  is_deleted: boolean;
  deleted_at: string | null;
  sort_order: number;
}

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
  x_axis: Array<string | number>;
  series: ScriptOutputSeriesItem[];
}

export interface ScriptOutputStatus {
  label: string;
  state: 'ok' | 'warning' | 'error' | 'unknown';
  message?: string;
}

export interface ScriptOutputGauge {
  min: number;
  max: number;
  value: number;
  unit?: string;
}

export type NormalizedCardPayload =
  | ScriptOutputScalar
  | ScriptOutputSeries
  | ScriptOutputStatus
  | ScriptOutputGauge;

export interface CacheData {
  last_success_payload?: NormalizedCardPayload;
  last_success_at?: number;
  last_error?: string;
  last_error_at?: number;
  raw_stdout_excerpt?: string;
  stderr_excerpt?: string;
  last_exit_code?: number | null;
  last_duration_ms?: number;
}

export interface CardRuntimeData {
  state: RuntimeState;
  isLoading: boolean;
  source: 'live' | 'cache' | 'none';
  payload?: NormalizedCardPayload;
  error?: string;
  stderr?: string;
  exitCode?: number | null;
  durationMs?: number;
  lastUpdated?: number;
}

export interface Card {
  id: string;
  title: string;
  group: string;
  type: CardType;
  script_config: ScriptConfig;
  mapping_config: MappingConfig;
  refresh_config: RefreshConfig;
  ui_config: UIConfig;
  layout_positions?: LayoutPositionMap;
  status: CardStatus;
  cache_data?: CacheData;
  runtimeData?: CardRuntimeData;
}

export interface SectionMarker {
  id: string;
  title: string;
  group: string;
  after_row: number;
  start_col: number;
  span_col: number;
  line_color: 'primary' | 'red' | 'green' | 'blue' | 'amber';
  line_style: 'dashed' | 'solid';
  line_width: 1 | 2 | 3 | 4;
  label_align: 'left' | 'center' | 'right';
}

export interface AppSettings {
  schema_version: number;
  theme: 'dark' | 'light';
  language: AppLanguage;
  activeGroup: string;
  cards: Card[];
  section_markers: SectionMarker[];
  default_python_path?: string;
}

export type ViewMode = 'dashboard' | 'recycle_bin' | 'settings';
