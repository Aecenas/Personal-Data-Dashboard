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

const formatGaugeNumber = (value: number, compact: boolean) => {
  if (!Number.isFinite(value)) return '-';
  const absolute = Math.abs(value);
  const fixed = (input: number, digits: number) => input.toFixed(digits).replace(/\.?0+$/, '');

  if (absolute >= 1_000_000_000) return `${fixed(value / 1_000_000_000, compact ? 0 : 1)}B`;
  if (absolute >= 1_000_000) return `${fixed(value / 1_000_000, compact ? 0 : 1)}M`;
  if (absolute >= 1_000) return `${fixed(value / 1_000, compact ? 0 : 1)}K`;
  if (compact) {
    if (absolute >= 100) return Math.round(value).toString();
    if (absolute >= 10) return value.toFixed(0);
    return fixed(value, 1);
  }
  if (Number.isInteger(value)) return String(value);
  return fixed(value, 2);
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

type CardSize = Card['ui_config']['size'];

interface GaugeLayout {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  radius: number;
  valueY: number;
  valueFontSize: number;
  rangeY: number;
  rangeFontSize: number;
  rangeOffsetX: number;
  pointerInset: number;
  tickOuterOffset: number;
  majorTickInset: number;
  minorTickInset: number;
  majorTickWidth: number;
  minorTickWidth: number;
  arcStrokeWidth: number;
  pointerStrokeWidth: number;
  hubRadius: number;
  hubInnerRadius: number;
}

const FALLBACK_VIEWPORT: Record<CardSize, { width: number; height: number }> = {
  '1x1': { width: 208, height: 124 },
  '2x1': { width: 432, height: 124 },
  '1x2': { width: 208, height: 328 },
  '2x2': { width: 432, height: 328 },
};

const getGaugeLayout = (size: CardSize, viewportWidth: number, viewportHeight: number): GaugeLayout => {
  const fallback = FALLBACK_VIEWPORT[size];
  const width = Math.max(120, viewportWidth || fallback.width);
  const height = Math.max(72, viewportHeight || fallback.height);
  const isMini = size === '1x1';
  const isCompactGauge = size === '1x1' || size === '2x1' || size === '1x2';
  const isOneRowGauge = size === '1x1' || size === '2x1';

  const sidePadding = isCompactGauge ? clamp(width * 0.04, 6, 14) : clamp(width * 0.06, 10, 24);
  const topPadding = isCompactGauge ? clamp(height * 0.08, 8, 14) : clamp(height * 0.06, 8, 24);
  const rangeFontSize = isOneRowGauge
    ? clamp(height * 0.085, 8, 10)
    : clamp(width * (isCompactGauge ? 0.034 : 0.032), isCompactGauge ? 8 : 9, 14);
  const rangeOffset = isCompactGauge ? clamp(height * 0.07, 8, 16) : clamp(height * 0.11, 12, 26);
  const bottomPadding = rangeOffset + rangeFontSize + (isCompactGauge ? 1 : 2);
  const maxRadiusByWidth = Math.max(30, (width - sidePadding * 2) / 2);
  const maxRadiusByHeight = Math.max(30, height - topPadding - bottomPadding);
  const radius = Math.max(30, Math.min(maxRadiusByWidth, maxRadiusByHeight));

  const consumedHeight = topPadding + radius + bottomPadding;
  const extraVertical = Math.max(0, height - consumedHeight);
  const centerX = width / 2;
  const centerY = topPadding + radius + extraVertical * (isCompactGauge ? 0.62 : 0.5);
  const valueY = centerY - radius * (isCompactGauge ? 0.42 : 0.4);
  const maxRangeOffsetX = Math.max(20, width / 2 - sidePadding);

  return {
    width,
    height,
    centerX,
    centerY,
    radius,
    valueY,
    valueFontSize: clamp(radius * (isCompactGauge ? 0.22 : 0.3), isMini ? 14 : isOneRowGauge ? 18 : 22, 56),
    rangeY: Math.min(height - (isCompactGauge ? 1 : 2), centerY + rangeOffset),
    rangeFontSize,
    rangeOffsetX: clamp(radius * (isCompactGauge ? 0.98 : 0.9), isCompactGauge ? 16 : 20, maxRangeOffsetX),
    pointerInset: clamp(radius * (isCompactGauge ? 0.15 : 0.19), isCompactGauge ? 8 : 12, 28),
    tickOuterOffset: clamp(radius * (isCompactGauge ? 0.07 : 0.09), isCompactGauge ? 4 : 6, 14),
    majorTickInset: clamp(radius * (isCompactGauge ? 0.11 : 0.13), 5, 14),
    minorTickInset: clamp(radius * (isCompactGauge ? 0.05 : 0.06), 2.5, 8),
    majorTickWidth: clamp(radius * 0.022, 1.4, 3),
    minorTickWidth: clamp(radius * 0.013, 1, 2),
    arcStrokeWidth: clamp(radius * (isCompactGauge ? 0.11 : 0.12), isCompactGauge ? 7 : 8, 18),
    pointerStrokeWidth: clamp(radius * 0.08, isCompactGauge ? 4 : 4.5, 10),
    hubRadius: clamp(radius * 0.12, 7, 14),
    hubInnerRadius: clamp(radius * 0.06, 3.5, 7),
  };
};

export const GaugeCard: React.FC<GaugeCardProps> = ({ card }) => {
  const language = useStore((state) => state.language);
  const tr = (key: string) => t(language, key);
  const data = card.runtimeData?.payload as ScriptOutputGauge | undefined;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = React.useState<{ width: number; height: number }>(() => FALLBACK_VIEWPORT[card.ui_config.size]);

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateViewport = (nextWidth: number, nextHeight: number) => {
      const width = Math.max(0, Math.floor(nextWidth));
      const height = Math.max(0, Math.floor(nextHeight));
      if (!width || !height) return;
      setViewport((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };

    updateViewport(node.clientWidth, node.clientHeight);

    if (typeof ResizeObserver === 'undefined') {
      const handleResize = () => updateViewport(node.clientWidth, node.clientHeight);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      updateViewport(rect.width, rect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [card.ui_config.size]);

  if (!data) {
    return <div className="text-sm text-muted-foreground">{tr('common.noData')}</div>;
  }

  if (!Number.isFinite(data.min) || !Number.isFinite(data.max) || data.max <= data.min) {
    return <div className="text-sm text-muted-foreground">{tr('common.noData')}</div>;
  }

  const isMiniCard = card.ui_config.size === '1x1';
  const theme = getTheme(card.ui_config.color_theme);
  const min = data.min;
  const max = data.max;
  const value = data.value;
  const ratio = clamp((value - min) / (max - min), 0, 1);
  const layout = getGaugeLayout(card.ui_config.size, viewport.width, viewport.height);
  const {
    width,
    height,
    centerX,
    centerY,
    radius,
    valueY,
    valueFontSize,
    rangeY,
    rangeFontSize,
    rangeOffsetX,
    pointerInset,
    tickOuterOffset,
    majorTickInset,
    minorTickInset,
    majorTickWidth,
    minorTickWidth,
    arcStrokeWidth,
    pointerStrokeWidth,
    hubRadius,
    hubInnerRadius,
  } = layout;

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
  const pointerTip = pointOnCircle(pointerAngle, radius - pointerInset);
  const progressPath = arcPath(radius, -180, pointerAngle);
  const trackPath = arcPath(radius, -180, 0);
  const gaugeId = `gauge-gradient-${card.id}`;
  const valueLabel = `${formatGaugeNumber(value, isMiniCard)}${data.unit ? data.unit : ''}`;
  const minLabel = formatGaugeNumber(min, isMiniCard);
  const maxLabel = formatGaugeNumber(max, isMiniCard);
  const isCompactCard = card.ui_config.size === '1x1' || card.ui_config.size === '2x1' || card.ui_config.size === '1x2';
  const rangeLabelY = isCompactCard ? Math.min(height - 0.5, rangeY + 2.5) : rangeY;
  const rangeLabelBaseline = isCompactCard ? 'text-after-edge' : 'middle';

  return (
    <div ref={containerRef} className="h-full w-full min-h-0 overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full"
        role="img"
        aria-label={card.title}
      >
        <defs>
          <linearGradient id={gaugeId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={theme.start} />
            <stop offset="100%" stopColor={theme.end} />
          </linearGradient>
        </defs>

        <path d={trackPath} fill="none" stroke="hsl(var(--border))" strokeWidth={arcStrokeWidth} strokeLinecap="round" />
        <path d={progressPath} fill="none" stroke={`url(#${gaugeId})`} strokeWidth={arcStrokeWidth} strokeLinecap="round" />

        {Array.from({ length: 11 }).map((_, index) => {
          const angle = -180 + (index / 10) * 180;
          const outer = pointOnCircle(angle, radius + tickOuterOffset);
          const inner = pointOnCircle(angle, index % 5 === 0 ? radius - majorTickInset : radius - minorTickInset);
          return (
            <line
              key={index}
              x1={outer.x}
              y1={outer.y}
              x2={inner.x}
              y2={inner.y}
              stroke="hsl(var(--muted-foreground))"
              opacity={index % 5 === 0 ? 0.55 : 0.32}
              strokeWidth={index % 5 === 0 ? majorTickWidth : minorTickWidth}
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
          strokeWidth={pointerStrokeWidth}
          strokeLinecap="round"
        />
        <circle cx={centerX} cy={centerY} r={hubRadius} fill={theme.needle} />
        <circle cx={centerX} cy={centerY} r={hubInnerRadius} fill="hsl(var(--background))" />

        <text
          x={centerX}
          y={valueY}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={valueFontSize}
          fontWeight="700"
          fill="hsl(var(--foreground))"
        >
          {valueLabel}
        </text>
        <text
          x={centerX - rangeOffsetX}
          y={rangeLabelY}
          textAnchor="middle"
          dominantBaseline={rangeLabelBaseline}
          fontSize={rangeFontSize}
          fill="hsl(var(--muted-foreground))"
        >
          {minLabel}
        </text>
        <text
          x={centerX + rangeOffsetX}
          y={rangeLabelY}
          textAnchor="middle"
          dominantBaseline={rangeLabelBaseline}
          fontSize={rangeFontSize}
          fill="hsl(var(--muted-foreground))"
        >
          {maxLabel}
        </text>
      </svg>
    </div>
  );
};
