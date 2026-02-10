import { Card } from '../types';

export const INITIAL_MOCK_CARDS: Card[] = [
  {
    id: '1',
    title: 'Server CPU',
    group: 'Infrastructure',
    type: 'scalar',
    script_config: { path: 'cpu.py', args: [] },
    mapping_config: {},
    ui_config: { color_theme: 'blue', size: '1x1', x: 0, y: 0 },
    status: { is_deleted: false, deleted_at: null },
    runtimeData: {
      isLoading: false,
      lastUpdated: Date.now(),
      payload: { value: 42, unit: '%', trend: 'flat', color: 'neutral' }
    }
  },
  {
    id: '2',
    title: 'RAM Usage',
    group: 'Infrastructure',
    type: 'scalar',
    script_config: { path: 'ram.py', args: [] },
    mapping_config: {},
    ui_config: { color_theme: 'blue', size: '1x1', x: 1, y: 0 },
    status: { is_deleted: false, deleted_at: null },
    runtimeData: {
      isLoading: false,
      lastUpdated: Date.now(),
      payload: { value: 12.4, unit: 'GB', trend: 'up', color: 'warning' }
    }
  },
  {
    id: '3',
    title: 'NVidia Stock',
    group: 'Finance',
    type: 'scalar',
    script_config: { path: 'stock.py', args: ['NVDA'] },
    mapping_config: {},
    ui_config: { color_theme: 'green', size: '2x1', x: 2, y: 0 },
    status: { is_deleted: false, deleted_at: null },
    runtimeData: {
      isLoading: false,
      lastUpdated: Date.now(),
      payload: { value: 895.32, unit: 'USD', trend: 'up', color: 'success' }
    }
  },
  {
    id: '4',
    title: 'Temp History',
    group: 'Home',
    type: 'series',
    script_config: { path: 'temp_hist.py', args: [] },
    mapping_config: {},
    ui_config: { color_theme: 'red', size: '1x2', x: 0, y: 1 },
    status: { is_deleted: false, deleted_at: null },
    runtimeData: {
      isLoading: false,
      lastUpdated: Date.now(),
      payload: {
        x_axis: ['10am', '11am', '12pm', '1pm', '2pm', '3pm'],
        series: [
          { name: 'Temp', values: [22, 23, 24, 25, 24, 23] }
        ]
      }
    }
  },
  {
    id: '5',
    title: 'Network Traffic',
    group: 'Infrastructure',
    type: 'series',
    script_config: { path: 'analytics.py', args: [] },
    mapping_config: {},
    ui_config: { color_theme: 'purple', size: '2x2', x: 1, y: 1 },
    status: { is_deleted: false, deleted_at: null },
    runtimeData: {
      isLoading: false,
      lastUpdated: Date.now(),
      payload: {
        x_axis: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        series: [
          { name: 'MB/s', values: [120, 132, 101, 134, 90, 230, 210] }
        ]
      }
    }
  },
  {
    id: '6',
    title: 'Living Room',
    group: 'Home',
    type: 'scalar',
    script_config: { path: 'temp.py', args: [] },
    mapping_config: {},
    ui_config: { color_theme: 'red', size: '1x1', x: 3, y: 1 },
    status: { is_deleted: false, deleted_at: null },
    runtimeData: {
      isLoading: false,
      lastUpdated: Date.now(),
      payload: { value: 24.1, unit: '°C', trend: 'down', color: 'neutral' }
    }
  }
];