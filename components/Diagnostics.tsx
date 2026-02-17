import React, { useMemo, useState } from 'react';
import { Activity, BarChart3, ListChecks, type LucideIcon } from 'lucide-react';
import { useStore } from '../store';
import { t } from '../i18n';
import { CardExecutionHistoryEntry } from '../types';
import { getExecutionHistoryEntries, summarizeExecutionEntries } from '../services/diagnostics';

type StatusFilter = 'all' | 'success' | 'failed' | 'timeout';
type DiagnosticsSectionId = 'overview' | 'cards' | 'failures';

interface DiagnosticsSectionMeta {
  id: DiagnosticsSectionId;
  icon: LucideIcon;
  labelKey: string;
  descriptionKey: string;
}

interface ExecutionListRow extends CardExecutionHistoryEntry {
  card_id: string;
  card_title: string;
  card_group: string;
}

const DIAGNOSTICS_SECTIONS: DiagnosticsSectionMeta[] = [
  {
    id: 'overview',
    icon: ListChecks,
    labelKey: 'diagnostics.section.overview',
    descriptionKey: 'diagnostics.section.overviewDesc',
  },
  {
    id: 'cards',
    icon: BarChart3,
    labelKey: 'diagnostics.section.cards',
    descriptionKey: 'diagnostics.section.cardsDesc',
  },
  {
    id: 'failures',
    icon: Activity,
    labelKey: 'diagnostics.section.failures',
    descriptionKey: 'diagnostics.section.failuresDesc',
  },
];

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

  const [activeSection, setActiveSection] = useState<DiagnosticsSectionId>('overview');
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
  const activeSectionMeta =
    DIAGNOSTICS_SECTIONS.find((section) => section.id === activeSection) ?? DIAGNOSTICS_SECTIONS[0];
  const ActiveSectionIcon = activeSectionMeta.icon;

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">{tr('diagnostics.title')}</h1>
        <p className="text-muted-foreground">{tr('diagnostics.description')}</p>
      </div>

      <div className="lg:hidden mt-4 mb-4 overflow-x-auto pb-1">
        <div className="flex gap-2 min-w-max">
          {DIAGNOSTICS_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = section.id === activeSection;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                data-sound="nav.switch"
                aria-current={isActive ? 'page' : undefined}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'border-primary/35 bg-primary/10 text-foreground'
                    : 'border-border/80 bg-card text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                }`}
              >
                <Icon size={15} className={isActive ? 'text-primary' : ''} />
                <span className="whitespace-nowrap">{tr(section.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden lg:block lg:sticky lg:top-6">
          <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {tr('diagnostics.category')}
            </p>
            <nav className="space-y-1" aria-label={tr('diagnostics.category')}>
              {DIAGNOSTICS_SECTIONS.map((section) => {
                const Icon = section.icon;
                const isActive = section.id === activeSection;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    data-sound="nav.switch"
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full rounded-lg border px-3 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                      isActive
                        ? 'border-primary/35 bg-primary/10 text-foreground shadow-sm'
                        : 'border-transparent text-muted-foreground hover:border-border/80 hover:bg-secondary/60 hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Icon size={16} className={`mt-0.5 ${isActive ? 'text-primary' : ''}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{tr(section.labelKey)}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {tr(section.descriptionKey)}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        <section className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg border border-primary/25 bg-primary/10 flex items-center justify-center text-primary">
                <ActiveSectionIcon size={18} />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{tr(activeSectionMeta.labelKey)}</h2>
                <p className="text-sm text-muted-foreground mt-1">{tr(activeSectionMeta.descriptionKey)}</p>
              </div>
            </div>
          </div>

          {activeSection === 'overview' && (
            <>
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
                  <h3 className="text-lg font-medium">{tr('diagnostics.recent.title')}</h3>
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
                            <tr
                              key={`${row.card_id}-${row.executed_at}-${row.duration_ms}`}
                              className="border-b border-border/40"
                            >
                              <td className="px-4 py-2 whitespace-nowrap">{dateFormatter.format(row.executed_at)}</td>
                              <td className="px-4 py-2">
                                <div>{row.card_title}</div>
                                <div className="text-xs text-muted-foreground">{row.card_group}</div>
                              </td>
                              <td className="px-4 py-2">
                                <DiagnosticsStatusBadge status={status} label={statusLabel} />
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap">{formatDuration(row.duration_ms)}</td>
                              <td className="px-4 py-2 whitespace-nowrap">
                                {row.exit_code === null ? '--' : row.exit_code}
                              </td>
                              <td className="px-4 py-2">{row.error_summary ?? '--'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}

          {activeSection === 'cards' && (
            <section className="bg-card border border-border rounded-xl">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-lg font-medium">{tr('diagnostics.cards.title')}</h3>
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
          )}

          {activeSection === 'failures' && (
            <section className="bg-card border border-border rounded-xl">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-lg font-medium">{tr('diagnostics.failures.title')}</h3>
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
          )}
        </section>
      </div>
    </div>
  );
};
