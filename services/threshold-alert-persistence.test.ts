import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { AppSettings, Card } from '../types';
import { useStore } from '../store';
import { executionService } from './execution';
import { notificationService } from './notification';
import { storageService } from './storage';

const createScalarCard = (
  overrides: Partial<Card> & Pick<Card, 'id' | 'title'>,
): Card => ({
  id: overrides.id,
  title: overrides.title,
  group: overrides.group ?? 'Default',
  type: 'scalar',
  script_config: {
    path: '/tmp/demo.py',
    args: [],
  },
  mapping_config: {},
  refresh_config: {
    interval_sec: 0,
    refresh_on_start: false,
    refresh_on_resume: false,
    timeout_ms: 10000,
  },
  ui_config: {
    color_theme: 'default',
    size: '1x1',
    x: 0,
    y: 0,
  },
  status: {
    is_deleted: false,
    deleted_at: null,
    sort_order: 1,
  },
  alert_config: {
    enabled: true,
    cooldown_sec: 300,
    status_change_enabled: true,
    upper_threshold: 90,
  },
  alert_state: {
    condition_last_trigger_at: {},
  },
  ...overrides,
});

const createSettings = (cards: Card[]): AppSettings => ({
  schema_version: 6,
  theme: 'light',
  language: 'zh-CN',
  dashboard_columns: 4,
  adaptive_window_enabled: true,
  refresh_concurrency_limit: 4,
  execution_history_limit: 120,
  backup_config: {
    directory: undefined,
    retention_count: 5,
    auto_backup_enabled: true,
    schedule: {
      mode: 'daily',
      hour: 3,
      minute: 0,
    },
  },
  interaction_sound: {
    enabled: true,
    volume: 65,
    engine: 'web_audio_native_v1',
  },
  activeGroup: 'Default',
  groups: [{ id: 'G1', name: 'Default', order: 0 }],
  cards,
  section_markers: [],
  default_python_path: undefined,
});

describe('threshold alert UI persistence', () => {
  beforeEach(() => {
    useStore.setState({
      cards: [],
      isInitialized: false,
      activeGroup: 'Default',
      groups: [{ id: 'G1', name: 'Default', order: 0 }],
      sectionMarkers: [],
      refreshConcurrencyLimit: 4,
      executionHistoryLimit: 120,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps threshold alert UI active when value still exceeds threshold during cooldown', async () => {
    const now = 100_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    vi.spyOn(executionService, 'runCard').mockResolvedValue({
      ok: true,
      payload: { value: 95, unit: '%' },
      rawStdout: '{"type":"scalar","data":{"value":95,"unit":"%"}}',
      rawStderr: '',
      timedOut: false,
      exitCode: 0,
      durationMs: 23,
    });
    const sendNotificationSpy = vi
      .spyOn(notificationService, 'sendDesktopNotification')
      .mockResolvedValue(true);

    useStore.setState({
      isInitialized: true,
      cards: [
        createScalarCard({
          id: 'card-1',
          title: 'CPU',
          alert_state: {
            condition_last_trigger_at: {
              'threshold:upper': 95_000,
            },
          },
          cache_data: {
            last_success_payload: { value: 95, unit: '%' },
            last_success_at: 95_000,
          },
          runtimeData: {
            state: 'success',
            isLoading: false,
            source: 'live',
            payload: { value: 95, unit: '%' },
            thresholdAlertTriggered: true,
            lastUpdated: 95_000,
          },
        }),
      ],
    });

    await useStore.getState().refreshCard('card-1');

    const card = useStore.getState().cards.find((item) => item.id === 'card-1');
    expect(card?.runtimeData?.thresholdAlertTriggered).toBe(true);
    expect(card?.alert_state?.condition_last_trigger_at['threshold:upper']).toBe(95_000);
    expect(sendNotificationSpy).not.toHaveBeenCalled();
  });

  it('restores threshold alert UI from cached payload on initialization', async () => {
    const persisted = createSettings([
      createScalarCard({
        id: 'card-1',
        title: 'CPU',
        cache_data: {
          last_success_payload: { value: 94, unit: '%' },
          last_success_at: 88_000,
        },
        runtimeData: undefined,
      }),
    ]);

    vi.spyOn(storageService, 'getCurrentDataPath').mockResolvedValue('/tmp/settings.json');
    vi.spyOn(storageService, 'load').mockResolvedValue(persisted);
    vi.spyOn(storageService, 'save').mockResolvedValue(undefined);

    await useStore.getState().initializeStore();

    const card = useStore.getState().cards.find((item) => item.id === 'card-1');
    expect(card?.runtimeData?.source).toBe('cache');
    expect(card?.runtimeData?.thresholdAlertTriggered).toBe(true);
  });
});
