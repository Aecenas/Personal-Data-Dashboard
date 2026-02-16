import { create } from 'zustand';
import { Card, CardRuntimeData, AppSettings, ViewMode, AppLanguage, SectionMarker } from './types';
import { storageService } from './services/storage';
import { executionService } from './services/execution';
import { ensureCardLayoutScopes, getCardLayoutPosition, setCardLayoutPosition } from './layout';
import { clampDashboardColumns, DEFAULT_DASHBOARD_COLUMNS } from './grid';
import { DEFAULT_REFRESH_CONCURRENCY, clampRefreshConcurrency } from './refresh';

const LEGACY_SAMPLE_IDS = new Set(['1', '2', '3', '4']);
const LEGACY_SAMPLE_TITLES = new Set(['Server CPU', 'RAM Usage', 'Traffic Trend', 'Weather Status']);

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
    group: marker.group.trim() || 'Default',
    after_row: Math.max(-1, Math.floor(Number(marker.after_row) || 0)),
    start_col,
    span_col,
    line_color,
    line_style,
    line_width,
    label_align,
  };
};

const sortSectionMarkers = (markers: SectionMarker[]) =>
  markers
    .slice()
    .sort((a, b) => {
      if (a.group !== b.group) return a.group.localeCompare(b.group);
      if (a.after_row !== b.after_row) return a.after_row - b.after_row;
      if (a.start_col !== b.start_col) return a.start_col - b.start_col;
      return a.id.localeCompare(b.id);
    });

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
    },
  };
};

