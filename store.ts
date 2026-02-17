import { create } from 'zustand';
import {
  Card,
  CardRuntimeData,
  AppSettings,
  BackupConfig,
  BackupSchedule,
  BackupIntervalMinutes,
  BackupWeekday,
  ViewMode,
  AppLanguage,
  SectionMarker,
  GroupEntity,
} from './types';
import {
  BACKUP_INTERVAL_VALUES,
  DEFAULT_BACKUP_SCHEDULE,
  DEFAULT_BACKUP_WEEKDAY_VALUE,
  storageMigration,
  storageService,
  STORAGE_SCHEMA_VERSION,
  DEFAULT_BACKUP_RETENTION,
} from './services/storage';
import { executionService } from './services/execution';
import {
  AlertTriggerEvent,
  evaluateCardAlert,
  normalizeAlertConfig,
  normalizeAlertState,
} from './services/alerts';
import { notificationService } from './services/notification';
import {
  clampExecutionHistoryLimit,
  DEFAULT_EXECUTION_HISTORY_LIMIT,
  appendExecutionHistoryEntry,
  summarizeExecutionError,
  withExecutionHistoryCapacity,
} from './services/diagnostics';
import {
  ensureCardLayoutScopes,
  getCardLayoutPosition,
  renameCardLayoutScope,
  setCardLayoutPosition,
} from './layout';
import { clampDashboardColumns, DEFAULT_DASHBOARD_COLUMNS } from './grid';
import { DEFAULT_REFRESH_CONCURRENCY, clampRefreshConcurrency } from './refresh';
import { t } from './i18n';

const LEGACY_SAMPLE_IDS = new Set(['1', '2', '3', '4']);
const LEGACY_SAMPLE_TITLES = new Set(['Server CPU', 'RAM Usage', 'Traffic Trend', 'Weather Status']);
const RESERVED_ALL_GROUP = 'All';
const DEFAULT_GROUP_NAME = 'Default';
const GROUP_ID_PATTERN = /^G(\d+)$/i;
const CARD_BUSINESS_ID_PATTERN = /^G(\d+)-C(\d+)$/i;

type GroupMutationError =
  | 'empty'
  | 'reserved'
  | 'duplicate'
  | 'not_found'
  | 'target_required'
  | 'target_invalid'
  | 'target_same'
  | 'last_group';

type GroupMutationResult = { ok: true } | { ok: false; error: GroupMutationError };

type DuplicateCardError = 'not_found' | 'deleted' | 'empty_title' | 'invalid_group';
type DuplicateCardResult = { ok: true; newCardId: string } | { ok: false; error: DuplicateCardError };

export type GroupBatchOperationType = 'move_group' | 'update_interval' | 'soft_delete' | 'copy_cards';

export type GroupBatchFailureReason =
  | 'source_group_not_found'
  | 'target_group_required'
  | 'target_group_invalid'
  | 'target_group_same'
  | 'interval_invalid'
  | 'no_targets'
  | 'card_not_found'
  | 'card_not_in_group'
  | 'card_deleted'
  | 'section_not_found'
  | 'section_not_in_group'
  | 'section_operation_unsupported';

export interface GroupBatchFailure {
  entity: 'card' | 'section' | 'request';
  id: string;
  reason: GroupBatchFailureReason;
}

export interface GroupBatchResult {
  operation: GroupBatchOperationType;
  requestedCards: number;
  requestedSections: number;
  successCards: number;
  successSections: number;
  failures: GroupBatchFailure[];
}

export type GroupBatchActionRequest =
  | {
      type: 'move_group';
      sourceGroup: string;
      targetGroup: string;
      cardIds: string[];
      sectionIds: string[];
    }
  | {
      type: 'update_interval';
      sourceGroup: string;
      intervalSec: number;
      cardIds: string[];
      sectionIds: string[];
    }
  | {
      type: 'soft_delete';
      sourceGroup: string;
      cardIds: string[];
      sectionIds: string[];
    };

const inFlightCardIds = new Set<string>();
const refreshQueue: Array<() => void> = [];
let activeRefreshTaskCount = 0;

const drainRefreshQueue = (getConcurrencyLimit: () => number) => {
  const limit = clampRefreshConcurrency(getConcurrencyLimit());
  while (activeRefreshTaskCount < limit && refreshQueue.length > 0) {
    const next = refreshQueue.shift();
    if (!next) break;
    next();
  }
};

const enqueueRefreshTask = (task: () => Promise<void>, getConcurrencyLimit: () => number): Promise<void> =>
  new Promise((resolve, reject) => {
    const runTask = () => {
      activeRefreshTaskCount += 1;
      task()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          activeRefreshTaskCount = Math.max(0, activeRefreshTaskCount - 1);
          drainRefreshQueue(getConcurrencyLimit);
        });
    };

    refreshQueue.push(runTask);
    drainRefreshQueue(getConcurrencyLimit);
  });

const isLegacySampleCard = (card: Card) => {
  const path = card.script_config.path.trim();
  return LEGACY_SAMPLE_IDS.has(card.id) && LEGACY_SAMPLE_TITLES.has(card.title) && path.startsWith('/path/to/');
};

const getCardSize = (size: Card['ui_config']['size']) => ({
  w: size.startsWith('2') ? 2 : 1,
  h: size.endsWith('2') ? 2 : 1,
});

const isAllGroupName = (name: string): boolean => name.trim().toLowerCase() === RESERVED_ALL_GROUP.toLowerCase();

const normalizeGroupName = (value: unknown): string => {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_GROUP_NAME;
};

const uniqueIds = (ids: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  ids.forEach((rawId) => {
    const id = String(rawId ?? '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    result.push(id);
  });
  return result;
};

const normalizeGroupId = (value: unknown): string | undefined => {
  const raw = String(value ?? '').trim().toUpperCase();
  const matched = GROUP_ID_PATTERN.exec(raw);
  if (!matched) return undefined;
  const number = Number.parseInt(matched[1], 10);
  if (!Number.isInteger(number) || number <= 0) return undefined;
  return `G${number}`;
};

const getGroupIdNumber = (groupId: string): number => {
  const matched = GROUP_ID_PATTERN.exec(groupId);
  if (!matched) return 0;
  const number = Number.parseInt(matched[1], 10);
  return Number.isInteger(number) && number > 0 ? number : 0;
};

const formatGroupId = (number: number): string => `G${Math.max(1, Math.floor(number))}`;

const parseBusinessId = (value: unknown): { groupId: string; cardNumber: number } | null => {
  const raw = String(value ?? '').trim().toUpperCase();
  const matched = CARD_BUSINESS_ID_PATTERN.exec(raw);
  if (!matched) return null;
  const groupNumber = Number.parseInt(matched[1], 10);
  const cardNumber = Number.parseInt(matched[2], 10);
  if (!Number.isInteger(groupNumber) || groupNumber <= 0 || !Number.isInteger(cardNumber) || cardNumber <= 0) {
    return null;
  }
  return {
    groupId: formatGroupId(groupNumber),
    cardNumber,
  };
};

const normalizeGroupEntities = (
  groupsInput: GroupEntity[] | undefined,
  cards: Card[],
  sectionMarkers: SectionMarker[],
  activeGroup?: string,
): GroupEntity[] => {
  const ordered: Array<{ name: string; id?: string }> = [];
  const seenNames = new Set<string>();
  const seenIds = new Set<string>();
  let maxIdNumber = 0;

  (groupsInput ?? []).forEach((group) => {
    const normalizedId = normalizeGroupId(group.id);
    if (!normalizedId) return;
    maxIdNumber = Math.max(maxIdNumber, getGroupIdNumber(normalizedId));
  });

  const createGroupId = () => {
    let candidate = maxIdNumber + 1;
    while (seenIds.has(formatGroupId(candidate))) {
      candidate += 1;
    }
    maxIdNumber = candidate;
    const id = formatGroupId(candidate);
    seenIds.add(id);
    return id;
  };

  const pushGroup = (rawName: unknown, preferredId?: unknown) => {
    const name = normalizeGroupName(rawName);
    if (isAllGroupName(name)) return;
    if (seenNames.has(name)) return;
    seenNames.add(name);

    const normalizedPreferredId = normalizeGroupId(preferredId);
    let id: string | undefined = normalizedPreferredId;
    if (!id || seenIds.has(id)) {
      id = createGroupId();
    } else {
      seenIds.add(id);
      maxIdNumber = Math.max(maxIdNumber, getGroupIdNumber(id));
    }

    ordered.push({ name, id });
  };

  (groupsInput ?? [])
    .slice()
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.name.localeCompare(b.name);
    })
    .forEach((group) => pushGroup(group.name, group.id));

  cards.forEach((card) => pushGroup(card.group));
  sectionMarkers.forEach((section) => pushGroup(section.group));

  if (activeGroup && !isAllGroupName(activeGroup)) {
    pushGroup(activeGroup);
  }

  if (ordered.length === 0) {
    pushGroup(DEFAULT_GROUP_NAME);
  }

  return ordered.map((group, order) => ({
    id: group.id ?? createGroupId(),
    name: group.name,
    order,
  }));
};

const sortGroups = (groups: GroupEntity[]): GroupEntity[] =>
  groups
    .slice()
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      if (a.name !== b.name) return a.name.localeCompare(b.name);
      return getGroupIdNumber(a.id) - getGroupIdNumber(b.id);
    });

const orderedGroupNames = (groups: GroupEntity[]): string[] =>
  sortGroups(groups).map((group) => group.name);

const groupIdByName = (groups: GroupEntity[]): Map<string, string> =>
  new Map(sortGroups(groups).map((group) => [group.name, group.id]));

