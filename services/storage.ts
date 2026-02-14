import { BaseDirectory, readTextFile, writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import { AppLanguage, AppSettings, Card, MappingConfig, RefreshConfig } from '../types';
import { t } from '../i18n';
import { ensureCardLayoutScopes } from '../layout';

const POINTER_FILENAME = 'storage_config.json';
const DATA_FILENAME = 'user_settings.json';
const DEFAULT_SUBDIR = 'data';
const SCHEMA_VERSION = 1;

interface StorageConfig {
  customPath: string | null;
}

const isTauri = () => typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
const getLanguage = (): AppLanguage =>
  typeof document !== 'undefined' && document.documentElement.lang === 'zh-CN' ? 'zh-CN' : 'en-US';
const tr = (key: string) => t(getLanguage(), key);

const normalizeLanguage = (value: unknown): AppLanguage => (value === 'zh-CN' ? 'zh-CN' : 'en-US');

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

  return {
    status: {
      label_key: 'label',
      state_key: 'state',
      message_key: 'message',
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

const normalizeCard = (rawCard: any, index: number): Card => {
  const cardType: Card['type'] =
    rawCard?.type === 'scalar' || rawCard?.type === 'series' || rawCard?.type === 'status'
      ? rawCard.type
      : 'scalar';

  const mapping = normalizeMapping(rawCard?.mapping_config, cardType);

  const cacheFromLegacy = deriveCacheFromLegacyRuntime(rawCard?.runtimeData);

  const card: Card = {
    id: String(rawCard?.id ?? crypto.randomUUID()),
    title: String(rawCard?.title ?? `Card ${index + 1}`),
    group: String(rawCard?.group ?? 'Default'),
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
    ui_config: {
      color_theme: rawCard?.ui_config?.color_theme ?? 'default',
      size: rawCard?.ui_config?.size ?? '1x1',
      x: Number(rawCard?.ui_config?.x ?? 0),
      y: Number(rawCard?.ui_config?.y ?? 0),
    },
    layout_positions:
      rawCard?.layout_positions && typeof rawCard.layout_positions === 'object'
        ? rawCard.layout_positions
        : undefined,
    status: {
      is_deleted: Boolean(rawCard?.status?.is_deleted),
      deleted_at: rawCard?.status?.deleted_at ? String(rawCard.status.deleted_at) : null,
      sort_order: Number(rawCard?.status?.sort_order ?? index + 1),
    },
    cache_data: rawCard?.cache_data ?? cacheFromLegacy,
  };

  return ensureCardLayoutScopes(card);
};

const migrateToV1 = (input: any): AppSettings => {
  const cardsRaw = Array.isArray(input?.cards) ? input.cards : [];
  const cards = cardsRaw.map((card: any, index: number) => normalizeCard(card, index));

  return {
    schema_version: SCHEMA_VERSION,
    theme: input?.theme === 'light' ? 'light' : 'dark',
    language: normalizeLanguage(input?.language),
    activeGroup: typeof input?.activeGroup === 'string' ? input.activeGroup : 'All',
    cards,
    default_python_path:
      typeof input?.default_python_path === 'string' ? input.default_python_path : undefined,
  };
};

const sanitizeForSave = (settings: AppSettings): AppSettings => {
  const cards = settings.cards.map((card, index) => {
    const normalizedCard = ensureCardLayoutScopes(card);
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
      runtimeData: undefined,
    };
  });

  return {
    schema_version: SCHEMA_VERSION,
    theme: settings.theme === 'light' ? 'light' : 'dark',
    language: normalizeLanguage((settings as Partial<AppSettings>).language),
    activeGroup: typeof settings.activeGroup === 'string' ? settings.activeGroup : 'All',
    default_python_path: settings.default_python_path,
    cards,
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

export const storageService = {
  async getCurrentDataPath(): Promise<string> {
    if (!isTauri()) return tr('storage.path.browser');

    try {
      if (await exists(POINTER_FILENAME, { baseDir: BaseDirectory.AppLocalData })) {
        const content = await readTextFile(POINTER_FILENAME, { baseDir: BaseDirectory.AppLocalData });
        const config = JSON.parse(content) as StorageConfig;
        if (config.customPath) return config.customPath;
      }
      return tr('storage.path.default');
    } catch {
      return tr('storage.path.default');
    }
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
    const payload = JSON.stringify(sanitizeForSave(settings), null, 2);

    if (!isTauri()) return;

    const location = await resolveDataPath();
    if (location.baseDir) {
      await mkdir(DEFAULT_SUBDIR, { baseDir: location.baseDir, recursive: true });
      await writeTextFile(location.path, payload, { baseDir: location.baseDir });
      return;
    }

    await writeTextFile(location.path, payload);
  },

  async load(): Promise<AppSettings | null> {
    if (!isTauri()) return null;

    try {
      const location = await resolveDataPath();
      let content = '';

      if (location.baseDir) {
        if (!(await exists(location.path, { baseDir: location.baseDir }))) return null;
        content = await readTextFile(location.path, { baseDir: location.baseDir });
      } else {
        content = await readTextFile(location.path);
      }

      const parsed = JSON.parse(content);
      if (parsed?.schema_version === SCHEMA_VERSION) {
        return sanitizeForSave(parsed as AppSettings);
      }

      return migrateToV1(parsed);
    } catch (error) {
      console.error('Failed to load settings from disk', error);
      return null;
    }
  },
};

export const storageMigration = {
  migrateToV1,
};
