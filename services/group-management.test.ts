import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../store';
import { Card, GroupEntity, SectionMarker } from '../types';

const createCard = (id: string, group: string): Card => ({
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

const createGroups = (...names: string[]): GroupEntity[] =>
  names.map((name, order) => ({ id: `G${order + 1}`, name, order }));

describe('group management store behavior', () => {
  beforeEach(() => {
    useStore.setState({
      cards: [],
      sectionMarkers: [],
      groups: createGroups('Default'),
      activeGroup: 'Default',
      dashboardColumns: 4,
      isEditMode: false,
    });
  });

  it('renames group and syncs cards, sections, and activeGroup', () => {
    useStore.setState({
      cards: [createCard('card-1', 'Infra')],
      sectionMarkers: [createSection('sec-1', 'Infra')],
      groups: createGroups('Infra', 'Ops'),
      activeGroup: 'Infra',
    });

    const result = useStore.getState().renameGroup('Infra', 'Core');
    expect(result).toEqual({ ok: true });

    const state = useStore.getState();
    expect(state.cards[0].group).toBe('Core');
    expect(state.sectionMarkers[0].group).toBe('Core');
    expect(state.activeGroup).toBe('Core');
    expect(state.groups.map((group) => group.name)).toEqual(['Core', 'Ops']);
  });

  it('requires migration target when deleting a group with cards', () => {
    useStore.setState({
      cards: [createCard('card-1', 'Infra')],
      groups: createGroups('Infra', 'Ops'),
    });

    const result = useStore.getState().deleteGroup('Infra');
    expect(result).toEqual({ ok: false, error: 'target_required' });
  });

  it('deletes group by migrating cards and section markers to target', () => {
    useStore.setState({
      cards: [createCard('card-1', 'Infra'), createCard('card-2', 'Ops')],
      sectionMarkers: [createSection('sec-1', 'Infra')],
      groups: createGroups('Infra', 'Ops'),
      activeGroup: 'Infra',
    });

    const result = useStore.getState().deleteGroup('Infra', 'Ops');
    expect(result).toEqual({ ok: true });

    const state = useStore.getState();
    expect(state.groups.map((group) => group.name)).toEqual(['Ops']);
    expect(state.activeGroup).toBe('Ops');
    expect(state.cards.filter((card) => card.group === 'Ops')).toHaveLength(2);
    expect(state.sectionMarkers).toHaveLength(1);
    expect(state.sectionMarkers[0].group).toBe('Ops');
  });

  it('reorders groups with explicit name sequence', () => {
    useStore.setState({
      groups: createGroups('Infra', 'Ops', 'DB'),
    });

    useStore.getState().reorderGroups(['DB', 'Infra', 'Ops']);

    expect(useStore.getState().groups).toEqual([
      { id: 'G3', name: 'DB', order: 0 },
      { id: 'G1', name: 'Infra', order: 1 },
      { id: 'G2', name: 'Ops', order: 2 },
    ]);
  });
});
