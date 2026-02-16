export const MIN_REFRESH_CONCURRENCY = 1;
export const MAX_REFRESH_CONCURRENCY = 16;
export const DEFAULT_REFRESH_CONCURRENCY = 4;

export const clampRefreshConcurrency = (value: unknown) => {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_REFRESH_CONCURRENCY;
  return Math.max(MIN_REFRESH_CONCURRENCY, Math.min(MAX_REFRESH_CONCURRENCY, parsed));
};
