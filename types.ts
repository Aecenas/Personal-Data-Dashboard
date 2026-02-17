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

export interface CardAlertConfig {
  enabled: boolean;
  cooldown_sec: number;
  status_change_enabled?: boolean;
  upper_threshold?: number;
  lower_threshold?: number;
}

export interface CardAlertState {
  last_status_state?: ScriptOutputStatus['state'];
  condition_last_trigger_at: Record<string, number>;
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

export type ScalarContentPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type VerticalContentPosition = 'top' | 'center' | 'bottom';
export type TextSizePreset = 'small' | 'medium' | 'large';

export const SCALAR_CONTENT_POSITIONS: ScalarContentPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

export const VERTICAL_CONTENT_POSITIONS: VerticalContentPosition[] = ['top', 'center', 'bottom'];
export const TEXT_SIZE_PRESETS: TextSizePreset[] = ['small', 'medium', 'large'];

export interface UIConfig {
  color_theme: 'default' | 'blue' | 'green' | 'red' | 'yellow' | 'purple';
  size: '1x1' | '2x1' | '1x2' | '2x2';
  x: number;
  y: number;
  scalar_position?: ScalarContentPosition;
  scalar_text_size?: TextSizePreset;
  status_vertical_position?: VerticalContentPosition;
  status_text_size?: TextSizePreset;
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

export interface CardExecutionHistoryEntry {
  executed_at: number;
  duration_ms: number;
  ok: boolean;
  timed_out: boolean;
  exit_code: number | null;
  error_summary?: string;
}

export interface CardExecutionHistoryBuffer {
  capacity: number;
  next_index: number;
  size: number;
  entries: CardExecutionHistoryEntry[];
}

export interface CardRuntimeData {
  state: RuntimeState;
  isLoading: boolean;
  source: 'live' | 'cache' | 'none';
  payload?: NormalizedCardPayload;
  thresholdAlertTriggered?: boolean;
  error?: string;
  stderr?: string;
  exitCode?: number | null;
  durationMs?: number;
  lastUpdated?: number;
}

export interface Card {
  id: string;
  business_id?: string;
  title: string;
  group: string;
  type: CardType;
  script_config: ScriptConfig;
  mapping_config: MappingConfig;
  refresh_config: RefreshConfig;
  ui_config: UIConfig;
  layout_positions?: LayoutPositionMap;
  status: CardStatus;
  alert_config?: CardAlertConfig;
  alert_state?: CardAlertState;
  cache_data?: CacheData;
  execution_history?: CardExecutionHistoryBuffer;
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

export interface GroupEntity {
  id: string;
  name: string;
  order: number;
}

export interface InteractionSoundConfig {
  enabled: boolean;
  volume: number;
  engine: 'web_audio_native_v1';
}

export interface AppSettings {
  schema_version: number;
  theme: 'dark' | 'light';
  language: AppLanguage;
  dashboard_columns: number;
  adaptive_window_enabled: boolean;
  refresh_concurrency_limit: number;
  execution_history_limit: number;
  backup_config: BackupConfig;
  interaction_sound: InteractionSoundConfig;
  activeGroup: string;
  groups: GroupEntity[];
  cards: Card[];
  section_markers: SectionMarker[];
  default_python_path?: string;
}

export interface BackupConfig {
  directory?: string;
  retention_count: number;
  auto_backup_enabled: boolean;
  schedule: BackupSchedule;
}

export type BackupIntervalMinutes = 5 | 30 | 60 | 180 | 720;
export type BackupWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type BackupSchedule = BackupIntervalSchedule | BackupDailySchedule | BackupWeeklySchedule;

export interface BackupIntervalSchedule {
  mode: 'interval';
  every_minutes: BackupIntervalMinutes;
}

export interface BackupDailySchedule {
  mode: 'daily';
  hour: number;
  minute: number;
}

export interface BackupWeeklySchedule {
  mode: 'weekly';
  weekday: BackupWeekday;
  hour: number;
  minute: number;
}

export type ViewMode = 'dashboard' | 'group_management' | 'diagnostics' | 'recycle_bin' | 'settings';
