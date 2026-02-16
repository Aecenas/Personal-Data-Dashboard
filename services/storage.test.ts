import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: {},
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  mkdir: vi.fn(),
  exists: vi.fn(),
  readDir: vi.fn(),
  remove: vi.fn(),
}));

import { storageMigration } from './storage';

describe('storage migration', () => {
  it('migrates legacy payload to latest schema with backup defaults', () => {
    const legacy = {
      theme: 'dark',
      activeGroup: 'Infrastructure',
      cards: [
        {
          id: 'card-1',
          title: 'CPU',
          group: 'Infra',
          type: 'scalar',
          script_config: {
            path: '/tmp/cpu.py',
            args: ['--mock'],
          },
          mapping_config: {
            value_key: 'metrics.value',
            unit_key: 'metrics.unit',
          },
          ui_config: {
            color_theme: 'blue',
            size: '1x1',
            x: 1,
            y: 2,
          },
          status: {
            is_deleted: false,
            deleted_at: null,
          },
          runtimeData: {
            payload: { value: 99, unit: '%' },
            lastUpdated: 12345,
          },
        },
      ],
      section_markers: [
        {
          id: 'sec-1',
          title: ' Core ',
          group: 'Infra',
          after_row: 2.8,
          start_col: -1,
          span_col: 10,
        },
      ],
    };

    const migrated = storageMigration.migrateToLatest(legacy);

    expect(migrated.schema_version).toBe(5);
    expect(migrated.language).toBe('zh-CN');
    expect(migrated.dashboard_columns).toBe(4);
    expect(migrated.adaptive_window_enabled).toBe(true);
    expect(migrated.refresh_concurrency_limit).toBe(4);
    expect(migrated.execution_history_limit).toBe(120);
    expect(migrated.activeGroup).toBe('Infra');
    expect(migrated.groups).toEqual([
      { id: 'G1', name: 'Infra', order: 0 },
    ]);
    expect(migrated.cards).toHaveLength(1);
    expect(migrated.section_markers).toEqual([
      {
        id: 'sec-1',
        title: 'Core',
        group: 'Infra',
        after_row: 2,
        start_col: 0,
        span_col: 4,
        line_color: 'primary',
        line_style: 'dashed',
        line_width: 2,
        label_align: 'center',
      },
    ]);
    expect(migrated.backup_config).toEqual({
      directory: undefined,
      retention_count: 5,
      auto_backup_enabled: true,
      schedule: {
        mode: 'daily',
        hour: 3,
        minute: 0,
      },
    });

    const card = migrated.cards[0];
    expect(card.refresh_config.timeout_ms).toBe(10000);
    expect(card.status.sort_order).toBe(1);
    expect(card.mapping_config.scalar?.value_key).toBe('metrics.value');
    expect(card.cache_data?.last_success_payload).toEqual({ value: 99, unit: '%' });
    expect(card.alert_config).toEqual({
      enabled: false,
      cooldown_sec: 300,
      status_change_enabled: true,
      upper_threshold: undefined,
      lower_threshold: undefined,
    });
    expect(card.alert_state).toEqual({
      last_status_state: undefined,
      condition_last_trigger_at: {},
    });
    expect(card.execution_history).toBeUndefined();
  });

  it('keeps gauge type and default gauge mapping keys', () => {
    const migrated = storageMigration.migrateToLatest({
      cards: [
        {
          id: 'gauge-1',
          title: 'Disk usage',
          group: 'Infra',
          type: 'gauge',
          script_config: {
            path: '/tmp/disk.py',
            args: [],
          },
        },
      ],
    });

    const card = migrated.cards[0];
    expect(card.type).toBe('gauge');
    expect(card.mapping_config.gauge).toEqual({
      min_key: 'min',
      max_key: 'max',
      value_key: 'value',
      unit_key: 'unit',
    });
  });

  it('keeps explicit group list and appends card-derived groups', () => {
    const migrated = storageMigration.migrateToLatest({
      activeGroup: 'Ops',
      groups: [
        { name: 'Ops', order: 2 },
        { name: 'Infra', order: 1 },
      ],
      cards: [
        {
          id: 'card-1',
          title: 'CPU',
          group: 'Infra',
          type: 'scalar',
          script_config: {
            path: '/tmp/cpu.py',
            args: [],
          },
        },
        {
          id: 'card-2',
          title: 'Queue',
          group: 'Queue',
          type: 'scalar',
          script_config: {
            path: '/tmp/queue.py',
            args: [],
          },
        },
      ],
    });

    expect(migrated.groups).toEqual([
      { id: 'G1', name: 'Infra', order: 0 },
      { id: 'G2', name: 'Ops', order: 1 },
      { id: 'G3', name: 'Queue', order: 2 },
    ]);
    expect(migrated.activeGroup).toBe('Ops');
  });

  it('normalizes persisted execution history when migrating', () => {
    const migrated = storageMigration.migrateToLatest({
      schema_version: 1,
      execution_history_limit: 80,
      cards: [
        {
          id: 'card-1',
          title: 'CPU',
          group: 'Infra',
          type: 'scalar',
          script_config: {
            path: '/tmp/cpu.py',
            args: [],
          },
          execution_history: {
            capacity: 3,
            size: 3,
            next_index: 1,
            entries: [
              { executed_at: 1000, duration_ms: 120, ok: true, timed_out: false, exit_code: 0 },
              {
                executed_at: 2000,
                duration_ms: 140,
                ok: false,
                timed_out: true,
                exit_code: null,
                error_summary: 'timeout',
              },
              { executed_at: 3000, duration_ms: 160, ok: true, timed_out: false, exit_code: 0 },
            ],
          },
        },
      ],
    });

    expect(migrated.cards[0].execution_history).toEqual({
      capacity: 80,
      size: 3,
      next_index: 3,
      entries: [
        {
          executed_at: 1000,
          duration_ms: 120,
          ok: true,
          timed_out: false,
          exit_code: 0,
          error_summary: undefined,
        },
        {
          executed_at: 2000,
          duration_ms: 140,
          ok: false,
          timed_out: true,
          exit_code: null,
          error_summary: 'timeout',
        },
        {
          executed_at: 3000,
          duration_ms: 160,
          ok: true,
          timed_out: false,
          exit_code: 0,
          error_summary: undefined,
        },
      ],
    });
    expect(migrated.execution_history_limit).toBe(80);
  });
});

