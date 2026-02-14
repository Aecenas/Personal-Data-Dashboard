import { describe, expect, it } from 'vitest';
import { Card } from '../types';
import {
  ALL_LAYOUT_SCOPE,
  ensureCardLayoutScopes,
  getCardLayoutPosition,
  resolveLayoutScope,
  setCardLayoutPosition,
} from '../layout';

const createBaseCard = (): Card => ({
  id: 'card-1',
  title: 'CPU',
  group: 'Infra',
  type: 'scalar',
  script_config: {
    path: '/tmp/demo.py',
    args: [],
  },
  mapping_config: {},
  refresh_config: {
    interval_sec: 0,
    refresh_on_start: true,
    refresh_on_resume: true,
    timeout_ms: 10000,
  },
  ui_config: {
    color_theme: 'default',
    size: '1x1',
    x: 1,
    y: 2,
  },
  status: {
    is_deleted: false,
    deleted_at: null,
    sort_order: 1,
  },
});

describe('layout scopes', () => {
  it('ensures all and group scope from legacy ui position', () => {
    const card = ensureCardLayoutScopes(createBaseCard());
    expect(card.layout_positions?.[ALL_LAYOUT_SCOPE]).toEqual({ x: 1, y: 2 });
    expect(card.layout_positions?.[resolveLayoutScope('Infra')]).toEqual({ x: 1, y: 2 });
  });

  it('uses independent position for group without changing all scope', () => {
    const base = ensureCardLayoutScopes(createBaseCard());
    const movedInGroup = setCardLayoutPosition(base, 'Infra', { x: 3, y: 4 });

    expect(getCardLayoutPosition(movedInGroup, 'Infra')).toEqual({ x: 3, y: 4 });
    expect(getCardLayoutPosition(movedInGroup, 'All')).toEqual({ x: 1, y: 2 });
    expect(movedInGroup.ui_config.x).toBe(1);
    expect(movedInGroup.ui_config.y).toBe(2);
  });

  it('updates legacy ui_config when moving in all scope', () => {
    const base = ensureCardLayoutScopes(createBaseCard());
    const movedInAll = setCardLayoutPosition(base, undefined, { x: 6, y: 7 });

    expect(getCardLayoutPosition(movedInAll, 'All')).toEqual({ x: 6, y: 7 });
    expect(movedInAll.ui_config.x).toBe(6);
    expect(movedInAll.ui_config.y).toBe(7);
  });
});
