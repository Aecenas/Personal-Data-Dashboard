import { beforeEach, describe, expect, it } from 'vitest';
import { Card, GroupEntity, SectionMarker } from '../types';
import { useStore } from '../store';
import { getCardLayoutPosition } from '../layout';

const createGroups = (...names: string[]): GroupEntity[] =>
  names.map((name, order) => ({ id: `G${order + 1}`, name, order }));

const createCard = (
  id: string,
  group: string,
  x: number,
  y: number,
  deleted = false,
): Card => ({
  id,
  title: id,
  group,
  type: 'scalar',
  script_config: {
    path: '/tmp/demo.py',
    args: [],
  },
  mapping_config: {},
  refresh_config: {
    interval_sec: 30,
    refresh_on_start: false,
    refresh_on_resume: false,
    timeout_ms: 10000,
  },
  ui_config: {
    color_theme: 'default',
    size: '1x1',
    x,
    y,
  },
  status: {
    is_deleted: deleted,
    deleted_at: deleted ? '2026-01-01T00:00:00.000Z' : null,
    sort_order: 1,
  },
});

const createSection = (id: string, group: string): SectionMarker => ({
  id,
  title: id,
  group,
  after_row: 0,
  start_col: 0,
  span_col: 1,
  line_color: 'primary',
  line_style: 'dashed',
  line_width: 2,
  label_align: 'center',
});

const hasGroupCollision = (cards: Card[], group: string, columns: number) => {
  const rects = cards
    .filter((card) => !card.status.is_deleted && card.group === group)
    .map((card) => {
      const position = getCardLayoutPosition(card, group);
      const width = card.ui_config.size.startsWith('2') ? 2 : 1;
      const height = card.ui_config.size.endsWith('2') ? 2 : 1;
      return {
        x: position.x,
        y: position.y,
        w: width,
        h: height,
      };
    });

  for (const rect of rects) {
    if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > columns) return true;
  }

  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i];
      const b = rects[j];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
        return true;
      }
    }
  }

  return false;
};

describe('group batch actions', () => {
  beforeEach(() => {
    useStore.setState({
      cards: [],
      sectionMarkers: [],
      groups: createGroups('Infra', 'Ops'),
      activeGroup: 'Infra',
      dashboardColumns: 4,
      isEditMode: false,
    });
  });

  it('moves selected cards and sections to target group without overlap', () => {
    useStore.setState({
      cards: [
        createCard('A', 'Infra', 0, 0),
        createCard('B', 'Infra', 1, 0),
        createCard('C', 'Ops', 0, 0),
      ],
      sectionMarkers: [createSection('sec-1', 'Infra')],
    });

    const result = useStore.getState().executeGroupBatchAction({
      type: 'move_group',
      sourceGroup: 'Infra',
      targetGroup: 'Ops',
      cardIds: ['A'],
      sectionIds: ['sec-1'],
    });

    expect(result.successCards).toBe(1);
    expect(result.successSections).toBe(1);
    expect(result.failures).toEqual([]);

    const state = useStore.getState();
    expect(state.cards.find((card) => card.id === 'A')?.group).toBe('Ops');
    expect(state.sectionMarkers.find((section) => section.id === 'sec-1')?.group).toBe('Ops');
    expect(hasGroupCollision(state.cards, 'Ops', state.dashboardColumns)).toBe(false);
  });

  it('updates interval for selected cards and reports unsupported section edits', () => {
    useStore.setState({
      cards: [createCard('A', 'Infra', 0, 0), createCard('B', 'Infra', 1, 0)],
      sectionMarkers: [createSection('sec-1', 'Infra')],
    });

    const result = useStore.getState().executeGroupBatchAction({
      type: 'update_interval',
      sourceGroup: 'Infra',
      intervalSec: 120,
      cardIds: ['A'],
      sectionIds: ['sec-1'],
    });

    expect(result.successCards).toBe(1);
    expect(result.successSections).toBe(0);
    expect(result.failures).toEqual([
      { entity: 'section', id: 'sec-1', reason: 'section_operation_unsupported' },
    ]);
    expect(useStore.getState().cards.find((card) => card.id === 'A')?.refresh_config.interval_sec).toBe(120);
    expect(useStore.getState().cards.find((card) => card.id === 'B')?.refresh_config.interval_sec).toBe(30);
  });

  it('soft deletes selected cards and removes selected sections while skipping recycle-bin cards', () => {
    useStore.setState({
      cards: [
        createCard('A', 'Infra', 0, 0),
        createCard('B', 'Infra', 1, 0, true),
        createCard('C', 'Ops', 0, 0),
      ],
      sectionMarkers: [createSection('sec-1', 'Infra'), createSection('sec-2', 'Infra')],
    });

    const result = useStore.getState().executeGroupBatchAction({
      type: 'soft_delete',
      sourceGroup: 'Infra',
      cardIds: ['A', 'B', 'missing-card'],
      sectionIds: ['sec-1', 'missing-section'],
    });

    expect(result.successCards).toBe(1);
    expect(result.successSections).toBe(1);
    expect(result.failures).toEqual([
      { entity: 'card', id: 'B', reason: 'card_deleted' },
      { entity: 'card', id: 'missing-card', reason: 'card_not_found' },
      { entity: 'section', id: 'missing-section', reason: 'section_not_found' },
    ]);

    const state = useStore.getState();
    expect(state.cards.find((card) => card.id === 'A')?.status.is_deleted).toBe(true);
    expect(state.cards.find((card) => card.id === 'B')?.status.is_deleted).toBe(true);
    expect(state.sectionMarkers.some((section) => section.id === 'sec-1')).toBe(false);
    expect(state.sectionMarkers.some((section) => section.id === 'sec-2')).toBe(true);
  });

  it('duplicates visible cards to target group and keeps target layout collision-free', () => {
    useStore.setState({
      cards: [createCard('A', 'Infra', 0, 0), createCard('C', 'Ops', 0, 0)],
    });

    const result = useStore.getState().duplicateCardsToGroup('Infra', 'Ops', ['A']);

    expect(result.successCards).toBe(1);
    expect(result.failures).toEqual([]);

    const state = useStore.getState();
    const copied = state.cards.filter((card) => card.group === 'Ops' && card.title.includes('(Copy)'));
    expect(copied).toHaveLength(1);
    expect(hasGroupCollision(state.cards, 'Ops', state.dashboardColumns)).toBe(false);
  });

  it('duplicates one card with custom title and target group', () => {
    useStore.setState({
      cards: [createCard('A', 'Infra', 0, 0)],
      groups: createGroups('Infra', 'Ops'),
    });

    const result = useStore.getState().duplicateCard('A', {
      title: 'A_Copy_Custom',
      group: 'Ops',
    });

    expect(result.ok).toBe(true);
    const state = useStore.getState();
    const duplicated = state.cards.find((card) => card.title === 'A_Copy_Custom');
    expect(duplicated).toBeDefined();
    expect(duplicated?.group).toBe('Ops');
    expect(duplicated?.business_id?.startsWith('G2-C')).toBe(true);
  });
});
