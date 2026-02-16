import { CardExecutionHistoryBuffer, CardExecutionHistoryEntry } from '../types';

export const DEFAULT_EXECUTION_HISTORY_LIMIT = 120;
export const MIN_EXECUTION_HISTORY_LIMIT = 10;
export const MAX_EXECUTION_HISTORY_LIMIT = 500;
const MAX_ERROR_SUMMARY_LENGTH = 220;

const toFiniteInt = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const normalizeCapacity = (value: unknown, fallback = DEFAULT_EXECUTION_HISTORY_LIMIT): number =>
  clamp(toFiniteInt(value, fallback), MIN_EXECUTION_HISTORY_LIMIT, MAX_EXECUTION_HISTORY_LIMIT);

export const clampExecutionHistoryLimit = (
  value: unknown,
  fallback = DEFAULT_EXECUTION_HISTORY_LIMIT,
): number => normalizeCapacity(value, fallback);

const clipSingleLine = (value: string, maxLength = MAX_ERROR_SUMMARY_LENGTH): string => {
  const firstLine = value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? '';
  if (!firstLine) return '';
  if (firstLine.length <= maxLength) return firstLine;
  return `${firstLine.slice(0, maxLength - 3)}...`;
};

const normalizeErrorSummaryValue = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const clipped = clipSingleLine(value);
  return clipped || undefined;
};

export const summarizeExecutionError = (error?: string, stderr?: string): string | undefined => {
  const source = error?.trim() ? error : stderr;
  if (!source) return undefined;
  const clipped = clipSingleLine(source);
  return clipped || undefined;
};

export const normalizeExecutionHistoryEntry = (
  raw: unknown,
): CardExecutionHistoryEntry | null => {
  if (!raw || typeof raw !== 'object') return null;

  const item = raw as Partial<CardExecutionHistoryEntry>;
  const executed_at = toFiniteInt(item.executed_at, NaN);
  if (!Number.isFinite(executed_at) || executed_at <= 0) return null;

  const duration_ms = Math.max(0, toFiniteInt(item.duration_ms, 0));
  const ok = Boolean(item.ok);
  const timed_out = Boolean(item.timed_out);
  const exitCodeRaw = item.exit_code;
  const exit_code = exitCodeRaw === null ? null : Number.isFinite(Number(exitCodeRaw)) ? toFiniteInt(exitCodeRaw, 0) : null;
  const error_summary = ok ? undefined : normalizeErrorSummaryValue(item.error_summary);

  return {
    executed_at,
    duration_ms,
    ok,
    timed_out,
    exit_code,
    error_summary,
  };
};

export const createExecutionHistoryBuffer = (
  capacity = DEFAULT_EXECUTION_HISTORY_LIMIT,
): CardExecutionHistoryBuffer => ({
  capacity: normalizeCapacity(capacity),
  next_index: 0,
  size: 0,
  entries: [],
});

const appendExecutionHistoryUnsafe = (
  history: CardExecutionHistoryBuffer,
  entry: CardExecutionHistoryEntry,
): CardExecutionHistoryBuffer => {
  const entries = history.entries.slice(0, history.capacity);
  const isFull = history.size >= history.capacity;
  const writeIndex = isFull ? history.next_index : history.size;

  if (isFull) {
    entries[writeIndex] = entry;
  } else {
    entries.push(entry);
  }

  const size = Math.min(history.capacity, history.size + 1);
  const next_index = history.capacity > 0 ? (writeIndex + 1) % history.capacity : 0;

  return {
    capacity: history.capacity,
    next_index,
    size,
    entries,
  };
};

const tryFastNormalizeHistoryBuffer = (
  raw: unknown,
  fallbackCapacity: number,
): CardExecutionHistoryBuffer | null => {
  if (!raw || typeof raw !== 'object') return null;
  const history = raw as Partial<CardExecutionHistoryBuffer>;
  if (!Array.isArray(history.entries)) return null;

  const capacity = normalizeCapacity(history.capacity, fallbackCapacity);
  const normalizedEntries: CardExecutionHistoryEntry[] = [];
  for (const entry of history.entries.slice(0, capacity)) {
    const normalized = normalizeExecutionHistoryEntry(entry);
    if (!normalized) return null;
    normalizedEntries.push(normalized);
  }

  const maxSize = Math.min(capacity, normalizedEntries.length);
  const size = clamp(toFiniteInt(history.size, maxSize), 0, maxSize);

  let next_index = 0;
  if (size === 0) {
    next_index = 0;
  } else if (size < capacity) {
    next_index = size;
  } else {
    next_index = clamp(toFiniteInt(history.next_index, 0), 0, Math.max(0, capacity - 1));
  }

  return {
    capacity,
    next_index,
    size,
    entries: normalizedEntries,
  };
};

const tryRuntimeHistoryBuffer = (
  history: CardExecutionHistoryBuffer | undefined,
  fallbackCapacity: number,
): CardExecutionHistoryBuffer | null => {
  if (!history || !Array.isArray(history.entries)) return null;

  const capacity = normalizeCapacity(history.capacity, fallbackCapacity);
  const entries = history.entries.slice(0, capacity);
  const size = clamp(toFiniteInt(history.size, entries.length), 0, Math.min(capacity, entries.length));

  let next_index = 0;
  if (size === 0) {
    next_index = 0;
  } else if (size < capacity) {
    next_index = size;
  } else {
    next_index = clamp(toFiniteInt(history.next_index, 0), 0, Math.max(0, capacity - 1));
  }

  return {
    capacity,
    next_index,
    size,
    entries,
  };
};

