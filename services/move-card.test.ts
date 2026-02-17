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
    useStore.setState({ cards: [], activeGroup: 'Group A', isEditMode: false, dashboardColumns: 6 });
  });

  it('swaps positions with same-size blocker in all directions', () => {
    const cases = [
      {
        name: 'right',
        a: { x: 0, y: 0 },
        b: { x: 1, y: 0 },
        target: { x: 1, y: 0 },
      },
      {
        name: 'left',
        a: { x: 2, y: 0 },
        b: { x: 1, y: 0 },
        target: { x: 1, y: 0 },
      },
      {
        name: 'down',
        a: { x: 0, y: 0 },
        b: { x: 0, y: 1 },
        target: { x: 0, y: 1 },
      },
      {
        name: 'up',
        a: { x: 0, y: 2 },
        b: { x: 0, y: 1 },
        target: { x: 0, y: 1 },
      },
    ];

    cases.forEach((scenario) => {
      setCards([
        createCard('A', scenario.a.x, scenario.a.y, '1x1'),
        createCard('B', scenario.b.x, scenario.b.y, '1x1'),
      ]);

      const moved = useStore.getState().moveCard('A', scenario.target.x, scenario.target.y, undefined);

      expect(moved, scenario.name).toBe(true);
      expect(getPosition('A'), scenario.name).toEqual(scenario.b);
      expect(getPosition('B'), scenario.name).toEqual(scenario.a);
    });
  });

  it('jumps over adjacent differently sized blocker in all directions', () => {
    const cases = [
      {
        name: 'right',
        a: { x: 0, y: 0, size: '1x1' as const },
        b: { x: 1, y: 0, size: '2x1' as const },
        target: { x: 1, y: 0 },
        expectedA: { x: 3, y: 0 },
      },
      {
        name: 'left',
        a: { x: 4, y: 0, size: '1x1' as const },
        b: { x: 2, y: 0, size: '2x1' as const },
        target: { x: 3, y: 0 },
        expectedA: { x: 1, y: 0 },
      },
      {
        name: 'down',
        a: { x: 0, y: 0, size: '1x1' as const },
        b: { x: 0, y: 1, size: '1x2' as const },
        target: { x: 0, y: 1 },
        expectedA: { x: 0, y: 3 },
      },
      {
        name: 'up',
        a: { x: 0, y: 4, size: '1x1' as const },
        b: { x: 0, y: 2, size: '1x2' as const },
        target: { x: 0, y: 3 },
        expectedA: { x: 0, y: 1 },
      },
    ];

    cases.forEach((scenario) => {
      setCards([
        createCard('A', scenario.a.x, scenario.a.y, scenario.a.size),
        createCard('B', scenario.b.x, scenario.b.y, scenario.b.size),
      ]);

      const moved = useStore.getState().moveCard('A', scenario.target.x, scenario.target.y, undefined);

      expect(moved, scenario.name).toBe(true);
      expect(getPosition('A'), scenario.name).toEqual(scenario.expectedA);
      expect(getPosition('B'), scenario.name).toEqual({ x: scenario.b.x, y: scenario.b.y });
    });
  });

  it('jumps over the adjacent blocker even when farther blockers exist', () => {
    setCards([
      createCard('A', 0, 0, '1x1'),
      createCard('B', 1, 0, '2x1'),
      createCard('C', 5, 0, '1x1'),
    ]);

    const moved = useStore.getState().moveCard('A', 1, 0, undefined);

    expect(moved).toBe(true);
    expect(getPosition('A')).toEqual({ x: 3, y: 0 });
    expect(getPosition('B')).toEqual({ x: 1, y: 0 });
    expect(getPosition('C')).toEqual({ x: 5, y: 0 });
  });

  it('keeps position when jump target is occupied', () => {
    setCards([createCard('A', 0, 0, '1x1'), createCard('B', 1, 0, '2x1'), createCard('C', 3, 0, '1x1')]);

    const moved = useStore.getState().moveCard('A', 1, 0, undefined);

    expect(moved).toBe(false);
    expect(getPosition('A')).toEqual({ x: 0, y: 0 });
    expect(getPosition('B')).toEqual({ x: 1, y: 0 });
    expect(getPosition('C')).toEqual({ x: 3, y: 0 });
  });
});
