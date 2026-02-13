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
    };

    const migrated = storageMigration.migrateToV1(legacy);

    expect(migrated.schema_version).toBe(1);
    expect(migrated.activeGroup).toBe('Infrastructure');
    expect(migrated.cards).toHaveLength(1);

    const card = migrated.cards[0];
    expect(card.refresh_config.timeout_ms).toBe(10000);
    expect(card.status.sort_order).toBe(1);
    expect(card.mapping_config.scalar?.value_key).toBe('metrics.value');
    expect(card.cache_data?.last_success_payload).toEqual({ value: 99, unit: '%' });
  });
});
