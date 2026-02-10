import React from 'react';
import { Card, ScriptOutputSeries } from '../../types';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface SeriesCardProps {
  card: Card;
}

export const SeriesCard: React.FC<SeriesCardProps> = ({ card }) => {
  const payload = card.runtimeData?.payload as ScriptOutputSeries;

  if (!payload || !payload.series || payload.series.length === 0) return <div>No Data</div>;

  // Transform data for Recharts
  // { x_axis: ['A', 'B'], series: [{ name: 'val', values: [1, 2] }] }
  // to: [ { name: 'A', val: 1 }, { name: 'B', val: 2 } ]
  
  const chartData = payload.x_axis.map((label, index) => {
    const dataPoint: any = { name: label };
    payload.series.forEach(s => {
      dataPoint[s.name] = s.values[index];
    });
    return dataPoint;
  });

  const seriesName = payload.series[0].name;

  // Color mapping based on config
  const getStroke = () => {
    switch (card.ui_config.color_theme) {
      case 'green': return '#10b981'; // emerald-500
      case 'red': return '#f43f5e'; // rose-500
      case 'purple': return '#8b5cf6'; // violet-500
      case 'blue': return '#3b82f6'; // blue-500
      default: return '#3b82f6';
    }
  };

  return (
    <div className="w-full h-full min-h-[140px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id={`color${card.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={getStroke()} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={getStroke()} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis 
            dataKey="name" 
            tick={{fontSize: 10, fill: 'hsl(var(--muted-foreground))'}} 
            tickLine={false}
            axisLine={false}
          />
          <YAxis 
            tick={{fontSize: 10, fill: 'hsl(var(--muted-foreground))'}} 
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
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
            }}
            itemStyle={{ color: getStroke() }}
          />
          <Area 
            type="monotone" 
            dataKey={seriesName} 
            stroke={getStroke()} 
            fillOpacity={1} 
            fill={`url(#color${card.id})`} 
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
