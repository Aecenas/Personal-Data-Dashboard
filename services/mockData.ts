import { Card, CacheData, NormalizedCardPayload } from '../types';

const createCacheData = (payload: NormalizedCardPayload): CacheData => ({
  last_success_payload: payload,
  last_success_at: Date.now(),
});

export const INITIAL_MOCK_CARDS: Card[] = [
  {
    id: '1',
    title: 'Server CPU',
    group: 'Infrastructure',
    type: 'scalar',
    script_config: { path: '/path/to/cpu.py', args: [] },
    mapping_config: {
      scalar: { value_key: 'value', unit_key: 'unit', trend_key: 'trend', color_key: 'color' },
    },
    refresh_config: { interval_sec: 0, refresh_on_start: false, refresh_on_resume: true, timeout_ms: 10000 },
    ui_config: { color_theme: 'blue', size: '1x1', x: 0, y: 0 },
    status: { is_deleted: false, deleted_at: null, sort_order: 1 },
    cache_data: createCacheData({ value: 42, unit: '%', trend: 'flat', color: 'neutral' }),
    runtimeData: {
      state: 'success',
      isLoading: false,
      source: 'cache',
      payload: { value: 42, unit: '%', trend: 'flat', color: 'neutral' },
      lastUpdated: Date.now(),
    },
  },
  {
    id: '2',
    title: 'RAM Usage',
    group: 'Infrastructure',
    type: 'scalar',
    script_config: { path: '/path/to/ram.py', args: [] },
    mapping_config: {
      scalar: { value_key: 'value', unit_key: 'unit', trend_key: 'trend', color_key: 'color' },
    },
    refresh_config: { interval_sec: 0, refresh_on_start: false, refresh_on_resume: true, timeout_ms: 10000 },
    ui_config: { color_theme: 'green', size: '1x1', x: 1, y: 0 },
    status: { is_deleted: false, deleted_at: null, sort_order: 2 },
    cache_data: createCacheData({ value: 12.4, unit: 'GB', trend: 'up', color: 'warning' }),
    runtimeData: {
      state: 'success',
      isLoading: false,
      source: 'cache',
      payload: { value: 12.4, unit: 'GB', trend: 'up', color: 'warning' },
      lastUpdated: Date.now(),
    },
  },
  {
    id: '3',
    title: 'Traffic Trend',
    group: 'Infrastructure',
    type: 'series',
    script_config: { path: '/path/to/network.py', args: [] },
    mapping_config: {
      series: {
        x_axis_key: 'x_axis',
        series_key: 'series',
        series_name_key: 'name',
        series_values_key: 'values',
      },
    },
    refresh_config: { interval_sec: 0, refresh_on_start: false, refresh_on_resume: false, timeout_ms: 10000 },
    ui_config: { color_theme: 'purple', size: '2x2', x: 2, y: 0 },
    status: { is_deleted: false, deleted_at: null, sort_order: 3 },
    cache_data: createCacheData({
      x_axis: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      series: [{ name: 'MB/s', values: [120, 132, 101, 134, 90, 230, 210] }],
    }),
    runtimeData: {
      state: 'success',
      isLoading: false,
      source: 'cache',
      payload: {
        x_axis: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        series: [{ name: 'MB/s', values: [120, 132, 101, 134, 90, 230, 210] }],
      },
      lastUpdated: Date.now(),
    },
  },
  {
    id: '4',
    title: 'Weather Status',
    group: 'Home',
    type: 'status',
    script_config: { path: '/path/to/status.py', args: [] },
    mapping_config: {
      status: { label_key: 'label', state_key: 'state', message_key: 'message' },
    },
    refresh_config: { interval_sec: 0, refresh_on_start: false, refresh_on_resume: true, timeout_ms: 10000 },
    ui_config: { color_theme: 'yellow', size: '1x1', x: 0, y: 1 },
    status: { is_deleted: false, deleted_at: null, sort_order: 4 },
    cache_data: createCacheData({
      label: 'AQI',
      state: 'warning',
      message: '空气质量一般，建议减少户外剧烈运动',
    }),
    runtimeData: {
      state: 'success',
      isLoading: false,
      source: 'cache',
      payload: {
        label: 'AQI',
        state: 'warning',
        message: '空气质量一般，建议减少户外剧烈运动',
      },
      lastUpdated: Date.now(),
    },
  },
];
