import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Card } from '../types';
import { useStore } from '../store';
import { t } from '../i18n';
import { getExecutionHistoryEntries } from '../services/diagnostics';
import { Button } from './ui/Button';

interface CardHistoryDialogProps {
  card: Card | null;
  onClose: () => void;
}

const PAGE_SIZE = 10;

const formatDuration = (value: number | undefined): string => {
  if (value === undefined || !Number.isFinite(value)) return '--';
  return `${Math.round(value)} ms`;
};

const HistoryStatusBadge: React.FC<{ status: 'success' | 'failed' | 'timeout'; label: string }> = ({
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

export const CardHistoryDialog: React.FC<CardHistoryDialogProps> = ({ card, onClose }) => {
  const { language, executionHistoryLimit } = useStore();
  const tr = (key: string, params?: Record<string, string | number>) => t(language, key, params);
  const [page, setPage] = useState(1);

  const entries = useMemo(
    () => (card ? getExecutionHistoryEntries(card.execution_history) : []),
    [card],
  );

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = entries.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeStart = entries.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = entries.length === 0 ? 0 : pageStart + pageRows.length;

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        dateStyle: 'short',
        timeStyle: 'medium',
      }),
    [language],
  );

  useEffect(() => {
    setPage(1);
  }, [card?.id]);

  useEffect(() => {
    setPage((value) => Math.min(value, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (!card) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [card, onClose]);

  if (!card) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-5xl rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">{tr('cardHistory.title')}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {tr('cardHistory.description', {
                cardTitle: card.title,
                total: entries.length,
                limit: executionHistoryLimit,
              })}
            </p>
          </div>
          <Button variant="ghost" size="icon" data-sound="none" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        {entries.length === 0 ? (
          <p className="px-4 py-10 text-sm text-muted-foreground">{tr('cardHistory.empty')}</p>
        ) : (
          <>
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="text-left border-b border-border/70">
                    <th className="px-4 py-2 font-medium">{tr('cardHistory.time')}</th>
                    <th className="px-4 py-2 font-medium">{tr('cardHistory.status')}</th>
                    <th className="px-4 py-2 font-medium">{tr('cardHistory.duration')}</th>
                    <th className="px-4 py-2 font-medium">{tr('cardHistory.exitCode')}</th>
                    <th className="px-4 py-2 font-medium">{tr('cardHistory.error')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((entry) => {
                    const status: 'success' | 'failed' | 'timeout' = entry.ok
                      ? 'success'
                      : entry.timed_out
                        ? 'timeout'
                        : 'failed';
                    const statusLabel =
                      status === 'success'
                        ? tr('diagnostics.status.success')
                        : status === 'timeout'
                          ? tr('diagnostics.status.timeout')
                          : tr('diagnostics.status.failed');
                    const rowKey = `${entry.executed_at}-${entry.duration_ms}-${entry.exit_code ?? 'null'}`;

                    return (
                      <tr key={rowKey} className="border-b border-border/40">
                        <td className="px-4 py-2 whitespace-nowrap">{dateFormatter.format(entry.executed_at)}</td>
                        <td className="px-4 py-2">
                          <HistoryStatusBadge status={status} label={statusLabel} />
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">{formatDuration(entry.duration_ms)}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{entry.exit_code === null ? '--' : entry.exit_code}</td>
                        <td className="px-4 py-2">{entry.error_summary ?? '--'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {tr('cardHistory.range', { from: rangeStart, to: rangeEnd, total: entries.length })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={currentPage <= 1}
                >
                  {tr('common.back')}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {tr('cardHistory.pageInfo', { page: currentPage, total: totalPages })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  disabled={currentPage >= totalPages}
                >
                  {tr('common.next')}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
