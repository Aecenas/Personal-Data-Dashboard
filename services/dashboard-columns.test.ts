import { beforeEach, describe, expect, it } from 'vitest';
import { Card } from '../types';
import { useStore } from '../store';
import { getCardLayoutPosition } from '../layout';

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

describe('dashboard columns', () => {
  beforeEach(() => {
    useStore.setState({
      cards: [],
      sectionMarkers: [],
      dashboardColumns: 4,
      activeGroup: 'Default',
      isEditMode: false,
    });
  });

  it('reflows card layouts when reducing column count', () => {
    useStore.setState({
      cards: [
        createCard('A', 0, 0, '1x1'),
        createCard('B', 3, 0, '1x1'),
        createCard('C', 2, 1, '2x1'),
      ],
    });

    useStore.getState().setDashboardColumns(2);

    const { cards, dashboardColumns } = useStore.getState();
    expect(dashboardColumns).toBe(2);
    expect(hasCollision(cards, 2)).toBe(false);
  });

  it('renormalizes section markers when column count changes', () => {
    useStore.getState().addSectionMarker({
      title: 'Section',
      group: 'Group A',
      after_row: 0,
      start_col: 3,
      span_col: 4,
    });

    useStore.getState().setDashboardColumns(2);

    const marker = useStore.getState().sectionMarkers[0];
    expect(marker.start_col).toBe(1);
    expect(marker.span_col).toBe(1);
  });
});