const mergeCard = (current: Card, updates: Partial<Card>): Card => {
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
    cache_data: {
      ...current.cache_data,
      ...(updates.cache_data ?? {}),
    },
    runtimeData: updates.runtimeData ?? current.runtimeData,
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
  dataPath: string;
  defaultPythonPath?: string;
  refreshConcurrencyLimit: number;

  setTheme: (theme: 'dark' | 'light') => void;
  setLanguage: (language: AppLanguage) => void;
  setDashboardColumns: (columns: number) => void;
  setAdaptiveWindowEnabled: (enabled: boolean) => void;
  setView: (view: ViewMode) => void;
  toggleSidebar: () => void;
  setActiveGroup: (group: string) => void;
  toggleEditMode: () => void;
  setDefaultPythonPath: (path?: string) => void;
  setRefreshConcurrencyLimit: (limit: number) => void;

  initializeStore: () => Promise<void>;
  updateDataPath: (newPath: string | null) => Promise<void>;

  softDeleteCard: (id: string) => void;
  restoreCard: (id: string) => void;
  hardDeleteCard: (id: string) => void;
  clearRecycleBin: () => void;
  addCard: (card: Card) => void;
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

export const useStore = create<AppState>((set, get) => ({
  currentView: 'dashboard',
  sidebarOpen: true,
  activeGroup: 'All',
  theme: 'dark',
  language: 'en-US',
  dashboardColumns: DEFAULT_DASHBOARD_COLUMNS,
  adaptiveWindowEnabled: true,
  isEditMode: false,
  isInitialized: false,
  cards: [],
  sectionMarkers: [],
  dataPath: '',
  defaultPythonPath: undefined,
  refreshConcurrencyLimit: DEFAULT_REFRESH_CONCURRENCY,

  setTheme: (theme) => set({ theme }),
  setLanguage: (language) => set({ language }),
  setDashboardColumns: (columns) =>
    set((state) => {
      const normalizedColumns = clampDashboardColumns(columns);
      if (normalizedColumns === state.dashboardColumns) return {};

      const cards = recalcSortOrder(reflowCardsForColumns(state.cards, normalizedColumns));
      const sectionMarkers = sortSectionMarkers(
        state.sectionMarkers.map((marker) => normalizeSectionMarker(marker, normalizedColumns)),
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
  setActiveGroup: (group) => set({ activeGroup: group }),
  toggleEditMode: () => set((state) => ({ isEditMode: !state.isEditMode })),
  setDefaultPythonPath: (path) => set({ defaultPythonPath: path?.trim() || undefined }),
  setRefreshConcurrencyLimit: (limit) => set({ refreshConcurrencyLimit: clampRefreshConcurrency(limit) }),

  initializeStore: async () => {
    if (get().isInitialized) return;

    const currentPath = await storageService.getCurrentDataPath();
    const persisted = await storageService.load();

    if (persisted) {
      const dashboardColumns = clampDashboardColumns(persisted.dashboard_columns);
      const cleanedCards = persisted.cards.filter((card) => !isLegacySampleCard(card));
      const hydratedCards = recalcSortOrder(
        reflowCardsForColumns(
          cleanedCards.map(hydrateRuntimeData).map((card) => ensureCardLayoutScopes(card)),
          dashboardColumns,
        ),
      );
      const sectionMarkers = sortSectionMarkers(
        (persisted.section_markers ?? []).map((section) => normalizeSectionMarker(section, dashboardColumns)),
      );
      set({
        theme: persisted.theme,
        language: persisted.language,
        dashboardColumns,
        adaptiveWindowEnabled: persisted.adaptive_window_enabled,
        refreshConcurrencyLimit: clampRefreshConcurrency(persisted.refresh_concurrency_limit),
        cards: hydratedCards,
        sectionMarkers,
        activeGroup: persisted.activeGroup,
        defaultPythonPath: persisted.default_python_path,
        dataPath: currentPath,
        isInitialized: true,
      });

      if (cleanedCards.length !== persisted.cards.length || persisted.dashboard_columns !== dashboardColumns) {
        await storageService.save({
          ...persisted,
          dashboard_columns: dashboardColumns,
          cards: hydratedCards,
          section_markers: sectionMarkers,
        });
      }
      return;
    }

    const hydratedCards = recalcSortOrder([]);
    const initialSettings: AppSettings = {
      schema_version: 1,
      theme: get().theme,
      language: get().language,
      dashboard_columns: get().dashboardColumns,
      adaptive_window_enabled: get().adaptiveWindowEnabled,
      refresh_concurrency_limit: get().refreshConcurrencyLimit,
      activeGroup: get().activeGroup,
      cards: hydratedCards,
      section_markers: [],
      default_python_path: undefined,
    };

    set({
      cards: hydratedCards,
      sectionMarkers: [],
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
      const card = ensureCardLayoutScopes({
        ...incomingCard,
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

      return { cards: recalcSortOrder([...state.cards, withPlacement]) };
    }),

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

      return {
        sectionMarkers: sortSectionMarkers([...state.sectionMarkers, section]),
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
      return { sectionMarkers: sortSectionMarkers(updated) };
    }),

  removeSectionMarker: (id) =>
    set((state) => ({
      sectionMarkers: state.sectionMarkers.filter((section) => section.id !== id),
    })),

  updateCard: (id, updates) =>
    set((state) => {
      const updatedCards = state.cards.map((card) => {
        if (card.id !== id) return card;

        const merged = ensureCardLayoutScopes(mergeCard(card, updates));
        if (!updates.group || updates.group === card.group) return merged;

        const previousGroupPosition = getCardLayoutPosition(card, card.group);
        return setCardLayoutPosition(merged, updates.group, previousGroupPosition);
      });

      return { cards: recalcSortOrder(updatedCards) };
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

          set((state) => ({
            cards: state.cards.map((item) => {
              if (item.id !== id) return item;

              if (result.ok && result.payload) {
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
                  runtimeData: {
                    state: 'success',
                    isLoading: false,
                    source: 'live',
                    payload: result.payload,
                    error: undefined,
                    stderr: result.rawStderr,
                    exitCode: result.exitCode,
                    durationMs: result.durationMs,
                    lastUpdated: now,
                  },
                };
              }

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
                runtimeData: {
                  state: 'error',
                  isLoading: false,
                  source: item.cache_data?.last_success_payload ? 'cache' : 'none',
                  payload: item.cache_data?.last_success_payload,
                  error: result.error,
                  stderr: result.rawStderr,
                  exitCode: result.exitCode,
                  durationMs: result.durationMs,
                  lastUpdated: now,
                },
              };
            }),
          }));
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
