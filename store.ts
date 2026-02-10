import { create } from 'zustand';
import { Card, ViewMode } from './types';
import { INITIAL_MOCK_CARDS } from './services/mockData';
import { storageService } from './services/storage';

// Helper to check collision
const checkCollision = (cards: Card[], x: number, y: number, w: number, h: number, excludeId?: string) => {
  return cards.some(c => {
    if (c.status.is_deleted) return false;
    if (c.id === excludeId) return false;
    
    // Parse size
    const cw = c.ui_config.size.startsWith('2') ? 2 : 1;
    const ch = c.ui_config.size.endsWith('2') ? 2 : 1;
    
    // Check overlap
    return (
      x < c.ui_config.x + cw &&
      x + w > c.ui_config.x &&
      y < c.ui_config.y + ch &&
      y + h > c.ui_config.y
    );
  });
};

interface AppState {
  // Navigation & View
  currentView: ViewMode;
  sidebarOpen: boolean;
  activeGroup: string;
  isEditMode: boolean;
  isInitialized: boolean;
  
  // Theme
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;

  // Data
  cards: Card[];
  dataPath: string; // Display string for UI
  
  // Actions
  setView: (view: ViewMode) => void;
  toggleSidebar: () => void;
  setActiveGroup: (group: string) => void;
  toggleEditMode: () => void;
  
  // Lifecycle
  initializeStore: () => Promise<void>;
  updateDataPath: (newPath: string | null) => Promise<void>;
  
  // Card Actions
  softDeleteCard: (id: string) => void;
  restoreCard: (id: string) => void;
  hardDeleteCard: (id: string) => void;
  addCard: (card: Card) => void;
  updateCardData: (id: string, data: any) => void;
  moveCard: (id: string, x: number, y: number) => void;
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

  setTheme: (theme) => set({ theme }),

  setView: (view) => set({ currentView: view }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setActiveGroup: (group) => set({ activeGroup: group }),
  toggleEditMode: () => set(state => ({ isEditMode: !state.isEditMode })),

  initializeStore: async () => {
    if (get().isInitialized) return;

    // Load data path for display
    const currentPath = await storageService.getCurrentDataPath();

    const persisted = await storageService.load();
    if (persisted) {
        set({
            theme: persisted.theme,
            cards: persisted.cards,
            activeGroup: persisted.activeGroup,
            dataPath: currentPath,
            isInitialized: true
        });
    } else {
        // First run: Load mocks
        set({
            cards: INITIAL_MOCK_CARDS,
            dataPath: currentPath,
            isInitialized: true
        });
        // Initial save
        storageService.save({
            theme: get().theme,
            cards: INITIAL_MOCK_CARDS,
            activeGroup: get().activeGroup
        });
    }
  },

  updateDataPath: async (newPath) => {
    await storageService.setCustomDataPath(newPath);
    const displayPath = await storageService.getCurrentDataPath();
    set({ dataPath: displayPath });
  },

  softDeleteCard: (id) => set((state) => ({
    cards: state.cards.map(card => 
      card.id === id 
        ? { ...card, status: { ...card.status, is_deleted: true, deleted_at: new Date().toISOString() } }
        : card
    )
  })),

  restoreCard: (id) => set((state) => ({
    cards: state.cards.map(card => 
      card.id === id 
        ? { ...card, status: { ...card.status, is_deleted: false, deleted_at: null } }
        : card
    )
  })),

  hardDeleteCard: (id) => set((state) => ({
    cards: state.cards.filter(card => card.id !== id)
  })),

  addCard: (card) => set((state) => {
    let y = 0;
    const w = card.ui_config.size.startsWith('2') ? 2 : 1;
    const h = card.ui_config.size.endsWith('2') ? 2 : 1;
    
    while (true) {
      for (let x = 0; x <= 4 - w; x++) {
        if (!checkCollision(state.cards, x, y, w, h)) {
          card.ui_config.x = x;
          card.ui_config.y = y;
          return { cards: [...state.cards, card] };
        }
      }
      y++;
    }
  }),

  updateCardData: (id, data) => set((state) => ({
    cards: state.cards.map(c => c.id === id ? { ...c, runtimeData: data } : c)
  })),

  moveCard: (id, x, y) => set((state) => ({
    cards: state.cards.map(c => c.id === id ? { ...c, ui_config: { ...c.ui_config, x, y } } : c)
  })),
}));