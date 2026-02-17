import React from 'react';
import { Card, ScriptOutputStatus, TextSizePreset, VerticalContentPosition } from '../../types';
import { AlertCircle, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import { useStore } from '../../store';
import { t } from '../../i18n';

interface StatusCardProps {
  card: Card;
}

const statusStyleMap: Record<ScriptOutputStatus['state'], string> = {
  ok: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30',
  warning: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
  error: 'text-rose-500 bg-rose-500/10 border-rose-500/30',
  unknown: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
};

const statusVerticalClassMap: Record<VerticalContentPosition, string> = {
  top: 'justify-start',
  center: 'justify-center',
  bottom: 'justify-end',
};

const statusTextSizeMap: Record<
  TextSizePreset,
  { badgeText: string; messageText: string; iconSize: number; badgePadding: string; gap: string }
> = {
  small: {
    badgeText: 'text-xs',
    messageText: 'text-xs',
    iconSize: 16,
    badgePadding: 'px-2.5 py-1',
    gap: 'gap-2',
  },
  medium: {
    badgeText: 'text-sm',
    messageText: 'text-sm',
    iconSize: 20,
    badgePadding: 'px-3 py-1',
    gap: 'gap-3',
  },
  large: {
    badgeText: 'text-base',
    messageText: 'text-base',
    iconSize: 22,
    badgePadding: 'px-3.5 py-1.5',
    gap: 'gap-3',
  },
};

const StatusIcon: React.FC<{ state: ScriptOutputStatus['state']; size: number }> = ({ state, size }) => {
  if (state === 'ok') return <CheckCircle2 size={size} />;
  if (state === 'warning') return <AlertTriangle size={size} />;
  if (state === 'error') return <AlertCircle size={size} />;
  return <HelpCircle size={size} />;
};

export const StatusCard: React.FC<StatusCardProps> = ({ card }) => {
  const language = useStore((state) => state.language);
  const tr = (key: string) => t(language, key);
  const data = card.runtimeData?.payload as ScriptOutputStatus | undefined;
  const verticalPosition = card.ui_config.status_vertical_position ?? 'center';
  const textSize = card.ui_config.status_text_size ?? 'medium';
  const verticalClass = statusVerticalClassMap[verticalPosition] ?? statusVerticalClassMap.center;
  const textSizeClass = statusTextSizeMap[textSize] ?? statusTextSizeMap.medium;

  if (!data) {
    return <div className="text-sm text-muted-foreground">{tr('common.noData')}</div>;
  }

  const statusClass = statusStyleMap[data.state] ?? statusStyleMap.unknown;

  return (
    <div className={`h-full flex flex-col ${textSizeClass.gap} ${verticalClass}`}>
      <div
        className={`inline-flex items-center gap-2 border rounded-full w-fit ${statusClass} ${textSizeClass.badgePadding}`}
      >
        <StatusIcon state={data.state} size={textSizeClass.iconSize} />
        <span className={`${textSizeClass.badgeText} font-semibold uppercase tracking-wide`}>{data.label}</span>
      </div>
      {data.message && (
        <p className={`${textSizeClass.messageText} text-muted-foreground leading-relaxed`}>{data.message}</p>
      )}
    </div>
  );
};