export const normalizeExecutionHistoryBuffer = (
  raw: unknown,
  fallbackCapacity = DEFAULT_EXECUTION_HISTORY_LIMIT,
): CardExecutionHistoryBuffer => {
  const fast = tryFastNormalizeHistoryBuffer(raw, fallbackCapacity);
  if (fast) return fast;

  const history = createExecutionHistoryBuffer(fallbackCapacity);
  if (!raw || typeof raw !== 'object') return history;

  const entriesRaw = (raw as Partial<CardExecutionHistoryBuffer>).entries;
  if (!Array.isArray(entriesRaw)) return history;

  let normalized = history;
  for (const rawEntry of entriesRaw) {
    const entry = normalizeExecutionHistoryEntry(rawEntry);
    if (!entry) continue;
    normalized = appendExecutionHistoryUnsafe(normalized, entry);
  }
  return normalized;
};

export const appendExecutionHistoryEntry = (
  history: CardExecutionHistoryBuffer | undefined,
  entry: CardExecutionHistoryEntry,
  fallbackCapacity = DEFAULT_EXECUTION_HISTORY_LIMIT,
): CardExecutionHistoryBuffer => {
  const normalizedEntry = normalizeExecutionHistoryEntry(entry);
  if (!normalizedEntry) {
    return normalizeExecutionHistoryBuffer(history, fallbackCapacity);
  }

  const runtimeBase = tryRuntimeHistoryBuffer(history, fallbackCapacity);
  if (runtimeBase) {
    return appendExecutionHistoryUnsafe(runtimeBase, normalizedEntry);
  }

  const base =
    tryFastNormalizeHistoryBuffer(history, fallbackCapacity) ??
    normalizeExecutionHistoryBuffer(history, fallbackCapacity);
  return appendExecutionHistoryUnsafe(base, normalizedEntry);
};

export const getExecutionHistoryEntries = (
  history: CardExecutionHistoryBuffer | undefined,
): CardExecutionHistoryEntry[] => {
  if (!history || history.size <= 0) return [];

  const normalized =
    tryFastNormalizeHistoryBuffer(history, history.capacity ?? DEFAULT_EXECUTION_HISTORY_LIMIT) ??
    normalizeExecutionHistoryBuffer(history, history.capacity ?? DEFAULT_EXECUTION_HISTORY_LIMIT);
  if (normalized.size <= 0) return [];

  const result: CardExecutionHistoryEntry[] = [];
  const total = Math.min(normalized.size, normalized.entries.length, normalized.capacity);
  const isFull = normalized.size >= normalized.capacity;

  for (let offset = 0; offset < total; offset += 1) {
    const index = isFull
      ? (normalized.next_index - 1 - offset + normalized.capacity) % normalized.capacity
      : normalized.size - 1 - offset;
    const entry = normalized.entries[index];
    if (entry) result.push(entry);
  }

  return result;
};

export const withExecutionHistoryCapacity = (
  history: CardExecutionHistoryBuffer | undefined,
  capacity = DEFAULT_EXECUTION_HISTORY_LIMIT,
): CardExecutionHistoryBuffer => {
  const targetCapacity = normalizeCapacity(capacity);
  const ordered = getExecutionHistoryEntries(history);
  let resized = createExecutionHistoryBuffer(targetCapacity);

  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    resized = appendExecutionHistoryUnsafe(resized, ordered[index]);
  }

  return resized;
};

const percentileByNearestRank = (sortedValues: number[], percentile: number): number | undefined => {
  if (!sortedValues.length) return undefined;
  const rank = Math.ceil(percentile * sortedValues.length);
  const index = clamp(rank - 1, 0, sortedValues.length - 1);
  return sortedValues[index];
};

export interface ExecutionStatsSummary {
  total: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
  average_duration_ms?: number;
  p50_duration_ms?: number;
  p90_duration_ms?: number;
}

export const summarizeExecutionEntries = (
  entries: CardExecutionHistoryEntry[],
): ExecutionStatsSummary => {
  const total = entries.length;
  if (total === 0) {
    return {
      total: 0,
      success_count: 0,
      failure_count: 0,
      success_rate: 0,
      average_duration_ms: undefined,
      p50_duration_ms: undefined,
      p90_duration_ms: undefined,
    };
  }

  const success_count = entries.reduce((count, entry) => count + (entry.ok ? 1 : 0), 0);
  const failure_count = total - success_count;
  const durations = entries.map((entry) => Math.max(0, entry.duration_ms));
  const durationSum = durations.reduce((sum, value) => sum + value, 0);
  const sortedDurations = durations.slice().sort((a, b) => a - b);

  return {
    total,
    success_count,
    failure_count,
    success_rate: success_count / total,
    average_duration_ms: durationSum / total,
    p50_duration_ms: percentileByNearestRank(sortedDurations, 0.5),
    p90_duration_ms: percentileByNearestRank(sortedDurations, 0.9),
  };
};
