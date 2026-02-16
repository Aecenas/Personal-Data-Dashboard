import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { t } from '../i18n';
import { CardExecutionHistoryEntry } from '../types';
import { getExecutionHistoryEntries, summarizeExecutionEntries } from '../services/diagnostics';

type StatusFilter = 'all' | 'success' | 'failed' | 'timeout';

interface ExecutionListRow extends CardExecutionHistoryEntry {
  card_id: string;
  card_title: string;
  card_group: string;
}

const formatDuration = (value: number | undefined): string => {
  if (value === undefined || !Number.isFinite(value)) return '--';
  return `${Math.round(value)} ms`;
};

const DiagnosticsStatusBadge: React.FC<{ status: 'success' | 'failed' | 'timeout'; label: string }> = ({
  status,
  label,
}) => {
  const className =
    status === 'success'
      ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/35 dark:text-emerald-300'
      : status === 'timeout'
        ? 'bg-amber-500/15 text-amber-700 border-amber-500/35 dark:text-amber-300'
        : 'bg-red-500/15 text-red-700 border-red-500/35 dark:text-red-300';

  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${className}`}>{label}</span>;
};

export const Diagnostics: React.FC = () => {
  const { cards, language } = useStore();
  const tr = (key: string, params?: Record<string, string | number>) => t(language, key, params);

  const [cardFilter, setCardFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const visibleCards = useMemo(() => cards.filter((card) => !card.status.is_deleted), [cards]);

  const rows = useMemo<ExecutionListRow[]>(() => {
    const list: ExecutionListRow[] = [];
    visibleCards.forEach((card) => {
      const entries = getExecutionHistoryEntries(card.execution_history);
      entries.forEach((entry) => {
        list.push({
          ...entry,
          card_id: card.id,
          card_title: card.title,
          card_group: card.group,
        });
      });
    });
    list.sort((a, b) => b.executed_at - a.executed_at);
    return list;
  }, [visibleCards]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (cardFilter !== 'all' && row.card_id !== cardFilter) return false;
      if (statusFilter === 'success' && !row.ok) return false;
      if (statusFilter === 'failed' && row.ok) return false;
      if (statusFilter === 'timeout' && !row.timed_out) return false;
      return true;
    });
  }, [rows, cardFilter, statusFilter]);

  const statsByCard = useMemo(() => {
    return visibleCards
      .map((card) => {
        const entries = getExecutionHistoryEntries(card.execution_history);
        const stats = summarizeExecutionEntries(entries);
        const latestFailure = entries.find((entry) => !entry.ok);
        return {
          card_id: card.id,
          card_title: card.title,
          card_group: card.group,
          stats,
          latest_failure_at: latestFailure?.executed_at,
        };
      })
      .filter((item) => item.stats.total > 0)
      .sort((a, b) => {
        if (b.stats.total !== a.stats.total) return b.stats.total - a.stats.total;
        return a.card_title.localeCompare(b.card_title);
      });
  }, [visibleCards]);

  const failedCards = useMemo(() => {
    return statsByCard
      .filter((item) => item.stats.failure_count > 0)
      .sort((a, b) => {
        if (b.stats.failure_count !== a.stats.failure_count) return b.stats.failure_count - a.stats.failure_count;
        const failureRateA = a.stats.failure_count / a.stats.total;
        const failureRateB = b.stats.failure_count / b.stats.total;
        if (failureRateB !== failureRateA) return failureRateB - failureRateA;
        return (b.latest_failure_at ?? 0) - (a.latest_failure_at ?? 0);
      });
  }, [statsByCard]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        dateStyle: 'short',
        timeStyle: 'medium',
      }),
    [language],
  );
  const percentFormatter = useMemo(
    () =>
      new Intl.NumberFormat(language, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    [language],
  );

  return (
    <div className="p-8 max-w-7xl mx-auto animate-in fade-in duration-300 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">{tr('diagnostics.title')}</h1>
        <p className="text-muted-foreground">{tr('diagnostics.description')}</p>
      </div>

      <section className="bg-card border border-border rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">{tr('diagnostics.filters.card')}</label>
            <select
              value={cardFilter}
              onChange={(event) => setCardFilter(event.target.value)}
              className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">{tr('diagnostics.filters.cardAll')}</option>
              {visibleCards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.title}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">{tr('diagnostics.filters.status')}</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">{tr('diagnostics.filters.statusAll')}</option>
              <option value="success">{tr('diagnostics.filters.statusSuccess')}</option>
              <option value="failed">{tr('diagnostics.filters.statusFailed')}</option>
              <option value="timeout">{tr('diagnostics.filters.statusTimeout')}</option>
            </select>
          </div>
        </div>
      </section>

      <section className="bg-card border border-border rounded-xl">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-lg font-medium">{tr('diagnostics.recent.title')}</h2>
          <p className="text-sm text-muted-foreground">{tr('diagnostics.recent.description')}</p>
        </div>

        {filteredRows.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">{tr('diagnostics.recent.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border/70">
                  <th className="px-4 py-2 font-medium">{tr('diagnostics.recent.time')}</th>
                  <th className="px-4 py-2 font-medium">{tr('diagnostics.recent.card')}</th>
                  <th className="px-4 py-2 font-medium">{tr('diagnostics.recent.status')}</th>
                  <th className="px-4 py-2 font-medium">{tr('diagnostics.recent.duration')}</th>
                  <th className="px-4 py-2 font-medium">{tr('diagnostics.recent.exitCode')}</th>
                  <th className="px-4 py-2 font-medium">{tr('diagnostics.recent.error')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const status: 'success' | 'failed' | 'timeout' = row.ok
                    ? 'success'
                    : row.timed_out
                      ? 'timeout'
                      : 'failed';
                  const statusLabel =
                    status === 'success'
                      ? tr('diagnostics.status.success')
                      : status === 'timeout'
                        ? tr('diagnostics.status.timeout')
                        : tr('diagnostics.status.failed');

                  return (
                    <tr key={`${row.card_id}-${row.executed_at}-${row.duration_ms}`} className="border-b border-border/40">
                      <td className="px-4 py-2 whitespace-nowrap">{dateFormatter.format(row.executed_at)}</td>
                      <td className="px-4 py-2">
                        <div>{row.card_title}</div>
                        <div className="text-xs text-muted-foreground">{row.card_group}</div>
                      </td>
                      <td className="px-4 py-2">
                        <DiagnosticsStatusBadge status={status} label={statusLabel} />
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatDuration(row.duration_ms)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{row.exit_code === null ? '--' : row.exit_code}</td>
                      <td className="px-4 py-2">{row.error_summary ?? '--'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-card border border-border rounded-xl">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-lg font-medium">{tr('diagnostics.cards.title')}</h2>
          <p className="text-sm text-muted-foreground">{tr('diagnostics.cards.description')}</p>
        </div>

        {statsByCard.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">{tr('diagnostics.cards.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border/70">
                  <th className="px-4 py-2 font-medium">{tr('diagnostics.cards.card')}</th>
                  <th className="px-4 py-2 font-medium">{tr('diagnostics.cards.runs')}</th>
                  <th className="px-4 py-2 font-medium">{tr('diagnostics.cards.successRate')}</th>
                  <th className="px-4 py-2 font-medium">{tr('diagnostics.cards.avgDuration')}</th>
                  <th className="px-4 py-2 font-medium">{tr('diagnostics.cards.p50Duration')}</th>
                  <th className="px-4 py-2 font-medium">{tr('diagnostics.cards.p90Duration')}</th>
                </tr>
              </thead>
              <tbody>
                {statsByCard.map((item) => (
                  <tr key={item.card_id} className="border-b border-border/40">
                    <td className="px-4 py-2">
                      <div>{item.card_title}</div>
                      <div className="text-xs text-muted-foreground">{item.card_group}</div>
                    </td>
                    <td className="px-4 py-2">{item.stats.total}</td>
                    <td className="px-4 py-2">{percentFormatter.format(item.stats.success_rate)}</td>
                    <td className="px-4 py-2">{formatDuration(item.stats.average_duration_ms)}</td>
                    <td className="px-4 py-2">{formatDuration(item.stats.p50_duration_ms)}</td>
                    <td className="px-4 py-2">{formatDuration(item.stats.p90_duration_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-card border border-border rounded-xl">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-lg font-medium">{tr('diagnostics.failures.title')}</h2>
          <p className="text-sm text-muted-foreground">{tr('diagnostics.failures.description')}</p>
        </div>

        {failedCards.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">{tr('diagnostics.failures.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border/70">
                  <th className="px-4 py-2 font-medium">{tr('diagnostics.failures.card')}</th>
                  <th className="px-4 py-2 font-medium">{tr('diagnostics.failures.failedRuns')}</th>
                  <th className="px-4 py-2 font-medium">{tr('diagnostics.failures.failureRate')}</th>
                  <th className="px-4 py-2 font-medium">{tr('diagnostics.failures.lastFailure')}</th>
                </tr>
              </thead>
              <tbody>
                {failedCards.map((item) => (
                  <tr key={item.card_id} className="border-b border-border/40">
                    <td className="px-4 py-2">
                      <div>{item.card_title}</div>
                      <div className="text-xs text-muted-foreground">{item.card_group}</div>
                    </td>
                    <td className="px-4 py-2">{item.stats.failure_count}</td>
                    <td className="px-4 py-2">
                      {percentFormatter.format(item.stats.failure_count / item.stats.total)}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {item.latest_failure_at ? dateFormatter.format(item.latest_failure_at) : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