const nextGroupIdFromGroups = (groups: GroupEntity[]): string => {
  const max = groups.reduce((acc, group) => Math.max(acc, getGroupIdNumber(group.id)), 0);
  return formatGroupId(max + 1);
};

const normalizeActiveGroup = (activeGroup: string, groups: GroupEntity[]): string => {
  const groupNames = orderedGroupNames(groups);
  const fallback = groupNames[0] ?? DEFAULT_GROUP_NAME;
  const normalized = String(activeGroup ?? '').trim();
  if (!normalized || isAllGroupName(normalized)) return fallback;
  return groupNames.includes(normalized) ? normalized : fallback;
};

const normalizeCardGroup = (card: Card): Card => {
  const normalized = normalizeGroupName(card.group);
  if (normalized === card.group) return card;
  return {
    ...card,
    group: normalized,
  };
};

const normalizeCardBusinessIds = (cards: Card[], groups: GroupEntity[]): Card[] => {
  const groupIdMap = groupIdByName(groups);
  const usedBusinessIds = new Set<string>();
  const maxCardNumberByGroupId = new Map<string, number>();
  const validBusinessIdByCardId = new Map<string, string>();

  cards.forEach((card) => {
    const groupId = groupIdMap.get(card.group);
    if (!groupId) return;
    const parsed = parseBusinessId(card.business_id);
    if (!parsed) return;
    if (parsed.groupId !== groupId) return;
    const normalizedBusinessId = `${parsed.groupId}-C${parsed.cardNumber}`;
    if (usedBusinessIds.has(normalizedBusinessId)) return;
    usedBusinessIds.add(normalizedBusinessId);
    validBusinessIdByCardId.set(card.id, normalizedBusinessId);
    maxCardNumberByGroupId.set(groupId, Math.max(maxCardNumberByGroupId.get(groupId) ?? 0, parsed.cardNumber));
  });

  const nextBusinessId = (groupId: string) => {
    let candidate = (maxCardNumberByGroupId.get(groupId) ?? 0) + 1;
    let businessId = `${groupId}-C${candidate}`;
    while (usedBusinessIds.has(businessId)) {
      candidate += 1;
      businessId = `${groupId}-C${candidate}`;
    }
    usedBusinessIds.add(businessId);
    maxCardNumberByGroupId.set(groupId, candidate);
    return businessId;
  };

  return cards.map((card) => {
    const groupId = groupIdMap.get(card.group);
    if (!groupId) return card;
    const businessId = validBusinessIdByCardId.get(card.id) ?? nextBusinessId(groupId);
    if (card.business_id === businessId) return card;
    return {
      ...card,
      business_id: businessId,
    };
  });
};

const normalizeSectionMarker = (marker: SectionMarker, columns: number): SectionMarker => {
  const normalizedColumns = clampDashboardColumns(columns);
  const start_col = Math.max(0, Math.min(normalizedColumns - 1, Math.floor(Number(marker.start_col) || 0)));
  const span_col = Math.max(
    1,
    Math.min(normalizedColumns - start_col, Math.floor(Number(marker.span_col) || 1)),
  );
  const line_color: SectionMarker['line_color'] = ['primary', 'red', 'green', 'blue', 'amber'].includes(
    marker.line_color,
  )
    ? marker.line_color
    : 'primary';
  const line_style: SectionMarker['line_style'] = ['dashed', 'solid'].includes(marker.line_style)
    ? marker.line_style
    : 'dashed';
  const line_width = Math.max(1, Math.min(4, Math.floor(Number(marker.line_width) || 2))) as SectionMarker['line_width'];
  const label_align: SectionMarker['label_align'] = ['left', 'center', 'right'].includes(marker.label_align)
    ? marker.label_align
    : 'center';

  return {
    ...marker,
    title: marker.title.trim() || 'Section',
    group: normalizeGroupName(marker.group),
    after_row: Math.max(-1, Math.floor(Number(marker.after_row) || 0)),
    start_col,
    span_col,
    line_color,
    line_style,
    line_width,
    label_align,
  };
};

const sortSectionMarkers = (markers: SectionMarker[], groups: GroupEntity[] = []) => {
  const rankMap = new Map(orderedGroupNames(groups).map((name, index) => [name, index]));

  return (
  markers
    .slice()
    .sort((a, b) => {
      const rankA = rankMap.get(a.group) ?? Number.MAX_SAFE_INTEGER;
      const rankB = rankMap.get(b.group) ?? Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
      if (a.group !== b.group) return a.group.localeCompare(b.group);
      if (a.after_row !== b.after_row) return a.after_row - b.after_row;
      if (a.start_col !== b.start_col) return a.start_col - b.start_col;
      return a.id.localeCompare(b.id);
    })
  );
};

const rangesOverlap = (startA: number, lengthA: number, startB: number, lengthB: number) =>
  startA < startB + lengthB && startA + lengthA > startB;

const isWithinGrid = (x: number, y: number, w: number, h: number, columns: number) =>
  x >= 0 && y >= 0 && x + w <= columns;

const getCollidingCards = (
  cards: Card[],
  x: number,
  y: number,
  w: number,
  h: number,
  excludeId?: string,
  scopeGroup?: string,
) => {
  return cards.filter((card) => {
    if (card.status.is_deleted) return false;
    if (card.id === excludeId) return false;
    if (scopeGroup && card.group !== scopeGroup) return false;

    const position = getCardLayoutPosition(card, scopeGroup);
    const size = getCardSize(card.ui_config.size);
    return (
      x < position.x + size.w &&
      x + w > position.x &&
      y < position.y + size.h &&
      y + h > position.y
    );
  });
};

const checkCollision = (
  cards: Card[],
  x: number,
  y: number,
  w: number,
  h: number,
  excludeId?: string,
  scopeGroup?: string,
) => {
  return getCollidingCards(cards, x, y, w, h, excludeId, scopeGroup).length > 0;
};

const getDirectionalBlockers = (
  cards: Card[],
  movingCard: Card,
  scopeGroup: string | undefined,
  dx: number,
  dy: number,
) => {
  const movingPosition = getCardLayoutPosition(movingCard, scopeGroup);
  const movingSize = getCardSize(movingCard.ui_config.size);

  const blockers = cards
    .filter((card) => {
      if (card.status.is_deleted) return false;
      if (card.id === movingCard.id) return false;
      if (scopeGroup && card.group !== scopeGroup) return false;
      return true;
    })
    .map((card) => {
      const position = getCardLayoutPosition(card, scopeGroup);
      const size = getCardSize(card.ui_config.size);
      return { card, position, size };
    })
    .filter(({ position, size }) => {
      if (dx !== 0) {
        const verticalOverlap = rangesOverlap(movingPosition.y, movingSize.h, position.y, size.h);
        if (!verticalOverlap) return false;
        return dx > 0 ? position.x >= movingPosition.x + movingSize.w : position.x + size.w <= movingPosition.x;
      }

      const horizontalOverlap = rangesOverlap(movingPosition.x, movingSize.w, position.x, size.w);
      if (!horizontalOverlap) return false;
      return dy > 0 ? position.y >= movingPosition.y + movingSize.h : position.y + size.h <= movingPosition.y;
    })
    .map(({ card, position, size }) => {
      let distance = 0;
      if (dx > 0) distance = position.x - (movingPosition.x + movingSize.w);
      if (dx < 0) distance = movingPosition.x - (position.x + size.w);
      if (dy > 0) distance = position.y - (movingPosition.y + movingSize.h);
      if (dy < 0) distance = movingPosition.y - (position.y + size.h);
      return { card, distance };
    })
    .sort((a, b) => a.distance - b.distance)
    .map((item) => item.card);

  return blockers;
};

const findNextY = (cards: Card[], scopeGroup?: string) => {
  if (cards.length === 0) return 0;
  let maxY = 0;
  cards.forEach((card) => {
    if (card.status.is_deleted) return;
    if (scopeGroup && card.group !== scopeGroup) return;
    const position = getCardLayoutPosition(card, scopeGroup);
    const size = getCardSize(card.ui_config.size);
    maxY = Math.max(maxY, position.y + size.h);
  });
  return maxY;
};

const findPlacement = (
  cards: Card[],
  size: Card['ui_config']['size'],
  columns: number,
  startY = 0,
  excludeId?: string,
  scopeGroup?: string,
) => {
  const normalizedColumns = clampDashboardColumns(columns);
  const { w, h } = getCardSize(size);

  for (let y = startY; y < startY + 200; y += 1) {
    for (let x = 0; x <= normalizedColumns - w; x += 1) {
      if (!checkCollision(cards, x, y, w, h, excludeId, scopeGroup)) {
        return { x, y };
      }
    }
  }

  return { x: 0, y: startY };
};

const isPlacementValid = (
  cards: Card[],
  placement: { x: number; y: number },
  size: Card['ui_config']['size'],
  columns: number,
  excludeId?: string,
  scopeGroup?: string,
) => {
  const { w, h } = getCardSize(size);
  if (!isWithinGrid(placement.x, placement.y, w, h, columns)) return false;
  return !checkCollision(cards, placement.x, placement.y, w, h, excludeId, scopeGroup);
};

