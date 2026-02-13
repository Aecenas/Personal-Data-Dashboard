import React from 'react';
import { Card, ScriptOutputScalar } from '../../types';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ScalarCardProps {
  card: Card;
}

export const ScalarCard: React.FC<ScalarCardProps> = ({ card }) => {
  const data = card.runtimeData?.payload as ScriptOutputScalar | undefined;

  if (!data) return <div className="text-sm text-muted-foreground">No Data</div>;

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
    if (data.trend === 'up') return <TrendingUp size={16} className="text-emerald-500 ml-2" />;
    if (data.trend === 'down') return <TrendingDown size={16} className="text-rose-500 ml-2" />;
    return <Minus size={16} className="text-muted-foreground ml-2" />;
  };

  return (
    <div className="flex items-end justify-between h-full pb-2">
      <div className="flex flex-col overflow-hidden">
        <div className={`text-4xl font-bold tracking-tight ${getColor(data.color)}`}>
          {data.value}
          {data.unit && <span className="text-lg font-medium text-muted-foreground ml-1">{data.unit}</span>}
        </div>
      </div>
      <div className="mb-2">
        <TrendIcon />
      </div>
    </div>
  );
};
