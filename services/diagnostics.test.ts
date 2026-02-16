import { describe, expect, it } from 'vitest';
import {
  appendExecutionHistoryEntry,
  clampExecutionHistoryLimit,
  createExecutionHistoryBuffer,
  getExecutionHistoryEntries,
  summarizeExecutionEntries,
  withExecutionHistoryCapacity,
} from './diagnostics';

describe('diagnostics history ring buffer', () => {
  it('appends entries and truncates to fixed capacity', () => {
    let history = createExecutionHistoryBuffer(10);

    for (let index = 1; index <= 12; index += 1) {
      history = appendExecutionHistoryEntry(history, {
        executed_at: index,
        duration_ms: index * 10,
        ok: index % 2 === 0,
        timed_out: false,
        exit_code: 0,
      });
    }

    const ordered = getExecutionHistoryEntries(history);
    expect(history.capacity).toBe(10);
    expect(history.size).toBe(10);
    expect(ordered.map((entry) => entry.executed_at)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  });

  it('preserves timeout and error metadata in history', () => {
    let history = createExecutionHistoryBuffer(10);
    history = appendExecutionHistoryEntry(history, {
      executed_at: 1000,
      duration_ms: 300,
      ok: false,
      timed_out: true,
      exit_code: null,
      error_summary: 'Script timed out',
    });

    const [entry] = getExecutionHistoryEntries(history);
    expect(entry.ok).toBe(false);
    expect(entry.timed_out).toBe(true);
    expect(entry.exit_code).toBeNull();
    expect(entry.error_summary).toBe('Script timed out');
  });

  it('resizes history buffer to target capacity while keeping newest entries', () => {
    let history = createExecutionHistoryBuffer(20);

    for (let index = 1; index <= 15; index += 1) {
      history = appendExecutionHistoryEntry(history, {
        executed_at: index,
        duration_ms: index * 10,
        ok: true,
        timed_out: false,
        exit_code: 0,
      });
    }

    const resized = withExecutionHistoryCapacity(history, 10);
    const ordered = getExecutionHistoryEntries(resized);

    expect(resized.capacity).toBe(10);
    expect(resized.size).toBe(10);
    expect(ordered.map((entry) => entry.executed_at)).toEqual([15, 14, 13, 12, 11, 10, 9, 8, 7, 6]);
  });

  it('clamps configured history limit into valid range', () => {
    expect(clampExecutionHistoryLimit(5)).toBe(10);
    expect(clampExecutionHistoryLimit(999)).toBe(500);
    expect(clampExecutionHistoryLimit('bad')).toBe(120);
  });
});

describe('diagnostics statistics', () => {
  it('computes success rate and duration quantiles', () => {
    const summary = summarizeExecutionEntries([
      {
        executed_at: 1,
        duration_ms: 100,
        ok: true,
        timed_out: false,
        exit_code: 0,
      },
      {
        executed_at: 2,
        duration_ms: 200,
        ok: true,
        timed_out: false,
        exit_code: 0,
      },
      {
        executed_at: 3,
        duration_ms: 500,
        ok: false,
        timed_out: true,
        exit_code: null,
        error_summary: 'timeout',
      },
    ]);

    expect(summary.total).toBe(3);
    expect(summary.success_count).toBe(2);
    expect(summary.failure_count).toBe(1);
    expect(summary.success_rate).toBeCloseTo(2 / 3, 6);
    expect(summary.average_duration_ms).toBeCloseTo((100 + 200 + 500) / 3, 6);
    expect(summary.p50_duration_ms).toBe(200);
    expect(summary.p90_duration_ms).toBe(500);
  });
});
