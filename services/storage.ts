import {
  BaseDirectory,
  readTextFile,
  writeTextFile,
  mkdir,
  exists,
  readDir,
  remove,
} from '@tauri-apps/plugin-fs';
import { appLocalDataDir, join as joinNativePath } from '@tauri-apps/api/path';
import {
  AppLanguage,
  AppSettings,
  BackupConfig,
  BackupIntervalMinutes,
  BackupSchedule,
  BackupWeekday,
  Card,
  MappingConfig,
  RefreshConfig,
  SectionMarker,
  GroupEntity,
  ScalarContentPosition,
  TextSizePreset,
  VerticalContentPosition,
  SCALAR_CONTENT_POSITIONS,
  TEXT_SIZE_PRESETS,
  VERTICAL_CONTENT_POSITIONS,
} from '../types';
import { t } from '../i18n';
import { ensureCardLayoutScopes } from '../layout';
import { clampDashboardColumns } from '../grid';
import { clampRefreshConcurrency } from '../refresh';
import { normalizeAlertConfig, normalizeAlertState } from './alerts';
import {
  clampExecutionHistoryLimit,
  DEFAULT_EXECUTION_HISTORY_LIMIT,
  normalizeExecutionHistoryBuffer,
  withExecutionHistoryCapacity,
} from './diagnostics';

const POINTER_FILENAME = 'storage_config.json';
const DATA_FILENAME = 'user_settings.json';
const DEFAULT_SUBDIR = 'data';
const DEFAULT_BACKUP_SUBDIR = 'backups';
const BACKUP_FILENAME_PREFIX = 'backup';
const SCHEMA_VERSION = 5;
const RESERVED_ALL_GROUP = 'All';
const DEFAULT_GROUP_NAME = 'Default';
const GROUP_ID_PATTERN = /^G(\d+)$/i;
const CARD_BUSINESS_ID_PATTERN = /^G(\d+)-C(\d+)$/i;
const MIN_BACKUP_RETENTION_COUNT = 3;
const MAX_BACKUP_RETENTION_COUNT = 20;
const DEFAULT_BACKUP_RETENTION_COUNT = 5;
const BACKUP_INTERVAL_OPTIONS = [5, 30, 60, 180, 720] as const;
const DEFAULT_BACKUP_INTERVAL_MINUTES: BackupIntervalMinutes = 60;
const DEFAULT_BACKUP_DAILY_HOUR = 3;
const DEFAULT_BACKUP_DAILY_MINUTE = 0;
const DEFAULT_BACKUP_WEEKDAY: BackupWeekday = 1;

interface StorageConfig {
  customPath: string | null;
}

export interface BackupWriteConfig {
  directory?: string;
  retentionCount: number;
}

export interface ImportSettingsResult {
  settings: AppSettings;
  migratedFromSchemaVersion?: number;
}

const isTauri = () => typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
const getLanguage = (): AppLanguage =>
  typeof document !== 'undefined' && document.documentElement.lang === 'en-US' ? 'en-US' : 'zh-CN';
const tr = (key: string, params?: Record<string, string | number>) => t(getLanguage(), key, params);

const normalizeLanguage = (value: unknown): AppLanguage => (value === 'en-US' ? 'en-US' : 'zh-CN');
const normalizeAdaptiveWindowEnabled = (value: unknown): boolean => value !== false;
const isAllGroupName = (name: string): boolean => name.trim().toLowerCase() === RESERVED_ALL_GROUP.toLowerCase();
const normalizeGroupName = (value: unknown): string => {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_GROUP_NAME;
};
const normalizeScalarContentPosition = (value: unknown): ScalarContentPosition => {
  const raw = String(value ?? '').trim();
  return SCALAR_CONTENT_POSITIONS.includes(raw as ScalarContentPosition)
    ? (raw as ScalarContentPosition)
    : 'center';
};
const normalizeVerticalContentPosition = (value: unknown): VerticalContentPosition => {
  const raw = String(value ?? '').trim();
  return VERTICAL_CONTENT_POSITIONS.includes(raw as VerticalContentPosition)
    ? (raw as VerticalContentPosition)
    : 'center';
};
const normalizeTextSizePreset = (value: unknown): TextSizePreset => {
  const raw = String(value ?? '').trim();
  return TEXT_SIZE_PRESETS.includes(raw as TextSizePreset) ? (raw as TextSizePreset) : 'medium';
};
const normalizeUIConfig = (rawUIConfig: any): Card['ui_config'] => ({
  color_theme: rawUIConfig?.color_theme ?? 'default',
  size: rawUIConfig?.size ?? '1x1',
  x: Number(rawUIConfig?.x ?? 0),
  y: Number(rawUIConfig?.y ?? 0),
  scalar_position: normalizeScalarContentPosition(rawUIConfig?.scalar_position),
  scalar_text_size: normalizeTextSizePreset(rawUIConfig?.scalar_text_size),
  status_vertical_position: normalizeVerticalContentPosition(rawUIConfig?.status_vertical_position),
  status_text_size: normalizeTextSizePreset(rawUIConfig?.status_text_size),
});
const normalizeGroupId = (value: unknown): string | undefined => {
  const raw = String(value ?? '').trim().toUpperCase();
  const matched = GROUP_ID_PATTERN.exec(raw);
  if (!matched) return undefined;
  const number = Number.parseInt(matched[1], 10);
  if (!Number.isInteger(number) || number <= 0) return undefined;
  return `G${number}`;
};
const getGroupIdNumber = (groupId: string): number => {
  const matched = GROUP_ID_PATTERN.exec(groupId);
  if (!matched) return 0;
  const number = Number.parseInt(matched[1], 10);
  return Number.isInteger(number) && number > 0 ? number : 0;
};
const formatGroupId = (number: number): string => `G${Math.max(1, Math.floor(number))}`;
const groupIdByName = (groups: GroupEntity[]): Map<string, string> =>
  new Map(groups.map((group) => [group.name, group.id]));
