import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { RecycleBin } from './components/RecycleBin';
import { Settings } from './components/Settings';
import { CreationWizard } from './components/CreationWizard';
import { storageService } from './services/storage';
import { clampDashboardColumns, DEFAULT_DASHBOARD_COLUMNS } from './grid';

const DEFAULT_WINDOW_WIDTH = 1380;
const SIDEBAR_EXPANDED_WIDTH = 256;
const SIDEBAR_COLLAPSED_WIDTH = 64;
const DEFAULT_RIGHT_WIDTH_EXPANDED = DEFAULT_WINDOW_WIDTH - SIDEBAR_EXPANDED_WIDTH;
const DEFAULT_RIGHT_WIDTH_COLLAPSED = DEFAULT_WINDOW_WIDTH - SIDEBAR_COLLAPSED_WIDTH;
const WINDOW_MIN_HEIGHT = 720;
const WINDOW_DEFAULT_HEIGHT = 860;

const isTauri = () => typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__);

const App: React.FC = () => {
  const {
    currentView,
    sidebarOpen,
    theme,
    language,
    initializeStore,
    isInitialized,
    cards,
    dashboardColumns,
    refreshAllCards,
    refreshCard,
  } = useStore();

  const [isWizardOpen, setWizardOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const startupRefreshDoneRef = useRef(false);
  const resumeCooldownRef = useRef(0);

  const editingCard = useMemo(
    () => cards.find((card) => card.id === editingCardId) ?? null,
    [cards, editingCardId],
  );

  useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  useEffect(() => {
    window.document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (!isTauri()) return;

    const columns = clampDashboardColumns(dashboardColumns);
    const sidebarWidth = sidebarOpen ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH;
    const baselineRightWidth = sidebarOpen ? DEFAULT_RIGHT_WIDTH_EXPANDED : DEFAULT_RIGHT_WIDTH_COLLAPSED;
    const rightWidthScale = columns / DEFAULT_DASHBOARD_COLUMNS;
    const targetRightWidth = Math.round(baselineRightWidth * rightWidthScale);
    const targetWidth = sidebarWidth + targetRightWidth;

    const resizeWindow = async () => {
      try {
        const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
        const appWindow = getCurrentWindow();

        await appWindow.setMinSize(new LogicalSize(targetWidth, WINDOW_MIN_HEIGHT));

        const outerSize = await appWindow.outerSize();
        const targetHeight = Math.max(outerSize.height, WINDOW_DEFAULT_HEIGHT, WINDOW_MIN_HEIGHT);
        await appWindow.setSize(new LogicalSize(targetWidth, targetHeight));
      } catch (error) {
        console.error('Failed to update window size for dashboard columns', error);
      }
    };

    resizeWindow();
  }, [dashboardColumns, sidebarOpen]);

  useEffect(() => {
    const unsub = useStore.subscribe((state) => {
      if (!state.isInitialized) return;

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        storageService.save({
          schema_version: 1,
          theme: state.theme,
          language: state.language,
          dashboard_columns: state.dashboardColumns,
          refresh_concurrency_limit: state.refreshConcurrencyLimit,
          cards: state.cards,
          section_markers: state.sectionMarkers,
          activeGroup: state.activeGroup,
          default_python_path: state.defaultPythonPath,
        });
      }, 600);
    });

    return () => {
      unsub();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isInitialized) return;

    if (!startupRefreshDoneRef.current) {
      startupRefreshDoneRef.current = true;
      refreshAllCards('start');
    }
  }, [isInitialized, refreshAllCards]);

  useEffect(() => {
    intervalRefs.current.forEach((interval) => clearInterval(interval));
    intervalRefs.current.clear();

    if (!isInitialized) return;

    cards.forEach((card) => {
      if (card.status.is_deleted) return;
      if (!card.refresh_config.interval_sec || card.refresh_config.interval_sec <= 0) return;

      const interval = setInterval(() => {
        refreshCard(card.id);
      }, card.refresh_config.interval_sec * 1000);

      intervalRefs.current.set(card.id, interval);
    });

    return () => {
      intervalRefs.current.forEach((interval) => clearInterval(interval));
      intervalRefs.current.clear();
    };
  }, [cards, isInitialized, refreshCard]);

  useEffect(() => {
    if (!isInitialized) return;

    const triggerResumeRefresh = () => {
      const now = Date.now();
      if (now - resumeCooldownRef.current < 1000) return;
      resumeCooldownRef.current = now;
      refreshAllCards('resume');
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        triggerResumeRefresh();
      }
    };

    window.addEventListener('focus', triggerResumeRefresh);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', triggerResumeRefresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isInitialized, refreshAllCards]);

  const openCreateWizard = () => {
    setEditingCardId(null);
    setWizardOpen(true);
  };

  const openEditWizard = (cardId: string) => {
    setEditingCardId(cardId);
    setWizardOpen(true);
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setEditingCardId(null);
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-12 w-12 bg-primary/20 rounded-full mb-4" />
          <div className="h-4 w-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased flex">
      <Sidebar />

      <main
        className={`
          flex-1 transition-all duration-300 relative h-screen overflow-hidden
          ${sidebarOpen ? 'ml-64' : 'ml-16'}
        `}
      >
        <div className="h-full overflow-hidden">
          {currentView === 'dashboard' && (
            <Dashboard onAddClick={openCreateWizard} onEditCard={openEditWizard} />
          )}
          {currentView === 'recycle_bin' && (
            <div className="h-full overflow-y-auto">
              <RecycleBin />
            </div>
          )}
          {currentView === 'settings' && (
            <div className="h-full overflow-y-auto">
              <Settings />
            </div>
          )}
        </div>
      </main>

      {isWizardOpen && <CreationWizard onClose={closeWizard} editingCard={editingCard} />}
    </div>
  );
};

export default App;