const findRelayoutPlacement = (
  cards: Card[],
  targetCard: Card,
  columns: number,
  scopeGroup?: string,
) => {
  const normalizedColumns = clampDashboardColumns(columns);
  const currentPosition = getCardLayoutPosition(targetCard, scopeGroup);
  const preferredPlacement = findPlacement(
    cards,
    targetCard.ui_config.size,
    normalizedColumns,
    Math.max(0, currentPosition.y),
    targetCard.id,
    scopeGroup,
  );
  if (isPlacementValid(cards, preferredPlacement, targetCard.ui_config.size, normalizedColumns, targetCard.id, scopeGroup)) {
    return preferredPlacement;
  }

  const fallbackStartY = findNextY(
    cards.filter((card) => !card.status.is_deleted && card.id !== targetCard.id),
    scopeGroup,
  );
  const fallbackPlacement = findPlacement(
    cards,
    targetCard.ui_config.size,
    normalizedColumns,
    fallbackStartY,
    targetCard.id,
    scopeGroup,
  );
  if (isPlacementValid(cards, fallbackPlacement, targetCard.ui_config.size, normalizedColumns, targetCard.id, scopeGroup)) {
    return fallbackPlacement;
  }

  return findPlacement(cards, targetCard.ui_config.size, normalizedColumns, 0, targetCard.id, scopeGroup);
};

const relayoutCardIfNeeded = (
  cards: Card[],
  targetCard: Card,
  columns: number,
  scopeGroup?: string,
) => {
  if (targetCard.status.is_deleted) return targetCard;

  const currentPosition = getCardLayoutPosition(targetCard, scopeGroup);
  if (isPlacementValid(cards, currentPosition, targetCard.ui_config.size, columns, targetCard.id, scopeGroup)) {
    return targetCard;
  }

  const nextPlacement = findRelayoutPlacement(cards, targetCard, columns, scopeGroup);
  return setCardLayoutPosition(targetCard, scopeGroup, nextPlacement);
};

interface LayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const hasRectCollision = (rects: LayoutRect[], x: number, y: number, w: number, h: number) =>
  rects.some((rect) => x < rect.x + rect.w && x + w > rect.x && y < rect.y + rect.h && y + h > rect.y);

const findReflowPlacement = (
  occupiedRects: LayoutRect[],
  w: number,
  h: number,
  columns: number,
  preferredX: number,
  preferredY: number,
) => {
  const clampedX = Math.max(0, Math.min(columns - w, Math.floor(preferredX)));
  const startY = Math.max(0, Math.floor(preferredY));

  if (!hasRectCollision(occupiedRects, clampedX, startY, w, h)) {
    return { x: clampedX, y: startY };
  }

  for (let x = 0; x <= columns - w; x += 1) {
    if (!hasRectCollision(occupiedRects, x, startY, w, h)) {
      return { x, y: startY };
    }
  }

  for (let y = startY + 1; y < startY + 500; y += 1) {
    for (let x = 0; x <= columns - w; x += 1) {
      if (!hasRectCollision(occupiedRects, x, y, w, h)) {
        return { x, y };
      }
    }
  }

  return { x: 0, y: startY };
};

const reflowLayoutScope = (cards: Card[], columns: number, scopeGroup?: string) => {
  const normalizedColumns = clampDashboardColumns(columns);
  const candidates = cards
    .filter((card) => !card.status.is_deleted)
    .filter((card) => (scopeGroup ? card.group === scopeGroup : true))
    .slice()
    .sort((a, b) => {
      const posA = getCardLayoutPosition(a, scopeGroup);
      const posB = getCardLayoutPosition(b, scopeGroup);
      if (posA.y !== posB.y) return posA.y - posB.y;
      if (posA.x !== posB.x) return posA.x - posB.x;
      if (a.status.sort_order !== b.status.sort_order) return a.status.sort_order - b.status.sort_order;
      return a.id.localeCompare(b.id);
    });

  const occupiedRects: LayoutRect[] = [];
  const placements = new Map<string, { x: number; y: number }>();

  candidates.forEach((card) => {
    const { w, h } = getCardSize(card.ui_config.size);
    const currentPosition = getCardLayoutPosition(card, scopeGroup);
    const placement = findReflowPlacement(
      occupiedRects,
      w,
      h,
      normalizedColumns,
      currentPosition.x,
      currentPosition.y,
    );
    placements.set(card.id, placement);
    occupiedRects.push({ x: placement.x, y: placement.y, w, h });
  });

  return cards.map((card) => {
    const placement = placements.get(card.id);
    if (!placement) return card;
    return setCardLayoutPosition(card, scopeGroup, placement);
  });
};

const reflowCardsForColumns = (cards: Card[], columns: number): Card[] => {
  const normalizedColumns = clampDashboardColumns(columns);
  const withScopes = cards.map((card) => ensureCardLayoutScopes(card));

  let next = reflowLayoutScope(withScopes, normalizedColumns);
  const groups = Array.from(new Set(next.map((card) => card.group).filter((group) => group.trim().length > 0))).sort();
  groups.forEach((group) => {
    next = reflowLayoutScope(next, normalizedColumns, group);
  });

  return next;
};

const recalcSortOrder = (cards: Card[]): Card[] => {
  const visibleSorted = cards
    .filter((card) => !card.status.is_deleted)
    .slice()
    .sort((a, b) => {
      const posA = getCardLayoutPosition(a, undefined);
      const posB = getCardLayoutPosition(b, undefined);
      if (posA.y !== posB.y) return posA.y - posB.y;
      return posA.x - posB.x;
    });

  const orderMap = new Map<string, number>();
  visibleSorted.forEach((card, index) => {
    orderMap.set(card.id, index + 1);
  });

  return cards.map((card) => ({
    ...card,
    status: {
      ...card.status,
      sort_order: orderMap.get(card.id) ?? card.status.sort_order,
    },
  }));
};

const hydrateRuntimeData = (card: Card): Card => {
  const cachedPayload = card.cache_data?.last_success_payload;

  if (cachedPayload) {
    const runtimeData: CardRuntimeData = {
      state: 'success',
      isLoading: false,
      source: 'cache',
      payload: cachedPayload,
      thresholdAlertTriggered: false,
      lastUpdated: card.cache_data?.last_success_at,
      error: card.cache_data?.last_error,
      stderr: card.cache_data?.stderr_excerpt,
      exitCode: card.cache_data?.last_exit_code,
      durationMs: card.cache_data?.last_duration_ms,
    };

    return { ...card, runtimeData };
  }

  if (card.cache_data?.last_error) {
    return {
      ...card,
      runtimeData: {
        state: 'error',
        isLoading: false,
        source: 'cache',
        thresholdAlertTriggered: false,
        error: card.cache_data.last_error,
        stderr: card.cache_data.stderr_excerpt,
        exitCode: card.cache_data.last_exit_code,
        durationMs: card.cache_data.last_duration_ms,
        lastUpdated: card.cache_data.last_error_at,
      },
    };
  }

  return {
    ...card,
    runtimeData: {
      state: 'idle',
      isLoading: false,
      source: 'none',
      thresholdAlertTriggered: false,
    },
  };
};

const formatAlertNumber = (value: number): string => {
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, '');
};

const statusStateLabel = (language: AppLanguage, state: string | undefined): string => {
  if (!state) return '-';
  if (state === 'ok' || state === 'warning' || state === 'error' || state === 'unknown') {
    return t(language, `alerts.state.${state}`);
  }
  return state;
};

const buildAlertNotificationBody = (
  language: AppLanguage,
  cardTitle: string,
  event: AlertTriggerEvent,
) => {
  if (event.reason === 'status_change') {
    return t(language, 'alerts.statusChangedBody', {
      cardTitle,
      from: statusStateLabel(language, event.fromState),
      to: statusStateLabel(language, event.toState),
    });
  }

  if (event.reason === 'upper_threshold') {
    return t(language, 'alerts.upperThresholdBody', {
      cardTitle,
      value: formatAlertNumber(event.value ?? NaN),
      threshold: formatAlertNumber(event.threshold ?? NaN),
    });
  }

  return t(language, 'alerts.lowerThresholdBody', {
    cardTitle,
    value: formatAlertNumber(event.value ?? NaN),
    threshold: formatAlertNumber(event.threshold ?? NaN),
  });
};

const mergeCard = (current: Card, updates: Partial<Card>): Card => {
  const baseAlertState = normalizeAlertState(current.alert_state);
  const mergedAlertState = updates.alert_state
    ? {
        ...baseAlertState,
        ...updates.alert_state,
        condition_last_trigger_at: {
          ...baseAlertState.condition_last_trigger_at,
          ...(updates.alert_state.condition_last_trigger_at ?? {}),
        },
      }
    : current.alert_state;

  return {
    ...current,
    ...updates,
    script_config: {
      ...current.script_config,
      ...(updates.script_config ?? {}),
    },
    mapping_config: {
      ...current.mapping_config,
      ...(updates.mapping_config ?? {}),
    },
    refresh_config: {
      ...current.refresh_config,
      ...(updates.refresh_config ?? {}),
    },
    ui_config: {
      ...current.ui_config,
      ...(updates.ui_config ?? {}),
    },
    status: {
      ...current.status,
      ...(updates.status ?? {}),
    },
    alert_config: updates.alert_config
      ? {
          ...normalizeAlertConfig(current.alert_config),
          ...updates.alert_config,
        }
      : current.alert_config,
    alert_state: mergedAlertState,
    cache_data: {
      ...current.cache_data,
      ...(updates.cache_data ?? {}),
    },
    runtimeData: updates.runtimeData ?? current.runtimeData,
  };
};

const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  directory: undefined,
  retention_count: DEFAULT_BACKUP_RETENTION,
  auto_backup_enabled: true,
  schedule: DEFAULT_BACKUP_SCHEDULE,
};

const getBackupScheduleTime = (schedule: BackupSchedule): { hour: number; minute: number } => {
  if (schedule.mode === 'daily' || schedule.mode === 'weekly') {
    return { hour: schedule.hour, minute: schedule.minute };
  }
  return { hour: 3, minute: 0 };
};