const parseBusinessId = (value: unknown): { groupId: string; cardNumber: number } | null => {
  const raw = String(value ?? '').trim().toUpperCase();
  const matched = CARD_BUSINESS_ID_PATTERN.exec(raw);
  if (!matched) return null;
  const groupNumber = Number.parseInt(matched[1], 10);
  const cardNumber = Number.parseInt(matched[2], 10);
  if (!Number.isInteger(groupNumber) || groupNumber <= 0 || !Number.isInteger(cardNumber) || cardNumber <= 0) {
    return null;
  }
  return {
    groupId: formatGroupId(groupNumber),
    cardNumber,
  };
};
const normalizeGroupEntities = (
  rawGroups: unknown,
  cards: Card[],
  sectionMarkers: SectionMarker[],
  activeGroup: unknown,
): GroupEntity[] => {
  const ordered: Array<{ name: string; id?: string }> = [];
  const seenNames = new Set<string>();
  const seenIds = new Set<string>();
  let maxIdNumber = 0;
  const hasExplicitGroups = Array.isArray(rawGroups);

  if (hasExplicitGroups) {
    rawGroups.forEach((group: any) => {
      const groupId = normalizeGroupId(group?.id);
      if (!groupId) return;
      maxIdNumber = Math.max(maxIdNumber, getGroupIdNumber(groupId));
    });
  }

  const createGroupId = () => {
    let candidate = maxIdNumber + 1;
    while (seenIds.has(formatGroupId(candidate))) {
      candidate += 1;
    }
    maxIdNumber = candidate;
    const id = formatGroupId(candidate);
    seenIds.add(id);
    return id;
  };

  const pushGroup = (value: unknown, preferredId?: unknown) => {
    const name = normalizeGroupName(value);
    if (isAllGroupName(name)) return;
    if (seenNames.has(name)) return;
    seenNames.add(name);

    const normalizedPreferredId = normalizeGroupId(preferredId);
    let id: string | undefined = normalizedPreferredId;
    if (!id || seenIds.has(id)) {
      id = createGroupId();
    } else {
      seenIds.add(id);
      maxIdNumber = Math.max(maxIdNumber, getGroupIdNumber(id));
    }
    ordered.push({ name, id });
  };

  if (hasExplicitGroups) {
    rawGroups
      .slice()
      .sort((a: any, b: any) => {
        const orderA = Number.isFinite(Number(a?.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
        const orderB = Number.isFinite(Number(b?.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return String(a?.name ?? '').localeCompare(String(b?.name ?? ''));
      })
      .forEach((group: any) => pushGroup(group?.name, group?.id));
  }

  cards.forEach((card) => pushGroup(card.group));
  if (hasExplicitGroups) {
    sectionMarkers.forEach((section) => pushGroup(section.group));
    if (typeof activeGroup === 'string' && !isAllGroupName(activeGroup)) {
      pushGroup(activeGroup);
    }
  }

  if (ordered.length === 0) {
    pushGroup(DEFAULT_GROUP_NAME);
  }

  return ordered.map((group, order) => ({
    id: group.id ?? createGroupId(),
    name: group.name,
    order,
  }));
};
const normalizeActiveGroup = (value: unknown, groups: GroupEntity[]): string => {
  const groupNames = groups.map((group) => group.name);
  const fallback = groupNames[0] ?? DEFAULT_GROUP_NAME;
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  if (!normalized || isAllGroupName(normalized)) return fallback;
  return groupNames.includes(normalized) ? normalized : fallback;
};
const normalizeCardBusinessIds = (cards: Card[], groups: GroupEntity[]): Card[] => {
  const map = groupIdByName(groups);
  const used = new Set<string>();
  const maxByGroup = new Map<string, number>();
  const validByCardId = new Map<string, string>();

  cards.forEach((card) => {
    const groupId = map.get(card.group);
    if (!groupId) return;
    const parsed = parseBusinessId(card.business_id);
    if (!parsed) return;
    if (parsed.groupId !== groupId) return;
    const normalized = `${parsed.groupId}-C${parsed.cardNumber}`;
    if (used.has(normalized)) return;
    used.add(normalized);
    validByCardId.set(card.id, normalized);
    maxByGroup.set(groupId, Math.max(maxByGroup.get(groupId) ?? 0, parsed.cardNumber));
  });

  const nextBusinessId = (groupId: string) => {
    let candidate = (maxByGroup.get(groupId) ?? 0) + 1;
    let id = `${groupId}-C${candidate}`;
    while (used.has(id)) {
      candidate += 1;
      id = `${groupId}-C${candidate}`;
    }
    used.add(id);
    maxByGroup.set(groupId, candidate);
    return id;
  };

  return cards.map((card) => {
    const groupId = map.get(card.group);
    if (!groupId) return card;
    const business_id = validByCardId.get(card.id) ?? nextBusinessId(groupId);
    if (card.business_id === business_id) return card;
    return {
      ...card,
      business_id,
    };
  });
};
const normalizePathString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};
const normalizeAutoBackupEnabled = (value: unknown): boolean => value !== false;

const clampBackupRetentionCount = (value: unknown): number => {
  const parsed = Number.parseInt(String(value ?? DEFAULT_BACKUP_RETENTION_COUNT), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_BACKUP_RETENTION_COUNT;
  return Math.max(MIN_BACKUP_RETENTION_COUNT, Math.min(MAX_BACKUP_RETENTION_COUNT, parsed));
};

const normalizeHour = (value: unknown, fallback = DEFAULT_BACKUP_DAILY_HOUR): number => {
  const hour = Number.parseInt(String(value), 10);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return fallback;
  return hour;
};

const normalizeMinute = (value: unknown, fallback = DEFAULT_BACKUP_DAILY_MINUTE): number => {
  const minute = Number.parseInt(String(value), 10);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return fallback;
  return minute;
};

const normalizeWeekday = (value: unknown, fallback = DEFAULT_BACKUP_WEEKDAY): BackupWeekday => {
  const weekday = Number.parseInt(String(value), 10);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return fallback;
  return weekday as BackupWeekday;
};

const parseLegacyAutoBackupTime = (value: unknown) => {
  if (typeof value !== 'string') {
    return { hour: DEFAULT_BACKUP_DAILY_HOUR, minute: DEFAULT_BACKUP_DAILY_MINUTE };
  }

  const trimmed = value.trim();
  if (!/^\d{2}:\d{2}$/.test(trimmed)) {
    return { hour: DEFAULT_BACKUP_DAILY_HOUR, minute: DEFAULT_BACKUP_DAILY_MINUTE };
  }

  const [hourText, minuteText] = trimmed.split(':');
  return {
    hour: normalizeHour(hourText, DEFAULT_BACKUP_DAILY_HOUR),
    minute: normalizeMinute(minuteText, DEFAULT_BACKUP_DAILY_MINUTE),
  };
};

const normalizeIntervalMinutes = (value: unknown): BackupIntervalMinutes => {
  const parsed = Number.parseInt(String(value), 10);
  if (BACKUP_INTERVAL_OPTIONS.includes(parsed as BackupIntervalMinutes)) {
    return parsed as BackupIntervalMinutes;
  }
  return DEFAULT_BACKUP_INTERVAL_MINUTES;
};

const normalizeBackupSchedule = (rawSchedule: any, legacyAutoBackupTime?: unknown): BackupSchedule => {
  const legacyTime = parseLegacyAutoBackupTime(legacyAutoBackupTime);

  if (!rawSchedule || typeof rawSchedule !== 'object' || Array.isArray(rawSchedule)) {
    return {
      mode: 'daily',
      hour: legacyTime.hour,
      minute: legacyTime.minute,
    };
  }

  if (rawSchedule.mode === 'interval') {
    return {
      mode: 'interval',
      every_minutes: normalizeIntervalMinutes(rawSchedule.every_minutes),
    };
  }

  if (rawSchedule.mode === 'weekly') {
    return {
      mode: 'weekly',
      weekday: normalizeWeekday(rawSchedule.weekday),
      hour: normalizeHour(rawSchedule.hour, legacyTime.hour),
      minute: normalizeMinute(rawSchedule.minute, legacyTime.minute),
    };
  }

  return {
    mode: 'daily',
    hour: normalizeHour(rawSchedule.hour, legacyTime.hour),
    minute: normalizeMinute(rawSchedule.minute, legacyTime.minute),
  };
};

const normalizeBackupConfig = (rawConfig: any): BackupConfig => ({
  directory: normalizePathString(rawConfig?.directory),
  retention_count: clampBackupRetentionCount(rawConfig?.retention_count),
  auto_backup_enabled: normalizeAutoBackupEnabled(rawConfig?.auto_backup_enabled),
  schedule: normalizeBackupSchedule(rawConfig?.schedule, rawConfig?.auto_backup_time),
});

class ConfigImportError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ConfigImportError';
  }
}

const ensureImportObject = (input: unknown): Record<string, unknown> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ConfigImportError('root', tr('settings.importErrorRootObject'));
  }

  return input as Record<string, unknown>;
};

