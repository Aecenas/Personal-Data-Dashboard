import React from 'react';
import { Card, ScriptOutputGauge } from '../../types';
import { useStore } from '../../store';
import { t } from '../../i18n';

interface GaugeCardProps {
  card: Card;
}

interface Point {
  x: number;
  y: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return '-';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, '');
};

const getTheme = (theme: Card['ui_config']['color_theme']) => {
  switch (theme) {
    case 'green':
      return { start: '#6ee7b7', end: '#10b981', needle: '#14532d' };
    case 'red':
      return { start: '#fca5a5', end: '#f43f5e', needle: '#7f1d1d' };
    case 'yellow':
      return { start: '#fde68a', end: '#f59e0b', needle: '#78350f' };
    case 'purple':
      return { start: '#c4b5fd', end: '#8b5cf6', needle: '#3b0764' };
    case 'blue':
      return { start: '#7dd3fc', end: '#2563eb', needle: '#1e3a8a' };
    default:
      return { start: '#94a3b8', end: '#3b82f6', needle: '#1e293b' };
  }
};

export const GaugeCard: React.FC<GaugeCardProps> = ({ card }) => {
  const language = useStore((state) => state.language);
  const tr = (key: string) => t(language, key);
  const data = card.runtimeData?.payload as ScriptOutputGauge | undefined;

  if (!data) {
    return <div className="text-sm text-muted-foreground">{tr('common.noData')}</div>;
  }

  if (!Number.isFinite(data.min) || !Number.isFinite(data.max) || data.max <= data.min) {
    return <div className="text-sm text-muted-foreground">{tr('common.noData')}</div>;
  }

  const theme = getTheme(card.ui_config.color_theme);
  const min = data.min;
  const max = data.max;
  const value = data.value;
  const ratio = clamp((value - min) / (max - min), 0, 1);

  const width = 240;
  const height = 120;
  const centerX = 120;
  const centerY = 96;
  const radius = 72;

  const pointOnCircle = (angleDeg: number, r: number): Point => {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      x: centerX + r * Math.cos(rad),
      y: centerY + r * Math.sin(rad),
    };
  };

  const arcPath = (r: number, startDeg: number, endDeg: number): string => {
    const start = pointOnCircle(startDeg, r);
    const end = pointOnCircle(endDeg, r);
    const largeArcFlag = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    const sweepFlag = endDeg > startDeg ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
  };

  const pointerAngle = -180 + ratio * 180;
  const pointerTip = pointOnCircle(pointerAngle, radius - 14);
  const progressPath = arcPath(radius, -180, pointerAngle);
  const trackPath = arcPath(radius, -180, 0);
  const gaugeId = `gauge-gradient-${card.id}`;
  const valueLabel = `${formatNumber(value)}${data.unit ? data.unit : ''}`;

  return (
    <div className="h-full w-full flex items-center">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" role="img" aria-label={card.title}>
        <defs>
          <linearGradient id={gaugeId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={theme.start} />
            <stop offset="100%" stopColor={theme.end} />
          </linearGradient>
        </defs>

        <path d={trackPath} fill="none" stroke="hsl(var(--border))" strokeWidth={10} strokeLinecap="round" />
        <path d={progressPath} fill="none" stroke={`url(#${gaugeId})`} strokeWidth={10} strokeLinecap="round" />

        {Array.from({ length: 11 }).map((_, index) => {
          const angle = -180 + (index / 10) * 180;
          const outer = pointOnCircle(angle, radius + 8);
          const inner = pointOnCircle(angle, index % 5 === 0 ? radius - 7 : radius - 2);
          return (
            <line
              key={index}
              x1={outer.x}
              y1={outer.y}
              x2={inner.x}
              y2={inner.y}
              stroke="hsl(var(--muted-foreground))"
              opacity={index % 5 === 0 ? 0.55 : 0.32}
              strokeWidth={index % 5 === 0 ? 1.7 : 1}
              strokeLinecap="round"
            />
          );
        })}

        <line
          x1={centerX}
          y1={centerY}
          x2={pointerTip.x}
          y2={pointerTip.y}
          stroke={theme.needle}
          strokeWidth={5}
          strokeLinecap="round"
        />
        <circle cx={centerX} cy={centerY} r={8} fill={theme.needle} />
        <circle cx={centerX} cy={centerY} r={4} fill="hsl(var(--background))" />

        <text
          x={centerX}
          y={70}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="22"
          fontWeight="700"
          fill="hsl(var(--foreground))"
        >
          {valueLabel}
        </text>
        <text
          x={50}
          y={108}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="10"
          fill="hsl(var(--muted-foreground))"
        >
          {formatNumber(min)}
        </text>
        <text
          x={190}
          y={108}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="10"
          fill="hsl(var(--muted-foreground))"
        >
          {formatNumber(max)}
        </text>
      </svg>
    </div>
  );
};