interface NormalizedSettingsForStore {
  dashboardColumns: number;
  cards: Card[];
  sectionMarkers: SectionMarker[];
  groups: GroupEntity[];
  activeGroup: string;
  backupConfig: BackupConfig;
}

const normalizeSettingsForStore = (settings: AppSettings): NormalizedSettingsForStore => {
  const dashboardColumns = clampDashboardColumns(settings.dashboard_columns);
  const cleanedCards = settings.cards.filter((card) => !isLegacySampleCard(card));
  const cards = recalcSortOrder(
    reflowCardsForColumns(
      cleanedCards
        .map(normalizeCardGroup)
        .map(hydrateRuntimeData)
        .map((card) => ensureCardLayoutScopes(card)),
      dashboardColumns,
    ),
  );
  const sectionMarkers = (settings.section_markers ?? []).map((section) =>
    normalizeSectionMarker(section, dashboardColumns),
  );
  const groups = normalizeGroupEntities(settings.groups, cards, sectionMarkers, settings.activeGroup);
  const cardsWithBusinessIds = normalizeCardBusinessIds(cards, groups);
  const normalizedSections = sortSectionMarkers(sectionMarkers, groups);
  const activeGroup = normalizeActiveGroup(settings.activeGroup, groups);

  return {
    dashboardColumns,
    cards: cardsWithBusinessIds,
    sectionMarkers: normalizedSections,
    groups,
    activeGroup,
    backupConfig: storageMigration.normalizeBackupConfig(settings.backup_config ?? DEFAULT_BACKUP_CONFIG),
  };
};

interface AppState {
  currentView: ViewMode;
  sidebarOpen: boolean;
  activeGroup: string;
  isEditMode: boolean;
  isInitialized: boolean;

  theme: 'dark' | 'light';
  language: AppLanguage;
  dashboardColumns: number;
  adaptiveWindowEnabled: boolean;
  cards: Card[];
  sectionMarkers: SectionMarker[];
  groups: GroupEntity[];
  dataPath: string;
  backupDirectory?: string;
  backupRetentionCount: number;
  backupAutoEnabled: boolean;
  backupSchedule: BackupSchedule;
  defaultPythonPath?: string;
  refreshConcurrencyLimit: number;
  executionHistoryLimit: number;

  setTheme: (theme: 'dark' | 'light') => void;
  setLanguage: (language: AppLanguage) => void;
  setDashboardColumns: (columns: number) => void;
  setAdaptiveWindowEnabled: (enabled: boolean) => void;
  setView: (view: ViewMode) => void;
  toggleSidebar: () => void;
  setActiveGroup: (group: string) => void;
  toggleEditMode: () => void;
  setDefaultPythonPath: (path?: string) => void;
  setBackupDirectory: (path?: string) => void;
  setBackupRetentionCount: (count: number) => void;
  setBackupAutoEnabled: (enabled: boolean) => void;
  setBackupScheduleMode: (mode: BackupSchedule['mode']) => void;
  setBackupIntervalMinutes: (minutes: BackupIntervalMinutes) => void;
  setBackupDailyTime: (hour: number, minute: number) => void;
  setBackupWeeklySchedule: (weekday: BackupWeekday, hour: number, minute: number) => void;
  setRefreshConcurrencyLimit: (limit: number) => void;
  setExecutionHistoryLimit: (limit: number) => void;
  applyImportedSettings: (settings: AppSettings) => Promise<void>;

  initializeStore: () => Promise<void>;
  updateDataPath: (newPath: string | null) => Promise<void>;

  softDeleteCard: (id: string) => void;
  restoreCard: (id: string) => void;
  hardDeleteCard: (id: string) => void;
  clearRecycleBin: () => void;
  addCard: (card: Card) => void;
  duplicateCard: (id: string, overrides?: { title?: string; group?: string }) => DuplicateCardResult;
  duplicateCardsToGroup: (sourceGroup: string, targetGroup: string, cardIds: string[]) => GroupBatchResult;
  createGroup: (name: string) => GroupMutationResult;
  renameGroup: (fromName: string, toName: string) => GroupMutationResult;
  reorderGroups: (orderedNames: string[]) => void;
  deleteGroup: (name: string, targetGroup?: string) => GroupMutationResult;
  executeGroupBatchAction: (request: GroupBatchActionRequest) => GroupBatchResult;
  addSectionMarker: (
    section: Omit<SectionMarker, 'id' | 'line_color' | 'line_style' | 'line_width' | 'label_align'> & {
      id?: string;
      line_color?: SectionMarker['line_color'];
      line_style?: SectionMarker['line_style'];
      line_width?: SectionMarker['line_width'];
      label_align?: SectionMarker['label_align'];
    },
  ) => void;
  updateSectionMarker: (id: string, updates: Partial<SectionMarker>) => void;
  removeSectionMarker: (id: string) => void;
  updateCard: (id: string, updates: Partial<Card>) => void;
  moveCard: (id: string, x: number, y: number, scopeGroup?: string) => boolean;

  refreshCard: (id: string) => Promise<void>;
  refreshAllCards: (reason?: 'manual' | 'start' | 'resume') => Promise<void>;
}

export const buildSettingsPayload = (state: Pick<
  AppState,
  | 'theme'
  | 'language'
  | 'dashboardColumns'
  | 'adaptiveWindowEnabled'
  | 'refreshConcurrencyLimit'
  | 'executionHistoryLimit'
  | 'backupDirectory'
  | 'backupRetentionCount'
  | 'backupAutoEnabled'
  | 'backupSchedule'
  | 'activeGroup'
  | 'groups'
  | 'cards'
  | 'sectionMarkers'
  | 'defaultPythonPath'
>): AppSettings => ({
  schema_version: STORAGE_SCHEMA_VERSION,
  theme: state.theme,
  language: state.language,
  dashboard_columns: state.dashboardColumns,
  adaptive_window_enabled: state.adaptiveWindowEnabled,
  refresh_concurrency_limit: state.refreshConcurrencyLimit,
  execution_history_limit: state.executionHistoryLimit,
  backup_config: storageMigration.normalizeBackupConfig({
    directory: state.backupDirectory,
    retention_count: state.backupRetentionCount,
    auto_backup_enabled: state.backupAutoEnabled,
    schedule: state.backupSchedule,
  }),
  activeGroup: state.activeGroup,
  groups: state.groups,
  cards: state.cards,
  section_markers: state.sectionMarkers,
  default_python_path: state.defaultPythonPath,
});