const ensureOptionalArray = (input: Record<string, unknown>, field: string) => {
  const value = input[field];
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    throw new ConfigImportError(field, tr('settings.importErrorFieldArray', { field }));
  }
};

const ensureOptionalObject = (input: Record<string, unknown>, field: string) => {
  const value = input[field];
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigImportError(field, tr('settings.importErrorFieldObject', { field }));
  }
};

const validateImportStructure = (input: unknown): Record<string, unknown> => {
  const objectPayload = ensureImportObject(input);
  ensureOptionalArray(objectPayload, 'cards');
  ensureOptionalArray(objectPayload, 'section_markers');
  ensureOptionalArray(objectPayload, 'groups');
  ensureOptionalObject(objectPayload, 'backup_config');
  const backupConfig = objectPayload.backup_config as Record<string, unknown> | undefined;
  if (backupConfig?.schedule !== undefined) {
    ensureOptionalObject(backupConfig, 'schedule');
  }

  const schemaVersion = objectPayload.schema_version;
  if (schemaVersion !== undefined && (!Number.isInteger(schemaVersion) || Number(schemaVersion) <= 0)) {
    throw new ConfigImportError('schema_version', tr('settings.importErrorSchemaVersion'));
  }

  return objectPayload;
};

const dirname = (path: string): string => {
  const normalized = path.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  if (index <= 0) return '';
  return normalized.slice(0, index);
};

