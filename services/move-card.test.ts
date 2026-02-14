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

const setCards = (cards: Card[]) => {
  useStore.setState({ cards });
};

const getPosition = (id: string) => {
  const card = useStore.getState().cards.find((item) => item.id === id);
  if (!card) throw new Error(`Missing card: ${id}`);
  return getCardLayoutPosition(card, undefined);
};

describe('moveCard smart collision handling', () => {
  beforeEach(() => {
    useStore.setState({ cards: [], activeGroup: 'All', isEditMode: false });
  });

  it('swaps positions when blocked by a same-size card', () => {
    setCards([createCard('A', 0, 0, '1x1'), createCard('B', 1, 0, '1x1')]);

    useStore.getState().moveCard('A', 1, 0, undefined);

    expect(getPosition('A')).toEqual({ x: 1, y: 0 });
    expect(getPosition('B')).toEqual({ x: 0, y: 0 });
  });

  it('jumps over a differently sized blocking card', () => {
    setCards([createCard('A', 0, 0, '1x1'), createCard('B', 1, 0, '2x1')]);

    useStore.getState().moveCard('A', 1, 0, undefined);

    expect(getPosition('A')).toEqual({ x: 3, y: 0 });
    expect(getPosition('B')).toEqual({ x: 1, y: 0 });
  });

  it('keeps position when more than one card blocks in the move direction', () => {
    setCards([createCard('A', 0, 0, '1x1'), createCard('B', 1, 0, '2x1'), createCard('C', 3, 0, '1x1')]);

    useStore.getState().moveCard('A', 1, 0, undefined);

    expect(getPosition('A')).toEqual({ x: 0, y: 0 });
    expect(getPosition('B')).toEqual({ x: 1, y: 0 });
    expect(getPosition('C')).toEqual({ x: 3, y: 0 });
  });
});
