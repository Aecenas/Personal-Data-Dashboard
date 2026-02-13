import React from 'react';
import { Card, ScriptOutputStatus } from '../../types';
import { AlertCircle, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';

interface StatusCardProps {
  card: Card;
}

const statusStyleMap: Record<ScriptOutputStatus['state'], string> = {
  ok: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30',
  warning: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
  error: 'text-rose-500 bg-rose-500/10 border-rose-500/30',
  unknown: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
};

const StatusIcon: React.FC<{ state: ScriptOutputStatus['state'] }> = ({ state }) => {
  if (state === 'ok') return <CheckCircle2 size={20} />;
  if (state === 'warning') return <AlertTriangle size={20} />;
  if (state === 'error') return <AlertCircle size={20} />;
  return <HelpCircle size={20} />;
};

export const StatusCard: React.FC<StatusCardProps> = ({ card }) => {
  const data = card.runtimeData?.payload as ScriptOutputStatus | undefined;

  if (!data) {
    return <div className="text-sm text-muted-foreground">No Data</div>;
  }

  const statusClass = statusStyleMap[data.state] ?? statusStyleMap.unknown;

  return (
    <div className="h-full flex flex-col gap-3 justify-center">
      <div className={`inline-flex items-center gap-2 border rounded-full px-3 py-1 w-fit ${statusClass}`}>
        <StatusIcon state={data.state} />
        <span className="text-sm font-semibold uppercase tracking-wide">{data.label}</span>
      </div>
      {data.message && <p className="text-sm text-muted-foreground leading-relaxed">{data.message}</p>}
    </div>
  );
};
