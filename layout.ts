import { Card, LayoutPosition } from './types';

export const ALL_LAYOUT_SCOPE = '__all__';
const GROUP_LAYOUT_PREFIX = 'group:';

export const resolveLayoutScope = (activeGroup?: string | null): string =>
  activeGroup && activeGroup !== 'All' ? `${GROUP_LAYOUT_PREFIX}${activeGroup}` : ALL_LAYOUT_SCOPE;

const normalizeCoordinate = (value: unknown, fallback: number): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) return Math.max(0, Math.floor(fallback));
  return Math.max(0, Math.floor(num));
};

export const normalizeLayoutPosition = (input: any, fallback: LayoutPosition): LayoutPosition => ({
  x: normalizeCoordinate(input?.x, fallback.x),
  y: normalizeCoordinate(input?.y, fallback.y),
});

export const getCardLayoutPosition = (
  card: Pick<Card, 'ui_config' | 'layout_positions'>,
  activeGroup?: string | null,
): LayoutPosition => {
  const fallback = normalizeLayoutPosition(card.ui_config, { x: 0, y: 0 });
  const scopeKey = resolveLayoutScope(activeGroup);
  const scoped = card.layout_positions?.[scopeKey];
  if (scoped) return normalizeLayoutPosition(scoped, fallback);

  if (scopeKey !== ALL_LAYOUT_SCOPE) {
    const allPosition = card.layout_positions?.[ALL_LAYOUT_SCOPE];
    if (allPosition) return normalizeLayoutPosition(allPosition, fallback);
  }

  return fallback;
};

export const setCardLayoutPosition = (
  card: Card,
  activeGroup: string | undefined,
  position: LayoutPosition,
): Card => {
  const scopeKey = resolveLayoutScope(activeGroup);
  const normalized = normalizeLayoutPosition(position, getCardLayoutPosition(card, activeGroup));
  const layout_positions = {
    ...(card.layout_positions ?? {}),
    [scopeKey]: normalized,
  };

  if (scopeKey === ALL_LAYOUT_SCOPE) {
    return {
      ...card,
      layout_positions,
      ui_config: {
        ...card.ui_config,
        x: normalized.x,
        y: normalized.y,
      },
    };
  }

  return {
    ...card,
    layout_positions,
  };
};

export const ensureCardLayoutScopes = (card: Card): Card => {
  const allPosition = getCardLayoutPosition(card, undefined);
  let next = setCardLayoutPosition(card, undefined, allPosition);

  const groupPosition = getCardLayoutPosition(next, next.group);
  next = setCardLayoutPosition(next, next.group, groupPosition);

  return next;
};
