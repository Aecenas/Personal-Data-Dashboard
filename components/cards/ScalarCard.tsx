import React from 'react';
import { Card, ScriptOutputScalar, ScalarContentPosition, TextSizePreset } from '../../types';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useStore } from '../../store';
import { t } from '../../i18n';

interface ScalarCardProps {
  card: Card;
}

const positionClassMap: Record<ScalarContentPosition, string> = {
  'top-left': 'items-start justify-start text-left',
  'top-center': 'items-start justify-center text-center',
  'top-right': 'items-start justify-end text-right',
  'middle-left': 'items-center justify-start text-left',
  center: 'items-center justify-center text-center',
  'middle-right': 'items-center justify-end text-right',
  'bottom-left': 'items-end justify-start text-left',
  'bottom-center': 'items-end justify-center text-center',
  'bottom-right': 'items-end justify-end text-right',
};

const textSizeClassMap: Record<TextSizePreset, { value: string; unit: string; trendIcon: number }> = {
  small: { value: 'text-3xl', unit: 'text-base', trendIcon: 14 },
  medium: { value: 'text-4xl', unit: 'text-lg', trendIcon: 16 },
  large: { value: 'text-5xl', unit: 'text-xl', trendIcon: 18 },
};

export const ScalarCard: React.FC<ScalarCardProps> = ({ card }) => {
  const language = useStore((state) => state.language);
  const tr = (key: string) => t(language, key);
  const data = card.runtimeData?.payload as ScriptOutputScalar | undefined;
  const scalarPosition = card.ui_config.scalar_position ?? 'center';
  const scalarTextSize = card.ui_config.scalar_text_size ?? 'medium';
  const positionClass = positionClassMap[scalarPosition] ?? positionClassMap.center;
  const textSizeClass = textSizeClassMap[scalarTextSize] ?? textSizeClassMap.medium;

  if (!data) return <div className="text-sm text-muted-foreground">{tr('common.noData')}</div>;

  const getColor = (status?: string) => {
    switch (status) {
      case 'success':
        return 'text-emerald-500';
      case 'warning':
        return 'text-amber-500';
      case 'danger':
        return 'text-rose-500';
      default:
        return 'text-foreground';
    }
  };

  const TrendIcon = () => {
    if (!data.trend) return null;
    if (data.trend === 'up') return <TrendingUp size={textSizeClass.trendIcon} className="text-emerald-500" />;
    if (data.trend === 'down') return <TrendingDown size={textSizeClass.trendIcon} className="text-rose-500" />;
    return <Minus size={textSizeClass.trendIcon} className="text-muted-foreground" />;
  };

  return (
    <div className={`flex h-full w-full pb-1 ${positionClass}`}>
      <div className="inline-flex items-end gap-2 overflow-hidden">
        <div className={`${textSizeClass.value} font-bold tracking-tight leading-none ${getColor(data.color)}`}>
          {data.value}
          {data.unit && (
            <span className={`${textSizeClass.unit} font-medium text-muted-foreground ml-1 align-baseline`}>
              {data.unit}
            </span>
          )}
        </div>
        <TrendIcon />
      </div>
    </div>
  );
};