describe('import validation', () => {
  it('rejects non-object JSON payload', () => {
    expect(() => storageMigration.validateImportStructure([])).toThrowError(
      '导入失败：JSON 根节点必须是对象。',
    );
  });

  it('rejects invalid cards field type', () => {
    expect(() => storageMigration.validateImportStructure({ cards: 'bad' })).toThrowError(
      '导入失败：字段“cards”必须是数组。',
    );
  });

  it('rejects invalid schema version', () => {
    expect(() => storageMigration.validateImportStructure({ schema_version: -1 })).toThrowError(
      '导入失败：schema_version 必须是正整数。',
    );
  });
});

describe('backup helpers', () => {
  it('normalizes backup retention and schedule', () => {
    expect(storageMigration.clampBackupRetentionCount(0)).toBe(3);
    expect(storageMigration.clampBackupRetentionCount(999)).toBe(20);
    expect(storageMigration.clampBackupRetentionCount(5)).toBe(5);
    expect(storageMigration.normalizeIntervalMinutes(1)).toBe(60);
    expect(storageMigration.normalizeIntervalMinutes(30)).toBe(30);

    expect(storageMigration.normalizeBackupSchedule({ mode: 'daily', hour: 25, minute: 99 })).toEqual({
      mode: 'daily',
      hour: 3,
      minute: 0,
    });
    expect(storageMigration.normalizeBackupSchedule({ mode: 'interval', every_minutes: 180 })).toEqual({
      mode: 'interval',
      every_minutes: 180,
    });
    expect(
      storageMigration.normalizeBackupSchedule(
        { mode: 'weekly', weekday: 4, hour: 10, minute: 30 },
        '04:15',
      ),
    ).toEqual({
      mode: 'weekly',
      weekday: 4,
      hour: 10,
      minute: 30,
    });
    expect(storageMigration.normalizeBackupSchedule(undefined, '09:05')).toEqual({
      mode: 'daily',
      hour: 9,
      minute: 5,
    });
    expect(
      storageMigration.normalizeBackupConfig({
        auto_backup_enabled: false,
        retention_count: 9,
        schedule: { mode: 'interval', every_minutes: 30 },
      }),
    ).toEqual({
      directory: undefined,
      retention_count: 9,
      auto_backup_enabled: false,
      schedule: { mode: 'interval', every_minutes: 30 },
    });
  });

  it('rotates backup files by retention count', () => {
    const files = [
      'backup-20260216-010101.json',
      'backup-20260216-020202.json',
      'backup-20260216-030303.json',
      'backup-20260216-040404.json',
      'manual-note.txt',
    ];

    expect(storageMigration.getBackupFilesToDelete(files, 3)).toEqual(['backup-20260216-010101.json']);
  });
});