export const useStore = create<AppState>((set, get) => ({
  currentView: 'dashboard',
  sidebarOpen: true,
  activeGroup: DEFAULT_GROUP_NAME,
  theme: 'light',
  language: 'zh-CN',
  dashboardColumns: DEFAULT_DASHBOARD_COLUMNS,
  adaptiveWindowEnabled: true,
  isEditMode: false,
  isInitialized: false,
  cards: [],
  sectionMarkers: [],
  groups: [{ id: 'G1', name: DEFAULT_GROUP_NAME, order: 0 }],
  dataPath: '',
  backupDirectory: DEFAULT_BACKUP_CONFIG.directory,
  backupRetentionCount: DEFAULT_BACKUP_CONFIG.retention_count,
  backupAutoEnabled: DEFAULT_BACKUP_CONFIG.auto_backup_enabled,
  backupSchedule: DEFAULT_BACKUP_CONFIG.schedule,
  defaultPythonPath: undefined,
  refreshConcurrencyLimit: DEFAULT_REFRESH_CONCURRENCY,
  executionHistoryLimit: DEFAULT_EXECUTION_HISTORY_LIMIT,

  setTheme: (theme) => set({ theme }),
  setLanguage: (language) => set({ language }),
  setDashboardColumns: (columns) =>
    set((state) => {
      const normalizedColumns = clampDashboardColumns(columns);
      if (normalizedColumns === state.dashboardColumns) return {};

      const cards = recalcSortOrder(reflowCardsForColumns(state.cards, normalizedColumns));
      const sectionMarkers = sortSectionMarkers(
        state.sectionMarkers.map((marker) => normalizeSectionMarker(marker, normalizedColumns)),
        state.groups,
      );

      return {
        dashboardColumns: normalizedColumns,
        cards,
        sectionMarkers,
      };
    }),
  setAdaptiveWindowEnabled: (enabled) => set({ adaptiveWindowEnabled: Boolean(enabled) }),
  setView: (view) => set({ currentView: view }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setActiveGroup: (group) =>
    set((state) => {
      const activeGroup = normalizeActiveGroup(group, state.groups);
      if (activeGroup === state.activeGroup) return {};
      return { activeGroup };
    }),
  toggleEditMode: () => set((state) => ({ isEditMode: !state.isEditMode })),
  setDefaultPythonPath: (path) => set({ defaultPythonPath: path?.trim() || undefined }),
  setBackupDirectory: (path) => set({ backupDirectory: path?.trim() || undefined }),
  setBackupRetentionCount: (count) =>
    set({
      backupRetentionCount: storageMigration.clampBackupRetentionCount(count),
    }),
  setBackupAutoEnabled: (enabled) =>
    set({
      backupAutoEnabled: Boolean(enabled),
    }),
  setBackupScheduleMode: (mode) =>
    set((state) => {
      const currentTime = getBackupScheduleTime(state.backupSchedule);
      const defaultTime = getBackupScheduleTime(DEFAULT_BACKUP_SCHEDULE);

      if (mode === 'interval') {
        return {
          backupSchedule: {
            mode,
            every_minutes:
              state.backupSchedule.mode === 'interval'
                ? state.backupSchedule.every_minutes
                : BACKUP_INTERVAL_VALUES[0],
          },
        };
      }

      if (mode === 'weekly') {
        return {
          backupSchedule: {
            mode,
            weekday:
              state.backupSchedule.mode === 'weekly'
                ? state.backupSchedule.weekday
                : DEFAULT_BACKUP_WEEKDAY_VALUE,
            hour: currentTime.hour,
            minute: currentTime.minute,
          },
        };
      }

      return {
        backupSchedule: {
          mode: 'daily',
          hour: currentTime.hour ?? defaultTime.hour,
          minute: currentTime.minute ?? defaultTime.minute,
        },
      };
    }),
  setBackupIntervalMinutes: (minutes) =>
    set((state) => {
      if (state.backupSchedule.mode !== 'interval') return {};
      return {
        backupSchedule: {
          mode: 'interval',
          every_minutes: storageMigration.normalizeIntervalMinutes(minutes),
        },
      };
    }),
  setBackupDailyTime: (hour, minute) =>
    set((state) => {
      if (state.backupSchedule.mode !== 'daily') return {};
      return {
        backupSchedule: {
          mode: 'daily',
          hour: Math.max(0, Math.min(23, Math.floor(hour))),
          minute: Math.max(0, Math.min(59, Math.floor(minute))),
        },
      };
    }),
  setBackupWeeklySchedule: (weekday, hour, minute) =>
    set((state) => {
      if (state.backupSchedule.mode !== 'weekly') return {};
      return {
        backupSchedule: {
          mode: 'weekly',
          weekday: Math.max(0, Math.min(6, Math.floor(weekday))) as BackupWeekday,
          hour: Math.max(0, Math.min(23, Math.floor(hour))),
          minute: Math.max(0, Math.min(59, Math.floor(minute))),
        },
      };
    }),
  setRefreshConcurrencyLimit: (limit) => set({ refreshConcurrencyLimit: clampRefreshConcurrency(limit) }),
  setExecutionHistoryLimit: (limit) =>
    set((state) => {
      const normalizedLimit = clampExecutionHistoryLimit(limit);
      if (normalizedLimit === state.executionHistoryLimit) return {};

      const cards = state.cards.map((card) => {
        if (!card.execution_history) return card;
        const executionHistory = withExecutionHistoryCapacity(card.execution_history, normalizedLimit);
        return {
          ...card,
          execution_history: executionHistory.size > 0 ? executionHistory : undefined,
        };
      });

      return {
        executionHistoryLimit: normalizedLimit,
        cards,
      };
    }),

  initializeStore: async () => {
    if (get().isInitialized) return;

    const currentPath = await storageService.getCurrentDataPath();
    const persisted = await storageService.load();

    if (persisted) {
      const normalized = normalizeSettingsForStore(persisted);
      set({
        theme: persisted.theme,
        language: persisted.language,
        dashboardColumns: normalized.dashboardColumns,
        adaptiveWindowEnabled: persisted.adaptive_window_enabled,
        refreshConcurrencyLimit: clampRefreshConcurrency(persisted.refresh_concurrency_limit),
        executionHistoryLimit: clampExecutionHistoryLimit(persisted.execution_history_limit),
        cards: normalized.cards,
        sectionMarkers: normalized.sectionMarkers,
        groups: normalized.groups,
        backupDirectory: normalized.backupConfig.directory,
        backupRetentionCount: normalized.backupConfig.retention_count,
        backupAutoEnabled: normalized.backupConfig.auto_backup_enabled,
        backupSchedule: normalized.backupConfig.schedule,
        activeGroup: normalized.activeGroup,
        defaultPythonPath: persisted.default_python_path,
        dataPath: currentPath,
        isInitialized: true,
      });

      if (
        normalized.cards.length !== persisted.cards.length ||
        persisted.dashboard_columns !== normalized.dashboardColumns ||
        persisted.backup_config?.retention_count !== normalized.backupConfig.retention_count ||
        persisted.backup_config?.auto_backup_enabled !== normalized.backupConfig.auto_backup_enabled ||
        JSON.stringify(persisted.backup_config?.schedule) !== JSON.stringify(normalized.backupConfig.schedule) ||
        persisted.backup_config?.directory !== normalized.backupConfig.directory ||
        persisted.activeGroup !== normalized.activeGroup ||
        JSON.stringify(persisted.groups ?? []) !== JSON.stringify(normalized.groups)
      ) {
        await storageService.save({
          ...persisted,
          dashboard_columns: normalized.dashboardColumns,
          activeGroup: normalized.activeGroup,
          groups: normalized.groups,
          cards: normalized.cards,
          section_markers: normalized.sectionMarkers,
          backup_config: normalized.backupConfig,
        });
      }
      return;
    }

    const cards = recalcSortOrder([]);
    const initialSettings: AppSettings = buildSettingsPayload({
      ...get(),
      cards,
      sectionMarkers: [],
    });

    set({
      cards,
      sectionMarkers: [],
      groups: get().groups,
      dashboardColumns: get().dashboardColumns,
      dataPath: currentPath,
      isInitialized: true,
    });

    await storageService.save(initialSettings);
  },

  updateDataPath: async (newPath) => {
    await storageService.setCustomDataPath(newPath);
    const displayPath = await storageService.getCurrentDataPath();
    set({ dataPath: displayPath });
  },

  applyImportedSettings: async (settings) => {
    const displayPath = await storageService.getCurrentDataPath();
    const normalized = normalizeSettingsForStore(settings);
    const persisted: AppSettings = {
      ...settings,
      schema_version: STORAGE_SCHEMA_VERSION,
      dashboard_columns: normalized.dashboardColumns,
      activeGroup: normalized.activeGroup,
      groups: normalized.groups,
      cards: normalized.cards,
      section_markers: normalized.sectionMarkers,
      backup_config: normalized.backupConfig,
    };

    set({
      theme: settings.theme,
      language: settings.language,
      dashboardColumns: normalized.dashboardColumns,
      adaptiveWindowEnabled: settings.adaptive_window_enabled,
      refreshConcurrencyLimit: clampRefreshConcurrency(settings.refresh_concurrency_limit),
      executionHistoryLimit: clampExecutionHistoryLimit(settings.execution_history_limit),
      cards: normalized.cards,
      sectionMarkers: normalized.sectionMarkers,
      groups: normalized.groups,
      backupDirectory: normalized.backupConfig.directory,
      backupRetentionCount: normalized.backupConfig.retention_count,
      backupAutoEnabled: normalized.backupConfig.auto_backup_enabled,
      backupSchedule: normalized.backupConfig.schedule,
      activeGroup: normalized.activeGroup,
      defaultPythonPath: settings.default_python_path,
      dataPath: displayPath,
      isInitialized: true,
    });

    await storageService.save(persisted);
  },

  softDeleteCard: (id) =>
    set((state) => {
      const updated = state.cards.map((card) =>
        card.id === id
          ? {
              ...card,
              status: {
                ...card.status,
                is_deleted: true,
                deleted_at: new Date().toISOString(),
              },
            }
          : card,
      );
      return { cards: recalcSortOrder(updated) };
    }),

  restoreCard: (id) =>
    set((state) => {
      const target = state.cards.find((card) => card.id === id);
      if (!target) return { cards: state.cards };

      const baseCards = state.cards.map((card) =>
        card.id === id
          ? {
              ...card,
              status: {
                ...card.status,
                is_deleted: false,
                deleted_at: null,
              },
            }
          : card,
      );

      const visibleCards = baseCards.filter(
        (card) => !card.status.is_deleted && card.id !== id && card.group === target.group,
      );
      const startY = findNextY(visibleCards, target.group);
      const groupPlacement = findPlacement(
        baseCards,
        target.ui_config.size,
        state.dashboardColumns,
        startY,
        id,
        target.group,
      );

      const allVisibleCards = baseCards.filter((card) => !card.status.is_deleted && card.id !== id);
      const allStartY = findNextY(allVisibleCards);
      const allPlacement = findPlacement(baseCards, target.ui_config.size, state.dashboardColumns, allStartY, id);

      const placedCards = baseCards.map((card) =>
        card.id === id
          ? setCardLayoutPosition(
              setCardLayoutPosition(ensureCardLayoutScopes(card), target.group, groupPlacement),
              undefined,
              allPlacement,
            )
          : card,
      );

      return { cards: recalcSortOrder(placedCards) };
    }),

  hardDeleteCard: (id) =>
    set((state) => ({
      cards: recalcSortOrder(state.cards.filter((card) => card.id !== id)),
    })),

  clearRecycleBin: () =>
    set((state) => ({
      cards: recalcSortOrder(state.cards.filter((card) => !card.status.is_deleted)),
    })),

  addCard: (incomingCard) =>
    set((state) => {
      const normalizedGroup = normalizeGroupName(incomingCard.group);
      const card = ensureCardLayoutScopes({
        ...incomingCard,
        group: normalizedGroup,
        alert_config: normalizeAlertConfig(incomingCard.alert_config),
        alert_state: normalizeAlertState(incomingCard.alert_state),
        status: {
          ...incomingCard.status,
          is_deleted: false,
          deleted_at: null,
          sort_order:
            incomingCard.status?.sort_order ??
            state.cards.filter((item) => !item.status.is_deleted).length + 1,
        },
      });

      const allPlacement = findPlacement(state.cards, card.ui_config.size, state.dashboardColumns, 0);
      const groupPlacement = findPlacement(
        state.cards,
        card.ui_config.size,
        state.dashboardColumns,
        0,
        undefined,
        card.group,
      );
      const withPlacement = setCardLayoutPosition(
        setCardLayoutPosition(card, card.group, groupPlacement),
        undefined,
        allPlacement,
      );
      const cards = recalcSortOrder([...state.cards, withPlacement]);
      const groups = normalizeGroupEntities(state.groups, cards, state.sectionMarkers, state.activeGroup);
      const normalizedCards = normalizeCardBusinessIds(cards, groups);
      const activeGroup = normalizeActiveGroup(state.activeGroup, groups);

      return { cards: normalizedCards, groups, activeGroup };
    }),

  duplicateCard: (sourceCardId, overrides) => {
    let result: DuplicateCardResult = { ok: false, error: 'not_found' };

    set((state) => {
      const source = state.cards.find((card) => card.id === sourceCardId);
      if (!source) {
        result = { ok: false, error: 'not_found' };
        return {};
      }
      if (source.status.is_deleted) {
        result = { ok: false, error: 'deleted' };
        return {};
      }

      const title = String(overrides?.title ?? `${source.title}_Copy`).trim();
      if (!title) {
        result = { ok: false, error: 'empty_title' };
        return {};
      }

      const targetGroup = normalizeGroupName(overrides?.group ?? source.group);
      if (isAllGroupName(targetGroup) || !orderedGroupNames(state.groups).includes(targetGroup)) {
        result = { ok: false, error: 'invalid_group' };
        return {};
      }

      const newCardId = crypto.randomUUID();
      const duplicated: Card = ensureCardLayoutScopes({
        ...source,
        id: newCardId,
        business_id: undefined,
        title,
        group: targetGroup,
        layout_positions: undefined,
        status: {
          ...source.status,
          is_deleted: false,
          deleted_at: null,
          sort_order: source.status.sort_order,
        },
      });

      const allPlacement = findPlacement(state.cards, duplicated.ui_config.size, state.dashboardColumns, 0);
      const groupPlacement = findPlacement(
        state.cards,
        duplicated.ui_config.size,
        state.dashboardColumns,
        0,
        undefined,
        targetGroup,
      );
      const withPlacement = setCardLayoutPosition(
        setCardLayoutPosition(duplicated, targetGroup, groupPlacement),
        undefined,
        allPlacement,
      );

      const cards = recalcSortOrder([...state.cards, withPlacement]);
      const groups = normalizeGroupEntities(state.groups, cards, state.sectionMarkers, state.activeGroup);
      const normalizedCards = normalizeCardBusinessIds(cards, groups);
      const activeGroup = normalizeActiveGroup(state.activeGroup, groups);

      result = { ok: true, newCardId };
      return { cards: normalizedCards, groups, activeGroup };
    });

    return result;
  },

  duplicateCardsToGroup: (sourceGroupRaw, targetGroupRaw, cardIdsRaw) => {
    const sourceGroup = String(sourceGroupRaw ?? '').trim();
    const targetGroup = String(targetGroupRaw ?? '').trim();
    const uniqueCardIds = uniqueIds(cardIdsRaw ?? []);
    const report: GroupBatchResult = {
      operation: 'copy_cards',
      requestedCards: uniqueCardIds.length,
      requestedSections: 0,
      successCards: 0,
      successSections: 0,
      failures: [],
    };

    set((state) => {
      const groupNames = orderedGroupNames(state.groups);
      if (!groupNames.includes(sourceGroup)) {
        report.failures.push({ entity: 'request', id: sourceGroup, reason: 'source_group_not_found' });
        return {};
      }
      if (!targetGroup) {
        report.failures.push({ entity: 'request', id: '', reason: 'target_group_required' });
        return {};
      }
      if (!groupNames.includes(targetGroup)) {
        report.failures.push({ entity: 'request', id: targetGroup, reason: 'target_group_invalid' });
        return {};
      }
      if (uniqueCardIds.length === 0) {
        report.failures.push({ entity: 'request', id: '', reason: 'no_targets' });
        return {};
      }

      let cards = state.cards.slice();

      uniqueCardIds.forEach((cardId) => {
        const card = state.cards.find((item) => item.id === cardId);
        if (!card) {
          report.failures.push({ entity: 'card', id: cardId, reason: 'card_not_found' });
          return;
        }
        if (card.status.is_deleted) {
          report.failures.push({ entity: 'card', id: cardId, reason: 'card_deleted' });
          return;
        }
        if (card.group !== sourceGroup) {
          report.failures.push({ entity: 'card', id: cardId, reason: 'card_not_in_group' });
          return;
        }

        const duplicated: Card = ensureCardLayoutScopes({
          ...card,
          id: crypto.randomUUID(),
          title: `${card.title} (Copy)`,
          group: targetGroup,
          status: {
            ...card.status,
            is_deleted: false,
            deleted_at: null,
            sort_order: card.status.sort_order,
          },
          runtimeData: card.runtimeData,
        });

        const allPlacement = findPlacement(cards, duplicated.ui_config.size, state.dashboardColumns, 0);
        const groupPlacement = findPlacement(
          cards,
          duplicated.ui_config.size,
          state.dashboardColumns,
          0,
          undefined,
          targetGroup,
        );
        const placed = setCardLayoutPosition(
          setCardLayoutPosition(duplicated, targetGroup, groupPlacement),
          undefined,
          allPlacement,
        );
        cards = [...cards, placed];
        report.successCards += 1;
      });

      if (report.successCards === 0) {
        return {};
      }

      cards = recalcSortOrder(cards);
      const groups = normalizeGroupEntities(state.groups, cards, state.sectionMarkers, state.activeGroup);
      const normalizedCards = normalizeCardBusinessIds(cards, groups);
      const activeGroup = normalizeActiveGroup(state.activeGroup, groups);

      return { cards: normalizedCards, groups, activeGroup };
    });

    return report;
  },

  executeGroupBatchAction: (request) => {
    const sourceGroup = String(request.sourceGroup ?? '').trim();
    const uniqueCardIds = uniqueIds(request.cardIds ?? []);
    const uniqueSectionIds = uniqueIds(request.sectionIds ?? []);
    const report: GroupBatchResult = {
      operation: request.type,
      requestedCards: uniqueCardIds.length,
      requestedSections: uniqueSectionIds.length,
      successCards: 0,
      successSections: 0,
      failures: [],
    };

    set((state) => {
      const groupNames = orderedGroupNames(state.groups);
      if (!groupNames.includes(sourceGroup)) {
        report.failures.push({ entity: 'request', id: sourceGroup, reason: 'source_group_not_found' });
        return {};
      }
      if (uniqueCardIds.length === 0 && uniqueSectionIds.length === 0) {
        report.failures.push({ entity: 'request', id: '', reason: 'no_targets' });
        return {};
      }

      const validCardIds = new Set<string>();
      uniqueCardIds.forEach((cardId) => {
        const card = state.cards.find((item) => item.id === cardId);
        if (!card) {
          report.failures.push({ entity: 'card', id: cardId, reason: 'card_not_found' });
          return;
        }
        if (card.status.is_deleted) {
          report.failures.push({ entity: 'card', id: cardId, reason: 'card_deleted' });
          return;
        }
        if (card.group !== sourceGroup) {
          report.failures.push({ entity: 'card', id: cardId, reason: 'card_not_in_group' });
          return;
        }
        validCardIds.add(cardId);
      });

      const validSectionIds = new Set<string>();
      uniqueSectionIds.forEach((sectionId) => {
        const section = state.sectionMarkers.find((item) => item.id === sectionId);
        if (!section) {
          report.failures.push({ entity: 'section', id: sectionId, reason: 'section_not_found' });
          return;
        }
        if (section.group !== sourceGroup) {
          report.failures.push({ entity: 'section', id: sectionId, reason: 'section_not_in_group' });
          return;
        }
        validSectionIds.add(sectionId);
      });

      if (request.type === 'update_interval') {
        const intervalSec = Number(request.intervalSec);
        if (!Number.isFinite(intervalSec) || intervalSec < 0) {
          report.failures.push({ entity: 'request', id: String(request.intervalSec), reason: 'interval_invalid' });
          return {};
        }
        validSectionIds.forEach((sectionId) => {
          report.failures.push({ entity: 'section', id: sectionId, reason: 'section_operation_unsupported' });
        });

        if (validCardIds.size === 0) {
          return {};
        }

        const cards = state.cards.map((card) => {
          if (!validCardIds.has(card.id)) return card;
          report.successCards += 1;
          return {
            ...card,
            refresh_config: {
              ...card.refresh_config,
              interval_sec: Math.floor(intervalSec),
            },
          };
        });

        return { cards: normalizeCardBusinessIds(cards, state.groups) };
      }

      if (request.type === 'soft_delete') {
        const now = new Date().toISOString();
        const cards = recalcSortOrder(
          state.cards.map((card) => {
            if (!validCardIds.has(card.id)) return card;
            report.successCards += 1;
            return {
              ...card,
              status: {
                ...card.status,
                is_deleted: true,
                deleted_at: now,
              },
            };
          }),
        );
        const sectionMarkers = state.sectionMarkers.filter((section) => {
          if (!validSectionIds.has(section.id)) return true;
          report.successSections += 1;
          return false;
        });

        const groups = normalizeGroupEntities(state.groups, cards, sectionMarkers, state.activeGroup);
        const normalizedCards = normalizeCardBusinessIds(cards, groups);
        const activeGroup = normalizeActiveGroup(state.activeGroup, groups);

        return {
          cards: normalizedCards,
          groups,
          activeGroup,
          sectionMarkers: sortSectionMarkers(sectionMarkers, groups),
        };
      }

      const targetGroup = String(request.targetGroup ?? '').trim();
      if (!targetGroup) {
        report.failures.push({ entity: 'request', id: '', reason: 'target_group_required' });
        return {};
      }
      if (!groupNames.includes(targetGroup)) {
        report.failures.push({ entity: 'request', id: targetGroup, reason: 'target_group_invalid' });
        return {};
      }
      if (targetGroup === sourceGroup) {
        report.failures.push({ entity: 'request', id: targetGroup, reason: 'target_group_same' });
        return {};
      }

      let cards = state.cards.map((card) => {
        if (!validCardIds.has(card.id)) return card;
        report.successCards += 1;
        const changed = ensureCardLayoutScopes({
          ...card,
          group: targetGroup,
        });
        return renameCardLayoutScope(changed, sourceGroup, targetGroup);
      });

      if (report.successCards > 0) {
        cards = reflowLayoutScope(cards, state.dashboardColumns, sourceGroup);
        cards = reflowLayoutScope(cards, state.dashboardColumns, targetGroup);
        cards = recalcSortOrder(cards);
      }

      const sectionMarkers = state.sectionMarkers.map((section) => {
        if (!validSectionIds.has(section.id)) return section;
        report.successSections += 1;
        return {
          ...section,
          group: targetGroup,
        };
      });
      const groups = normalizeGroupEntities(state.groups, cards, sectionMarkers, state.activeGroup);
      const normalizedCards = normalizeCardBusinessIds(cards, groups);
      const activeGroup = normalizeActiveGroup(state.activeGroup, groups);

      return {
        cards: normalizedCards,
        groups,
        activeGroup,
        sectionMarkers: sortSectionMarkers(sectionMarkers, groups),
      };
    });

    return report;
  },

  createGroup: (rawName) => {
    let result: GroupMutationResult = { ok: false, error: 'empty' };

    set((state) => {
      const name = String(rawName ?? '').trim();
      if (!name) {
        result = { ok: false, error: 'empty' };
        return {};
      }
      if (isAllGroupName(name)) {
        result = { ok: false, error: 'reserved' };
        return {};
      }
      if (orderedGroupNames(state.groups).includes(name)) {
        result = { ok: false, error: 'duplicate' };
        return {};
      }

      const groups = normalizeGroupEntities(
        [...state.groups, { id: nextGroupIdFromGroups(state.groups), name, order: state.groups.length }],
        state.cards,
        state.sectionMarkers,
        state.activeGroup,
      );
      result = { ok: true };
      return { groups };
    });

    return result;
  },

  renameGroup: (fromRaw, toRaw) => {
    let result: GroupMutationResult = { ok: false, error: 'not_found' };

    set((state) => {
      const fromName = String(fromRaw ?? '').trim();
      const toName = String(toRaw ?? '').trim();
      if (!fromName || !orderedGroupNames(state.groups).includes(fromName)) {
        result = { ok: false, error: 'not_found' };
        return {};
      }
      if (!toName) {
        result = { ok: false, error: 'empty' };
        return {};
      }
      if (isAllGroupName(toName)) {
        result = { ok: false, error: 'reserved' };
        return {};
      }
      if (fromName !== toName && orderedGroupNames(state.groups).includes(toName)) {
        result = { ok: false, error: 'duplicate' };
        return {};
      }
      if (fromName === toName) {
        result = { ok: true };
        return {};
      }

      const cards = recalcSortOrder(
        state.cards.map((card) => {
          if (card.group !== fromName) return card;
          const nextCard = ensureCardLayoutScopes({
            ...card,
            group: toName,
          });
          return renameCardLayoutScope(nextCard, fromName, toName);
        }),
      );
      const sectionMarkers = state.sectionMarkers.map((section) =>
        section.group === fromName ? { ...section, group: toName } : section,
      );
      const renamedGroups = state.groups.map((group) =>
        group.name === fromName ? { ...group, name: toName } : group,
      );
      const nextActiveGroupCandidate = state.activeGroup === fromName ? toName : state.activeGroup;
      const groups = normalizeGroupEntities(renamedGroups, cards, sectionMarkers, nextActiveGroupCandidate);
      const activeGroup = normalizeActiveGroup(nextActiveGroupCandidate, groups);

      result = { ok: true };
      return {
        cards,
        groups,
        activeGroup,
        sectionMarkers: sortSectionMarkers(sectionMarkers, groups),
      };
    });

    return result;
  },

  reorderGroups: (orderedNamesRaw) =>
    set((state) => {
      const currentNames = orderedGroupNames(state.groups);
      const currentSet = new Set(currentNames);
      const nextNames: string[] = [];
      const seen = new Set<string>();

      orderedNamesRaw.forEach((name) => {
        const normalized = String(name ?? '').trim();
        if (!normalized || seen.has(normalized)) return;
        if (!currentSet.has(normalized)) return;
        seen.add(normalized);
        nextNames.push(normalized);
      });

      currentNames.forEach((name) => {
        if (seen.has(name)) return;
        nextNames.push(name);
      });

      if (nextNames.length === 0) return {};
      if (nextNames.length === currentNames.length && nextNames.every((name, index) => name === currentNames[index])) {
        return {};
      }

      const idByName = new Map(state.groups.map((group) => [group.name, group.id]));
      const groups = nextNames.map((name, order) => ({
        id: idByName.get(name) ?? formatGroupId(order + 1),
        name,
        order,
      }));
      return {
        groups,
        sectionMarkers: sortSectionMarkers(state.sectionMarkers, groups),
      };
    }),

  deleteGroup: (nameRaw, targetRaw) => {
    let result: GroupMutationResult = { ok: false, error: 'not_found' };

    set((state) => {
      const name = String(nameRaw ?? '').trim();
      const groupNames = orderedGroupNames(state.groups);
      if (!name || !groupNames.includes(name)) {
        result = { ok: false, error: 'not_found' };
        return {};
      }
      if (groupNames.length <= 1) {
        result = { ok: false, error: 'last_group' };
        return {};
      }

      const cardsToMove = state.cards.filter((card) => card.group === name);
      const markersToMove = state.sectionMarkers.filter((section) => section.group === name);
      const migrationRequired = cardsToMove.length > 0 || markersToMove.length > 0;
      const target = targetRaw ? String(targetRaw).trim() : '';

      if (migrationRequired && !target) {
        result = { ok: false, error: 'target_required' };
        return {};
      }
      if (target && target === name) {
        result = { ok: false, error: 'target_same' };
        return {};
      }
      if (target && !groupNames.includes(target)) {
        result = { ok: false, error: 'target_invalid' };
        return {};
      }

      let cards = state.cards;
      if (target) {
        cards = cards.map((card) => {
          if (card.group !== name) return card;
          const renamed = renameCardLayoutScope(
            ensureCardLayoutScopes({
              ...card,
              group: target,
            }),
            name,
            target,
          );
          return renamed;
        });
        cards = reflowLayoutScope(cards, state.dashboardColumns, target);
        cards = recalcSortOrder(cards);
      }

      const nextSectionMarkers = state.sectionMarkers
        .map((section) => {
          if (section.group !== name) return section;
          if (!target) return null;
          return {
            ...section,
            group: target,
          };
        })
        .filter((section): section is SectionMarker => Boolean(section));

      const groups = groupNames
        .filter((groupName) => groupName !== name)
        .map((groupName, order) => {
          const matched = state.groups.find((group) => group.name === groupName);
          return {
            id: matched?.id ?? formatGroupId(order + 1),
            name: groupName,
            order,
          };
        });

      const activeGroupCandidate =
        state.activeGroup === name ? (target || groups[0]?.name || DEFAULT_GROUP_NAME) : state.activeGroup;
      const activeGroup = normalizeActiveGroup(activeGroupCandidate, groups);
      const normalizedCards = normalizeCardBusinessIds(cards, groups);

      result = { ok: true };
      return {
        cards: normalizedCards,
        groups,
        activeGroup,
        sectionMarkers: sortSectionMarkers(nextSectionMarkers, groups),
      };
    });

    return result;
  },

  addSectionMarker: (incomingSection) =>
    set((state) => {
      const section = normalizeSectionMarker({
        id: incomingSection.id ?? crypto.randomUUID(),
        title: incomingSection.title,
        group: incomingSection.group,
        after_row: incomingSection.after_row,
        start_col: incomingSection.start_col,
        span_col: incomingSection.span_col,
        line_color: incomingSection.line_color ?? 'primary',
        line_style: incomingSection.line_style ?? 'dashed',
        line_width: incomingSection.line_width ?? 2,
        label_align: incomingSection.label_align ?? 'center',
      }, state.dashboardColumns);
      const nextMarkers = [...state.sectionMarkers, section];
      const groups = normalizeGroupEntities(state.groups, state.cards, nextMarkers, state.activeGroup);

      return {
        groups,
        sectionMarkers: sortSectionMarkers(nextMarkers, groups),
      };
    }),

  updateSectionMarker: (id, updates) =>
    set((state) => {
      const updated = state.sectionMarkers.map((section) => {
        if (section.id !== id) return section;
        return normalizeSectionMarker({
          ...section,
          ...updates,
          id: section.id,
        }, state.dashboardColumns);
      });
      const groups = normalizeGroupEntities(state.groups, state.cards, updated, state.activeGroup);
      return { groups, sectionMarkers: sortSectionMarkers(updated, groups) };
    }),

  removeSectionMarker: (id) =>
    set((state) => {
      const sectionMarkers = state.sectionMarkers.filter((section) => section.id !== id);
      return {
        sectionMarkers: sortSectionMarkers(sectionMarkers, state.groups),
      };
    }),

  updateCard: (id, updates) =>
    set((state) => {
      let targetCardUpdated = false;
      let sizeChanged = false;

      const updatedCards = state.cards.map((card) => {
        if (card.id !== id) return card;
        targetCardUpdated = true;

        const nextGroup = updates.group ? normalizeGroupName(updates.group) : card.group;
        const sanitizedUpdates: Partial<Card> = {
          ...updates,
          group: nextGroup,
        };
        if (isAllGroupName(nextGroup)) {
          sanitizedUpdates.group = card.group;
        }

        const merged = ensureCardLayoutScopes(mergeCard(card, sanitizedUpdates));
        sizeChanged = merged.ui_config.size !== card.ui_config.size;
        if (!sanitizedUpdates.group || sanitizedUpdates.group === card.group) return merged;

        const previousGroupPosition = getCardLayoutPosition(card, card.group);
        const withNewPosition = setCardLayoutPosition(merged, sanitizedUpdates.group, previousGroupPosition);
        return renameCardLayoutScope(withNewPosition, card.group, sanitizedUpdates.group);
      });

      if (!targetCardUpdated) {
        return {};
      }

      let cards = updatedCards;

      if (sizeChanged && !state.isEditMode) {
        const targetCard = cards.find((card) => card.id === id);
        if (targetCard && !targetCard.status.is_deleted) {
          let relocated = relayoutCardIfNeeded(cards, targetCard, state.dashboardColumns, targetCard.group);
          cards = cards.map((card) => (card.id === id ? relocated : card));

          relocated = relayoutCardIfNeeded(cards, relocated, state.dashboardColumns);
          cards = cards.map((card) => (card.id === id ? relocated : card));
        }
      }

      cards = recalcSortOrder(cards);
      const groups = normalizeGroupEntities(state.groups, cards, state.sectionMarkers, state.activeGroup);
      const normalizedCards = normalizeCardBusinessIds(cards, groups);
      const activeGroup = normalizeActiveGroup(state.activeGroup, groups);

      return { cards: normalizedCards, groups, activeGroup };
    }),

  moveCard: (id, x, y, scopeGroup) => {
    let moved = false;

    set((state) => {
      const card = state.cards.find((item) => item.id === id);
      if (!card || card.status.is_deleted) return { cards: state.cards };

      if (scopeGroup && card.group !== scopeGroup) return { cards: state.cards };

      const currentPosition = getCardLayoutPosition(card, scopeGroup);
      const dx = x - currentPosition.x;
      const dy = y - currentPosition.y;
      const isSingleStepMove = Math.abs(dx) + Math.abs(dy) === 1;

      const { w, h } = getCardSize(card.ui_config.size);
      if (!isWithinGrid(x, y, w, h, state.dashboardColumns)) return { cards: state.cards };

      const blockingCards = getCollidingCards(state.cards, x, y, w, h, id, scopeGroup);
      if (blockingCards.length === 0) {
        moved = true;
        const movedCards = state.cards.map((item) =>
          item.id === id ? setCardLayoutPosition(item, scopeGroup, { x, y }) : item,
        );

        return { cards: recalcSortOrder(movedCards) };
      }

      if (!isSingleStepMove || blockingCards.length !== 1) return { cards: state.cards };

      const blocker = blockingCards[0];
      const blockersInDirection = getDirectionalBlockers(state.cards, card, scopeGroup, dx, dy);
      if (blockersInDirection.length !== 1 || blockersInDirection[0].id !== blocker.id) {
        return { cards: state.cards };
      }

      const blockerPosition = getCardLayoutPosition(blocker, scopeGroup);
      const blockerSize = getCardSize(blocker.ui_config.size);
      const sameSize = blockerSize.w === w && blockerSize.h === h;

      if (sameSize) {
        moved = true;
        const swappedCards = state.cards.map((item) => {
          if (item.id === id) return setCardLayoutPosition(item, scopeGroup, blockerPosition);
          if (item.id === blocker.id) return setCardLayoutPosition(item, scopeGroup, currentPosition);
          return item;
        });

        return { cards: recalcSortOrder(swappedCards) };
      }

      const leapTarget = { x: currentPosition.x, y: currentPosition.y };
      if (dx === 1) leapTarget.x = blockerPosition.x + blockerSize.w;
      if (dx === -1) leapTarget.x = blockerPosition.x - w;
      if (dy === 1) leapTarget.y = blockerPosition.y + blockerSize.h;
      if (dy === -1) leapTarget.y = blockerPosition.y - h;

      if (!isWithinGrid(leapTarget.x, leapTarget.y, w, h, state.dashboardColumns)) {
        return { cards: state.cards };
      }
      if (checkCollision(state.cards, leapTarget.x, leapTarget.y, w, h, id, scopeGroup)) {
        return { cards: state.cards };
      }

      moved = true;
      const movedCards = state.cards.map((item) =>
        item.id === id ? setCardLayoutPosition(item, scopeGroup, leapTarget) : item,
      );

      return { cards: recalcSortOrder(movedCards) };
    });

    return moved;
  },

  refreshCard: async (id) => {
    if (inFlightCardIds.has(id)) return;
    inFlightCardIds.add(id);
    try {
      await enqueueRefreshTask(
        async () => {
          const snapshot = get();
          const card = snapshot.cards.find((item) => item.id === id);
          if (!card || card.status.is_deleted) return;

          set((state) => ({
            cards: state.cards.map((item) => {
              if (item.id !== id) return item;

              return {
                ...item,
                runtimeData: {
                  state: 'loading',
                  isLoading: true,
                  source: item.runtimeData?.source ?? 'none',
                  payload: item.runtimeData?.payload ?? item.cache_data?.last_success_payload,
                  thresholdAlertTriggered: false,
                  error: undefined,
                  stderr: undefined,
                  exitCode: undefined,
                  durationMs: undefined,
                  lastUpdated: item.runtimeData?.lastUpdated,
                },
              };
            }),
          }));

          const result = await executionService.runCard(card, snapshot.defaultPythonPath);
          const now = Date.now();
          const pendingNotifications: Array<{ title: string; body: string }> = [];

          set((state) => ({
            cards: state.cards.map((item) => {
              if (item.id !== id) return item;

              if (result.ok && result.payload) {
                const alertEvaluation = evaluateCardAlert({
                  cardType: item.type,
                  payload: result.payload,
                  config: item.alert_config,
                  state: item.alert_state,
                  now,
                });
                const thresholdTriggered = alertEvaluation.events.some(
                  (event) => event.reason === 'upper_threshold' || event.reason === 'lower_threshold',
                );

                alertEvaluation.events.forEach((event) => {
                  pendingNotifications.push({
                    title: t(snapshot.language, 'alerts.notificationTitle', { cardTitle: item.title }),
                    body: buildAlertNotificationBody(snapshot.language, item.title, event),
                  });
                });

                const executionHistoryEntry = {
                  executed_at: now,
                  duration_ms: result.durationMs,
                  ok: true,
                  timed_out: result.timedOut,
                  exit_code: result.exitCode,
                };

                return {
                  ...item,
                  cache_data: {
                    ...item.cache_data,
                    last_success_payload: result.payload,
                    last_success_at: now,
                    last_error: undefined,
                    last_error_at: undefined,
                    raw_stdout_excerpt: result.rawStdout?.slice(0, 500),
                    stderr_excerpt: result.rawStderr?.slice(0, 500),
                    last_exit_code: result.exitCode,
                    last_duration_ms: result.durationMs,
                  },
                  execution_history: appendExecutionHistoryEntry(
                    withExecutionHistoryCapacity(item.execution_history, snapshot.executionHistoryLimit),
                    executionHistoryEntry,
                    snapshot.executionHistoryLimit,
                  ),
                  alert_state: alertEvaluation.nextState,
                  runtimeData: {
                    state: 'success',
                    isLoading: false,
                    source: 'live',
                    payload: result.payload,
                    thresholdAlertTriggered: thresholdTriggered,
                    error: undefined,
                    stderr: result.rawStderr,
                    exitCode: result.exitCode,
                    durationMs: result.durationMs,
                    lastUpdated: now,
                  },
                };
              }

              const executionHistoryEntry = {
                executed_at: now,
                duration_ms: result.durationMs,
                ok: false,
                timed_out: result.timedOut,
                exit_code: result.exitCode,
                error_summary: summarizeExecutionError(result.error, result.rawStderr),
              };

              return {
                ...item,
                cache_data: {
                  ...item.cache_data,
                  last_error: result.error,
                  last_error_at: now,
                  raw_stdout_excerpt: result.rawStdout?.slice(0, 500),
                  stderr_excerpt: result.rawStderr?.slice(0, 500),
                  last_exit_code: result.exitCode,
                  last_duration_ms: result.durationMs,
                },
                execution_history: appendExecutionHistoryEntry(
                  withExecutionHistoryCapacity(item.execution_history, snapshot.executionHistoryLimit),
                  executionHistoryEntry,
                  snapshot.executionHistoryLimit,
                ),
                runtimeData: {
                  state: 'error',
                  isLoading: false,
                  source: item.cache_data?.last_success_payload ? 'cache' : 'none',
                  payload: item.cache_data?.last_success_payload,
                  thresholdAlertTriggered: false,
                  error: result.error,
                  stderr: result.rawStderr,
                  exitCode: result.exitCode,
                  durationMs: result.durationMs,
                  lastUpdated: now,
                },
              };
            }),
          }));

          for (const notification of pendingNotifications) {
            await notificationService.sendDesktopNotification(notification.title, notification.body);
          }
        },
        () => get().refreshConcurrencyLimit,
      );
    } finally {
      inFlightCardIds.delete(id);
    }
  },

  refreshAllCards: async (reason = 'manual') => {
    const state = get();

    const targets = state.cards.filter((card) => {
      if (card.status.is_deleted) return false;
      if (reason === 'start') return card.refresh_config.refresh_on_start;
      if (reason === 'resume') return card.refresh_config.refresh_on_resume;
      return true;
    });

    await Promise.all(targets.map((card) => get().refreshCard(card.id)));
  },
}));
