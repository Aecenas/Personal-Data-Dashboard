import { create } from 'zustand';
import { Card, CardRuntimeData, AppSettings, ViewMode } from './types';
import { INITIAL_MOCK_CARDS } from './services/mockData';
import { storageService } from './services/storage';
import { executionService } from './services/execution';

const GRID_COLUMNS = 4;

const inFlightCardIds = new Set<string>();

const getCardSize = (size: Card['ui_config']['size']) => ({
  w: size.startsWith('2') ? 2 : 1,
  h: size.endsWith('2') ? 2 : 1,
});

const checkCollision = (
  cards: Card[],
  x: number,
  y: number,
  w: number,
  h: number,
  excludeId?: string,
) => {
  return cards.some((card) => {
    if (card.status.is_deleted) return false;
    if (card.id === excludeId) return false;

    const size = getCardSize(card.ui_config.size);
    return (
      x < card.ui_config.x + size.w &&
      x + w > card.ui_config.x &&
      y < card.ui_config.y + size.h &&
      y + h > card.ui_config.y
    );
  });
};

const findNextY = (cards: Card[]) => {
  if (cards.length === 0) return 0;
  let maxY = 0;
  cards.forEach((card) => {
    if (card.status.is_deleted) return;
    const size = getCardSize(card.ui_config.size);
    maxY = Math.max(maxY, card.ui_config.y + size.h);
  });
  return maxY;
};

const findPlacement = (cards: Card[], size: Card['ui_config']['size'], startY = 0, excludeId?: string) => {
  const { w, h } = getCardSize(size);

  for (let y = startY; y < startY + 200; y += 1) {
    for (let x = 0; x <= GRID_COLUMNS - w; x += 1) {
      if (!checkCollision(cards, x, y, w, h, excludeId)) {
        return { x, y };
      }
    }
  }

  return { x: 0, y: startY };
};

const recalcSortOrder = (cards: Card[]): Card[] => {
  const visibleSorted = cards
    .filter((card) => !card.status.is_deleted)
    .slice()
    .sort((a, b) => {
      if (a.ui_config.y !== b.ui_config.y) return a.ui_config.y - b.ui_config.y;
      return a.ui_config.x - b.ui_config.x;
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
  cards: Card[];
  dataPath: string;
  defaultPythonPath?: string;

  setTheme: (theme: 'dark' | 'light') => void;
  setView: (view: ViewMode) => void;
  toggleSidebar: () => void;
  setActiveGroup: (group: string) => void;
  toggleEditMode: () => void;
  setDefaultPythonPath: (path?: string) => void;

  initializeStore: () => Promise<void>;
  updateDataPath: (newPath: string | null) => Promise<void>;

  softDeleteCard: (id: string) => void;
  restoreCard: (id: string) => void;
  hardDeleteCard: (id: string) => void;
  clearRecycleBin: () => void;
  addCard: (card: Card) => void;
  updateCard: (id: string, updates: Partial<Card>) => void;
  moveCard: (id: string, x: number, y: number) => void;

  refreshCard: (id: string) => Promise<void>;
  refreshAllCards: (reason?: 'manual' | 'start' | 'resume') => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  currentView: 'dashboard',
  sidebarOpen: true,
  activeGroup: 'All',
  theme: 'dark',
  isEditMode: false,
  isInitialized: false,
  cards: [],
  dataPath: 'Loading...',
  defaultPythonPath: undefined,

  setTheme: (theme) => set({ theme }),
  setView: (view) => set({ currentView: view }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setActiveGroup: (group) => set({ activeGroup: group }),
  toggleEditMode: () => set((state) => ({ isEditMode: !state.isEditMode })),
  setDefaultPythonPath: (path) => set({ defaultPythonPath: path?.trim() || undefined }),

  initializeStore: async () => {
    if (get().isInitialized) return;

    const currentPath = await storageService.getCurrentDataPath();
    const persisted = await storageService.load();

    if (persisted) {
      const hydratedCards = recalcSortOrder(persisted.cards.map(hydrateRuntimeData));
      set({
        theme: persisted.theme,
        cards: hydratedCards,
        activeGroup: persisted.activeGroup,
        defaultPythonPath: persisted.default_python_path,
        dataPath: currentPath,
        isInitialized: true,
      });
      return;
    }

    const hydratedCards = recalcSortOrder(INITIAL_MOCK_CARDS.map(hydrateRuntimeData));
    const initialSettings: AppSettings = {
      schema_version: 1,
      theme: get().theme,
      activeGroup: get().activeGroup,
      cards: hydratedCards,
      default_python_path: undefined,
    };

    set({
      cards: hydratedCards,
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

      const visibleCards = baseCards.filter((card) => !card.status.is_deleted && card.id !== id);
      const startY = findNextY(visibleCards);
      const placement = findPlacement(baseCards, target.ui_config.size, startY, id);

      const placedCards = baseCards.map((card) =>
        card.id === id
          ? {
              ...card,
              ui_config: {
                ...card.ui_config,
                x: placement.x,
                y: placement.y,
              },
            }
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
      const card = {
        ...incomingCard,
        status: {
          ...incomingCard.status,
          is_deleted: false,
          deleted_at: null,
          sort_order:
            incomingCard.status?.sort_order ??
            state.cards.filter((item) => !item.status.is_deleted).length + 1,
        },
      };

      const placement = findPlacement(state.cards, card.ui_config.size, 0);
      const withPlacement: Card = {
        ...card,
        ui_config: {
          ...card.ui_config,
          x: placement.x,
          y: placement.y,
        },
      };

      return { cards: recalcSortOrder([...state.cards, withPlacement]) };
    }),

  updateCard: (id, updates) =>
    set((state) => {
      const updatedCards = state.cards.map((card) => {
        if (card.id !== id) return card;
        return mergeCard(card, updates);
      });

      return { cards: recalcSortOrder(updatedCards) };
    }),

  moveCard: (id, x, y) =>
    set((state) => {
      const card = state.cards.find((item) => item.id === id);
      if (!card || card.status.is_deleted) return { cards: state.cards };

      const { w, h } = getCardSize(card.ui_config.size);
      if (x < 0 || y < 0 || x + w > GRID_COLUMNS) return { cards: state.cards };
      if (checkCollision(state.cards, x, y, w, h, id)) return { cards: state.cards };

      const movedCards = state.cards.map((item) =>
        item.id === id
          ? {
              ...item,
              ui_config: {
                ...item.ui_config,
                x,
                y,
              },
            }
          : item,
      );

      return { cards: recalcSortOrder(movedCards) };
    }),

  refreshCard: async (id) => {
    if (inFlightCardIds.has(id)) return;

    const snapshot = get();
    const card = snapshot.cards.find((item) => item.id === id);
    if (!card || card.status.is_deleted) return;

    inFlightCardIds.add(id);

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

    inFlightCardIds.delete(id);
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