const joinPath = (folder: string, name: string): string => {
  if (!folder) return name;
  const normalized = folder.replace(/[\\/]+$/, '');
  return `${normalized}/${name}`;
};

const formatBackupTimestamp = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hour}${minute}${second}`;
};

const createBackupFileName = (timestamp = new Date()) =>
  `${BACKUP_FILENAME_PREFIX}-${formatBackupTimestamp(timestamp)}.json`;

const backupFileNamePattern = new RegExp(`^${BACKUP_FILENAME_PREFIX}-\\d{8}-\\d{6}\\.json$`);

const getBackupFilesToDelete = (fileNames: string[], retentionCount: number) => {
  const normalizedRetention = clampBackupRetentionCount(retentionCount);
  const candidates = fileNames.filter((name) => backupFileNamePattern.test(name)).sort();
  if (candidates.length <= normalizedRetention) return [];
  return candidates.slice(0, candidates.length - normalizedRetention);
};

const defaultRefreshConfig: RefreshConfig = {
  interval_sec: 0,
  refresh_on_start: true,
  refresh_on_resume: true,
  timeout_ms: 10000,
};

const createDefaultMapping = (cardType: Card['type']): MappingConfig => {
  if (cardType === 'scalar') {
    return {
      scalar: {
        value_key: 'value',
        unit_key: 'unit',
        trend_key: 'trend',
        color_key: 'color',
      },
    };
  }

  if (cardType === 'series') {
    return {
      series: {
        x_axis_key: 'x_axis',
        series_key: 'series',
        series_name_key: 'name',
        series_values_key: 'values',
      },
    };
  }

  if (cardType === 'status') {
    return {
      status: {
        label_key: 'label',
        state_key: 'state',
        message_key: 'message',
      },
    };
  }

  return {
    gauge: {
      min_key: 'min',
      max_key: 'max',
      value_key: 'value',
      unit_key: 'unit',
    },
  };
};

const normalizeMapping = (rawMapping: any, cardType: Card['type']): MappingConfig => {
  const defaults = createDefaultMapping(cardType);

  if (!rawMapping || typeof rawMapping !== 'object') return defaults;

  const legacyScalar = rawMapping.value_key
    ? {
        value_key: rawMapping.value_key,
        unit_key: rawMapping.unit_key,
        trend_key: rawMapping.trend_key,
        color_key: rawMapping.color_key,
      }
    : undefined;

  const legacySeries = rawMapping.x_key || rawMapping.y_key || rawMapping.label_key
    ? {
        x_axis_key: rawMapping.x_key ?? 'x_axis',
        series_key: 'series',
        series_name_key: rawMapping.label_key ?? 'name',
        series_values_key: rawMapping.y_key ?? 'values',
      }
    : undefined;

  const legacyStatus = rawMapping.label_key
    ? {
        label_key: rawMapping.label_key,
        state_key: rawMapping.state_key ?? 'state',
        message_key: rawMapping.message_key ?? 'message',
      }
    : undefined;

  const legacyGauge = rawMapping.min_key || rawMapping.max_key || rawMapping.value_key
    ? {
        min_key: rawMapping.min_key ?? 'min',
        max_key: rawMapping.max_key ?? 'max',
        value_key: rawMapping.value_key ?? 'value',
        unit_key: rawMapping.unit_key ?? 'unit',
      }
    : undefined;

  return {
    scalar: {
      ...(defaults.scalar ?? {}),
      ...(legacyScalar ?? {}),
      ...(rawMapping.scalar ?? {}),
    },
    series: {
      ...(defaults.series ?? {}),
      ...(legacySeries ?? {}),
      ...(rawMapping.series ?? {}),
    },
    status: {
      ...(defaults.status ?? {}),
      ...(legacyStatus ?? {}),
      ...(rawMapping.status ?? {}),
    },
    gauge: {
      ...(defaults.gauge ?? {}),
      ...(legacyGauge ?? {}),
      ...(rawMapping.gauge ?? {}),
    },
  };
};

const deriveCacheFromLegacyRuntime = (legacyRuntimeData: any) => {
  if (!legacyRuntimeData || typeof legacyRuntimeData !== 'object') return undefined;

  return {
    last_success_payload: legacyRuntimeData.payload,
    last_success_at: legacyRuntimeData.lastUpdated,
    last_error: legacyRuntimeData.error,
    last_error_at: legacyRuntimeData.error ? Date.now() : undefined,
  };
};

const normalizeSectionMarker = (rawMarker: any, index: number, columns: number): SectionMarker => {
  const normalizedColumns = clampDashboardColumns(columns);
  const startCol = Math.max(0, Math.min(normalizedColumns - 1, Math.floor(Number(rawMarker?.start_col ?? 0))));
  const maxSpan = normalizedColumns - startCol;
  const spanCol = Math.max(1, Math.min(maxSpan, Math.floor(Number(rawMarker?.span_col ?? 2))));
  const lineColorRaw = String(rawMarker?.line_color ?? 'primary');
  const lineStyleRaw = String(rawMarker?.line_style ?? 'dashed');
  const lineWidthRaw = Math.floor(Number(rawMarker?.line_width ?? 2));
  const labelAlignRaw = String(rawMarker?.label_align ?? 'center');

  const line_color: SectionMarker['line_color'] = ['primary', 'red', 'green', 'blue', 'amber'].includes(lineColorRaw)
    ? (lineColorRaw as SectionMarker['line_color'])
    : 'primary';
  const line_style: SectionMarker['line_style'] = ['dashed', 'solid'].includes(lineStyleRaw)
    ? (lineStyleRaw as SectionMarker['line_style'])
    : 'dashed';
  const line_width: SectionMarker['line_width'] = [1, 2, 3, 4].includes(lineWidthRaw)
    ? (lineWidthRaw as SectionMarker['line_width'])
    : 2;
  const label_align: SectionMarker['label_align'] = ['left', 'center', 'right'].includes(labelAlignRaw)
    ? (labelAlignRaw as SectionMarker['label_align'])
    : 'center';

  return {
    id: String(rawMarker?.id ?? crypto.randomUUID()),
    title: String(rawMarker?.title ?? `Section ${index + 1}`).trim() || `Section ${index + 1}`,
    group: normalizeGroupName(rawMarker?.group),
    after_row: Math.max(-1, Math.floor(Number(rawMarker?.after_row ?? 0))),
    start_col: startCol,
    span_col: spanCol,
    line_color,
    line_style,
    line_width,
    label_align,
  };
};

const normalizeCard = (rawCard: any, index: number, historyLimit: number): Card => {
  const cardType: Card['type'] =
    rawCard?.type === 'scalar' ||
    rawCard?.type === 'series' ||
    rawCard?.type === 'status' ||
    rawCard?.type === 'gauge'
      ? rawCard.type
      : 'scalar';

  const mapping = normalizeMapping(rawCard?.mapping_config, cardType);

  const cacheFromLegacy = deriveCacheFromLegacyRuntime(rawCard?.runtimeData);
  const executionHistory = withExecutionHistoryCapacity(
    normalizeExecutionHistoryBuffer(rawCard?.execution_history, historyLimit),
    historyLimit,
  );

  const card: Card = {
    id: String(rawCard?.id ?? crypto.randomUUID()),
    business_id: typeof rawCard?.business_id === 'string' ? rawCard.business_id : undefined,
    title: String(rawCard?.title ?? `Card ${index + 1}`),
    group: normalizeGroupName(rawCard?.group),
    type: cardType,
    script_config: {
      path: String(rawCard?.script_config?.path ?? ''),
      args: Array.isArray(rawCard?.script_config?.args)
        ? rawCard.script_config.args.map((arg: unknown) => String(arg))
        : [],
      env_path: rawCard?.script_config?.env_path
        ? String(rawCard.script_config.env_path)
        : undefined,
    },
    mapping_config: mapping,
    refresh_config: {
      ...defaultRefreshConfig,
      ...(rawCard?.refresh_config ?? {}),
    },
    ui_config: normalizeUIConfig(rawCard?.ui_config),
    layout_positions:
      rawCard?.layout_positions && typeof rawCard.layout_positions === 'object'
        ? rawCard.layout_positions
        : undefined,
    status: {
      is_deleted: Boolean(rawCard?.status?.is_deleted),
      deleted_at: rawCard?.status?.deleted_at ? String(rawCard.status.deleted_at) : null,
      sort_order: Number(rawCard?.status?.sort_order ?? index + 1),
    },
    alert_config: normalizeAlertConfig(rawCard?.alert_config),
    alert_state: normalizeAlertState(rawCard?.alert_state),
    cache_data: rawCard?.cache_data ?? cacheFromLegacy,
    execution_history: executionHistory.size > 0 ? executionHistory : undefined,
  };

  return ensureCardLayoutScopes(card);
};

const migrateToLatest = (input: any): AppSettings => {
  const dashboard_columns = clampDashboardColumns(input?.dashboard_columns);
  const execution_history_limit = clampExecutionHistoryLimit(input?.execution_history_limit);
  const cardsRaw = Array.isArray(input?.cards) ? input.cards : [];
  const cards = cardsRaw.map((card: any, index: number) => normalizeCard(card, index, execution_history_limit));
  const sectionRaw = Array.isArray(input?.section_markers) ? input.section_markers : [];
  const sectionMarkers = sectionRaw.map((marker: any, index: number) =>
    normalizeSectionMarker(marker, index, dashboard_columns),
  );
  const groups = normalizeGroupEntities(input?.groups, cards, sectionMarkers, input?.activeGroup);
  const cardsWithBusinessIds = normalizeCardBusinessIds(cards, groups);
  const activeGroup = normalizeActiveGroup(input?.activeGroup, groups);

  return {
    schema_version: SCHEMA_VERSION,
    theme: input?.theme === 'dark' ? 'dark' : 'light',
    language: normalizeLanguage(input?.language),
    dashboard_columns,
    adaptive_window_enabled: normalizeAdaptiveWindowEnabled(input?.adaptive_window_enabled),
    refresh_concurrency_limit: clampRefreshConcurrency(input?.refresh_concurrency_limit),
    execution_history_limit,
    backup_config: normalizeBackupConfig(
      input?.backup_config ?? {
        directory: input?.backup_directory,
        retention_count: input?.backup_retention_count,
        auto_backup_time: input?.auto_backup_time,
      },
    ),
    activeGroup,
    groups,
    cards: cardsWithBusinessIds,
    section_markers: sectionMarkers,
    default_python_path:
      typeof input?.default_python_path === 'string' ? input.default_python_path : undefined,
  };
};

const sanitizeForSave = (settings: AppSettings): AppSettings => {
  const dashboard_columns = clampDashboardColumns((settings as Partial<AppSettings>).dashboard_columns);
  const refresh_concurrency_limit = clampRefreshConcurrency(
    (settings as Partial<AppSettings>).refresh_concurrency_limit,
  );
  const execution_history_limit = clampExecutionHistoryLimit(
    (settings as Partial<AppSettings>).execution_history_limit,
    DEFAULT_EXECUTION_HISTORY_LIMIT,
  );
  const cards = settings.cards.map((card, index) => {
    const normalizedCard = ensureCardLayoutScopes(card);
    const executionHistory = withExecutionHistoryCapacity(
      normalizeExecutionHistoryBuffer(normalizedCard.execution_history, execution_history_limit),
      execution_history_limit,
    );
    return {
      ...normalizedCard,
      status: {
        ...normalizedCard.status,
        sort_order: Number.isFinite(normalizedCard.status.sort_order)
          ? normalizedCard.status.sort_order
          : index + 1,
      },
      refresh_config: {
        ...defaultRefreshConfig,
        ...normalizedCard.refresh_config,
      },
      ui_config: normalizeUIConfig(normalizedCard.ui_config),
      alert_config: normalizeAlertConfig(normalizedCard.alert_config),
      alert_state: normalizeAlertState(normalizedCard.alert_state),
      execution_history: executionHistory.size > 0 ? executionHistory : undefined,
      runtimeData: undefined,
    };
  });
  const sectionRaw = Array.isArray((settings as Partial<AppSettings>).section_markers)
    ? (settings as Partial<AppSettings>).section_markers
    : [];
  const section_markers = sectionRaw.map((marker, index) => normalizeSectionMarker(marker, index, dashboard_columns));
  const groups = normalizeGroupEntities(
    (settings as Partial<AppSettings>).groups,
    cards,
    section_markers,
    (settings as Partial<AppSettings>).activeGroup,
  );
  const cardsWithBusinessIds = normalizeCardBusinessIds(cards, groups);
  const activeGroup = normalizeActiveGroup((settings as Partial<AppSettings>).activeGroup, groups);

  return {
    schema_version: SCHEMA_VERSION,
    theme: settings.theme === 'dark' ? 'dark' : 'light',
    language: normalizeLanguage((settings as Partial<AppSettings>).language),
    dashboard_columns,
    adaptive_window_enabled: normalizeAdaptiveWindowEnabled((settings as Partial<AppSettings>).adaptive_window_enabled),
    refresh_concurrency_limit,
    execution_history_limit,
    backup_config: normalizeBackupConfig((settings as Partial<AppSettings>).backup_config),
    activeGroup,
    groups,
    section_markers,
    default_python_path: settings.default_python_path,
    cards: cardsWithBusinessIds,
  };
};

const resolveDataPath = async (): Promise<{ path: string; baseDir?: BaseDirectory; isCustom: boolean }> => {
  try {
    if (await exists(POINTER_FILENAME, { baseDir: BaseDirectory.AppLocalData })) {
      const content = await readTextFile(POINTER_FILENAME, { baseDir: BaseDirectory.AppLocalData });
      const config: StorageConfig = JSON.parse(content);

      if (config.customPath) {
        return { path: `${config.customPath}/${DATA_FILENAME}`, isCustom: true };
      }
    }
  } catch (error) {
    console.warn('Failed to read storage pointer, fallback to default', error);
  }

  return {
    path: `${DEFAULT_SUBDIR}/${DATA_FILENAME}`,
    baseDir: BaseDirectory.AppLocalData,
    isCustom: false,
  };
};

const resolveBackupDirectory = async (config: BackupWriteConfig) => {
  const customDirectory = normalizePathString(config.directory);
  if (customDirectory) {
    return {
      path: customDirectory,
      baseDir: undefined,
      isCustom: true,
    };
  }

  const dataLocation = await resolveDataPath();
  if (dataLocation.baseDir) {
    const dataDir = dirname(dataLocation.path) || DEFAULT_SUBDIR;
    return {
      path: joinPath(dataDir, DEFAULT_BACKUP_SUBDIR),
      baseDir: dataLocation.baseDir,
      isCustom: false,
    };
  }

  const dataDir = dirname(dataLocation.path);
  const defaultBackupDir = dataDir ? joinPath(dataDir, DEFAULT_BACKUP_SUBDIR) : DEFAULT_BACKUP_SUBDIR;
  return {
    path: defaultBackupDir,
    baseDir: undefined,
    isCustom: false,
  };
};

const readJsonFile = async (path: string, baseDir?: BaseDirectory) => {
  const content = baseDir ? await readTextFile(path, { baseDir }) : await readTextFile(path);
  return JSON.parse(content);
};

const writeJsonFile = async (path: string, payload: string, baseDir?: BaseDirectory) => {
  if (baseDir) {
    await writeTextFile(path, payload, { baseDir });
    return;
  }
  await writeTextFile(path, payload);
};

const resolveAbsolutePath = async (path: string, baseDir?: BaseDirectory): Promise<string> => {
  if (!baseDir) return path;
  if (baseDir === BaseDirectory.AppLocalData) {
    const basePath = await appLocalDataDir();
    return joinNativePath(basePath, path);
  }
  return path;
};

export const storageService = {
  async getCurrentDataPath(): Promise<string> {
    if (!isTauri()) return tr('storage.path.browser');

    try {
      const location = await resolveDataPath();
      const folderPath = location.isCustom ? location.path : dirname(location.path) || DEFAULT_SUBDIR;
      return await resolveAbsolutePath(folderPath, location.baseDir);
    } catch {
      return await resolveAbsolutePath(DEFAULT_SUBDIR, BaseDirectory.AppLocalData);
    }
  },

  async getCurrentBackupPath(config?: Pick<BackupConfig, 'directory'>): Promise<string> {
    if (!isTauri()) return tr('storage.path.browser');
    const resolved = await resolveBackupDirectory({
      directory: config?.directory,
      retentionCount: DEFAULT_BACKUP_RETENTION_COUNT,
    });
    return resolveAbsolutePath(resolved.path, resolved.baseDir);
  },

  async setCustomDataPath(newFolder: string | null) {
    if (!isTauri()) return;

    const current = await resolveDataPath();

    let currentData: string | null = null;
    try {
      if (current.baseDir) {
        if (await exists(current.path, { baseDir: current.baseDir })) {
          currentData = await readTextFile(current.path, { baseDir: current.baseDir });
        }
      } else {
        currentData = await readTextFile(current.path);
      }
    } catch (error) {
      console.warn('Unable to read existing data while migrating storage path', error);
    }

    if (newFolder) {
      if (currentData) {
        await writeTextFile(`${newFolder}/${DATA_FILENAME}`, currentData);
      }
    } else {
      await mkdir(DEFAULT_SUBDIR, { baseDir: BaseDirectory.AppLocalData, recursive: true });
      if (currentData) {
        await writeTextFile(`${DEFAULT_SUBDIR}/${DATA_FILENAME}`, currentData, {
          baseDir: BaseDirectory.AppLocalData,
        });
      }
    }

    const pointerConfig: StorageConfig = { customPath: newFolder };
    await writeTextFile(POINTER_FILENAME, JSON.stringify(pointerConfig), {
      baseDir: BaseDirectory.AppLocalData,
    });
  },

  async save(settings: AppSettings) {
    if (!isTauri()) return;

    const payload = JSON.stringify(sanitizeForSave(settings), null, 2);
    const location = await resolveDataPath();
    if (location.baseDir) {
      const dataDir = dirname(location.path) || DEFAULT_SUBDIR;
      await mkdir(dataDir, { baseDir: location.baseDir, recursive: true });
      await writeJsonFile(location.path, payload, location.baseDir);
      return;
    }

    await writeJsonFile(location.path, payload);
  },

  async load(): Promise<AppSettings | null> {
    if (!isTauri()) return null;

    try {
      const location = await resolveDataPath();
      const fsOptions = location.baseDir ? { baseDir: location.baseDir } : undefined;
      if (location.baseDir) {
        if (!(await exists(location.path, fsOptions))) return null;
      } else if (!(await exists(location.path))) {
        return null;
      }

      const parsed = await readJsonFile(location.path, location.baseDir);
      return migrateToLatest(parsed);
    } catch (error) {
      console.error('Failed to load settings from disk', error);
      return null;
    }
  },

  parseImportPayload(input: unknown): ImportSettingsResult {
    const validatedPayload = validateImportStructure(input);
    const sourceSchemaVersion = Number.isInteger(validatedPayload.schema_version)
      ? Number(validatedPayload.schema_version)
      : undefined;

    return {
      settings: migrateToLatest(validatedPayload),
      migratedFromSchemaVersion:
        sourceSchemaVersion !== undefined && sourceSchemaVersion !== SCHEMA_VERSION
          ? sourceSchemaVersion
          : undefined,
    };
  },

  parseImportText(rawText: string): ImportSettingsResult {
    try {
      const parsed = JSON.parse(rawText);
      return storageService.parseImportPayload(parsed);
    } catch (error) {
      if (error instanceof ConfigImportError) throw error;
      throw new ConfigImportError('json_parse', tr('settings.importErrorInvalidJson'));
    }
  },

  async importFromFile(filePath: string): Promise<ImportSettingsResult> {
    if (!isTauri()) throw new ConfigImportError('not_tauri', tr('settings.importErrorUnavailable'));
    try {
      const rawText = await readTextFile(filePath);
      return storageService.parseImportText(rawText);
    } catch (error) {
      if (error instanceof ConfigImportError) throw error;
      throw new ConfigImportError('file_read', tr('settings.importErrorReadFailed'));
    }
  },

  async exportToFile(filePath: string, settings: AppSettings): Promise<void> {
    if (!isTauri()) throw new Error(tr('settings.importErrorUnavailable'));
    const payload = JSON.stringify(sanitizeForSave(settings), null, 2);
    await writeJsonFile(filePath, payload);
  },

  async createBackup(settings: AppSettings, config: BackupWriteConfig): Promise<string> {
    if (!isTauri()) throw new Error(tr('settings.importErrorUnavailable'));

    const backupDirectory = await resolveBackupDirectory(config);
    const retentionCount = clampBackupRetentionCount(config.retentionCount);
    const backupFileName = createBackupFileName();
    const backupFilePath = joinPath(backupDirectory.path, backupFileName);
    const payload = JSON.stringify(sanitizeForSave(settings), null, 2);
    const mkdirOptions = backupDirectory.baseDir
      ? { baseDir: backupDirectory.baseDir, recursive: true }
      : { recursive: true };
    await mkdir(backupDirectory.path, mkdirOptions);
    await writeJsonFile(backupFilePath, payload, backupDirectory.baseDir);

    const readDirOptions = backupDirectory.baseDir ? { baseDir: backupDirectory.baseDir } : undefined;
    const entries = await readDir(backupDirectory.path, readDirOptions);
    const fileNames = entries
      .filter((entry) => entry.isFile)
      .map((entry) => entry.name)
      .filter((name): name is string => typeof name === 'string');
    const staleBackups = getBackupFilesToDelete(fileNames, retentionCount);
    for (const fileName of staleBackups) {
      const stalePath = joinPath(backupDirectory.path, fileName);
      const removeOptions = backupDirectory.baseDir ? { baseDir: backupDirectory.baseDir } : undefined;
      try {
        await remove(stalePath, removeOptions);
      } catch (error) {
        console.warn(`Failed to remove stale backup: ${stalePath}`, error);
      }
    }

    return backupFilePath;
  },
};

export const storageMigration = {
  migrateToLatest,
  clampBackupRetentionCount,
  normalizeBackupSchedule,
  normalizeBackupConfig,
  validateImportStructure,
  getBackupFilesToDelete,
  normalizeIntervalMinutes,
};

export const MIN_BACKUP_RETENTION = MIN_BACKUP_RETENTION_COUNT;
export const MAX_BACKUP_RETENTION = MAX_BACKUP_RETENTION_COUNT;
export const DEFAULT_BACKUP_RETENTION = DEFAULT_BACKUP_RETENTION_COUNT;
export const BACKUP_INTERVAL_VALUES: readonly BackupIntervalMinutes[] = BACKUP_INTERVAL_OPTIONS;
export const DEFAULT_BACKUP_SCHEDULE: BackupSchedule = {
  mode: 'daily',
  hour: DEFAULT_BACKUP_DAILY_HOUR,
  minute: DEFAULT_BACKUP_DAILY_MINUTE,
};
export const DEFAULT_BACKUP_WEEKDAY_VALUE: BackupWeekday = DEFAULT_BACKUP_WEEKDAY;

export const STORAGE_SCHEMA_VERSION = SCHEMA_VERSION;
