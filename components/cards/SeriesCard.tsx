import React from 'react';
import { Card, ScriptOutputSeries } from '../../types';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface SeriesCardProps {
  card: Card;
}

export const SeriesCard: React.FC<SeriesCardProps> = ({ card }) => {
  const payload = card.runtimeData?.payload as ScriptOutputSeries | undefined;

  if (!payload || !payload.series || payload.series.length === 0) {
    return <div className="text-sm text-muted-foreground">No Data</div>;
  }

  const chartData = payload.x_axis.map((label, index) => {
    const point: Record<string, string | number> = { name: String(label) };
    payload.series.forEach((series) => {
      point[series.name] = series.values[index] ?? 0;
    });
    return point;
  });

  const primarySeries = payload.series[0]?.name;

  const getStroke = () => {
    switch (card.ui_config.color_theme) {
      case 'green':
        return '#10b981';
      case 'red':
        return '#f43f5e';
      case 'purple':
        return '#8b5cf6';
      case 'blue':
        return '#3b82f6';
      case 'yellow':
        return '#f59e0b';
      default:
        return '#3b82f6';
    }
  };

  return (
    <div className="w-full h-full min-h-[140px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id={`color-${card.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={getStroke()} stopOpacity={0.3} />
              <stop offset="95%" stopColor={getStroke()} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--card-foreground))',
              borderRadius: 'var(--radius)',
              fontSize: '12px',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            }}
            itemStyle={{ color: getStroke() }}
          />
          {primarySeries && (
            <Area
              type="monotone"
              dataKey={primarySeries}
              stroke={getStroke()}
              fillOpacity={1}
              fill={`url(#color-${card.id})`}
              strokeWidth={2}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
