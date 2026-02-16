import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: {},
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  mkdir: vi.fn(),
  exists: vi.fn(),
}));

import { storageMigration } from './storage';

describe('storage migration', () => {
  it('migrates v0 payload to v1 schema', () => {
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

    const migrated = storageMigration.migrateToV1(legacy);

    expect(migrated.schema_version).toBe(1);
    expect(migrated.language).toBe('en-US');
    expect(migrated.dashboard_columns).toBe(4);
    expect(migrated.adaptive_window_enabled).toBe(true);
    expect(migrated.refresh_concurrency_limit).toBe(4);
    expect(migrated.activeGroup).toBe('Infrastructure');
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

    const card = migrated.cards[0];
    expect(card.refresh_config.timeout_ms).toBe(10000);
    expect(card.status.sort_order).toBe(1);
    expect(card.mapping_config.scalar?.value_key).toBe('metrics.value');
    expect(card.cache_data?.last_success_payload).toEqual({ value: 99, unit: '%' });
  });

  it('keeps gauge type and default gauge mapping keys', () => {
    const migrated = storageMigration.migrateToV1({
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
});
