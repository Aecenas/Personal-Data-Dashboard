import { beforeEach, describe, expect, it } from 'vitest';
import { getCardLayoutPosition } from '../layout';
import { useStore } from '../store';
import { Card } from '../types';

const createCard = (id: string, x: number, y: number, size: Card['ui_config']['size']): Card => ({
  id,
  title: id,
  group: 'Group A',
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
    size,
    x,
    y,
  },
  status: {
    is_deleted: false,
    deleted_at: null,
    sort_order: 1,
  },
});

const hasCollision = (cards: Card[], columns: number) => {
  const rects = cards
    .filter((card) => !card.status.is_deleted)
    .map((card) => {
      const position = getCardLayoutPosition(card, undefined);
      const width = card.ui_config.size.startsWith('2') ? 2 : 1;
      const height = card.ui_config.size.endsWith('2') ? 2 : 1;
      return {
        id: card.id,
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

const getCardById = (id: string): Card => {
  const card = useStore.getState().cards.find((item) => item.id === id);
  if (!card) throw new Error(`Missing card: ${id}`);
  return card;
};

const resizeCard = (id: string, size: Card['ui_config']['size']) => {
  const current = getCardById(id);
  useStore.getState().updateCard(id, {
    ui_config: {
      ...current.ui_config,
      size,
    },
  });
};

describe('updateCard size relayout', () => {
  beforeEach(() => {
    useStore.setState({
      cards: [],
      sectionMarkers: [],
      dashboardColumns: 4,
      activeGroup: 'Group A',
      isEditMode: false,
    });
  });

  it('relocates resized card when non-edit mode resize causes overlap', () => {
    useStore.setState({
      cards: [createCard('A', 0, 0, '1x1'), createCard('B', 1, 0, '1x1')],
    });

    resizeCard('A', '2x1');

    const movedCard = getCardById('A');
    const position = getCardLayoutPosition(movedCard, undefined);
    expect(position).not.toEqual({ x: 0, y: 0 });
    expect(hasCollision(useStore.getState().cards, 4)).toBe(false);
  });

  it('relocates resized card when non-edit mode resize causes out-of-bounds', () => {
    useStore.setState({
      cards: [createCard('A', 3, 0, '1x1'), createCard('B', 0, 0, '1x1')],
    });

    resizeCard('A', '2x1');

    const movedCard = getCardById('A');
    const position = getCardLayoutPosition(movedCard, undefined);
    expect(position.x + 2).toBeLessThanOrEqual(4);
    expect(position).not.toEqual({ x: 3, y: 0 });
    expect(hasCollision(useStore.getState().cards, 4)).toBe(false);
  });
});
