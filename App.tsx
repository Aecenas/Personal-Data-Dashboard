import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { RecycleBin } from './components/RecycleBin';
import { Settings } from './components/Settings';
import { Diagnostics } from './components/Diagnostics';
import { CreationWizard } from './components/CreationWizard';
import { storageService, STORAGE_SCHEMA_VERSION } from './services/storage';
import { clampDashboardColumns, DEFAULT_DASHBOARD_COLUMNS } from './grid';

const DEFAULT_WINDOW_WIDTH = 1380;
const WINDOW_MIN_WIDTH = 730;
const SIDEBAR_EXPANDED_WIDTH = 256;
const SIDEBAR_COLLAPSED_WIDTH = 64;
const DEFAULT_RIGHT_WIDTH_EXPANDED = DEFAULT_WINDOW_WIDTH - SIDEBAR_EXPANDED_WIDTH;
const DEFAULT_RIGHT_WIDTH_COLLAPSED = DEFAULT_WINDOW_WIDTH - SIDEBAR_COLLAPSED_WIDTH;
const WINDOW_MIN_HEIGHT = 720;
const WINDOW_DEFAULT_HEIGHT = 860;
const BASELINE_MONITOR_WIDTH = 1920;
const BASELINE_MONITOR_HEIGHT = 1080;
const MIN_WINDOW_WIDTH_ABSOLUTE = 620;
const MIN_WINDOW_HEIGHT_ABSOLUTE = 500;
const MAX_WORKAREA_USAGE_RATIO = 0.96;
const MIN_SCREEN_SCALE = 0.72;
const MAX_SCREEN_SCALE = 1.7;

const isTauri = () => typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface WindowSizingOptions {
  columns: number;
  sidebarOpen: boolean;
  adaptiveWindowEnabled: boolean;
  currentHeight: number;
  workAreaWidth: number;
  workAreaHeight: number;
}

const calculateWindowSize = ({
  columns,
  sidebarOpen,
  adaptiveWindowEnabled,
  currentHeight,
  workAreaWidth,
  workAreaHeight,
}: WindowSizingOptions) => {
  const sidebarWidth = sidebarOpen ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH;
  const baselineRightWidth = sidebarOpen ? DEFAULT_RIGHT_WIDTH_EXPANDED : DEFAULT_RIGHT_WIDTH_COLLAPSED;
  const baselineMinRightWidth = WINDOW_MIN_WIDTH - sidebarWidth;
  const rightWidthScale = columns / DEFAULT_DASHBOARD_COLUMNS;
  const adaptiveScreenScale = adaptiveWindowEnabled
    ? clamp(
        Math.min(workAreaWidth / BASELINE_MONITOR_WIDTH, workAreaHeight / BASELINE_MONITOR_HEIGHT),
        MIN_SCREEN_SCALE,
        MAX_SCREEN_SCALE,
      )
    : 1;

  const maxWidth = Math.max(MIN_WINDOW_WIDTH_ABSOLUTE, Math.floor(workAreaWidth * MAX_WORKAREA_USAGE_RATIO));
  const maxHeight = Math.max(MIN_WINDOW_HEIGHT_ABSOLUTE, Math.floor(workAreaHeight * MAX_WORKAREA_USAGE_RATIO));
  const minWidth = clamp(
    Math.round(sidebarWidth + baselineMinRightWidth * adaptiveScreenScale),
    MIN_WINDOW_WIDTH_ABSOLUTE,
    maxWidth,
  );
  const minHeight = clamp(
    Math.round(WINDOW_MIN_HEIGHT * adaptiveScreenScale),
    MIN_WINDOW_HEIGHT_ABSOLUTE,
    maxHeight,
  );
  const targetWidth = clamp(
    Math.round(sidebarWidth + baselineRightWidth * rightWidthScale * adaptiveScreenScale),
    minWidth,
    maxWidth,
  );
  const targetHeight = clamp(
    Math.round(Math.max(currentHeight, WINDOW_DEFAULT_HEIGHT * adaptiveScreenScale)),
    minHeight,
    maxHeight,
  );

  return {
    minWidth,
    minHeight,
    targetWidth,
    targetHeight,
  };
};

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
    adaptiveWindowEnabled,
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
    let disposed = false;
    let resizeQueued = false;
    let resizing = false;
    let moveResizeTimer: ReturnType<typeof setTimeout> | null = null;
    let unlistenScaleChanged: (() => void) | undefined;
    let unlistenMoved: (() => void) | undefined;

    const resizeWindow = async (): Promise<void> => {
      try {
        const { getCurrentWindow, LogicalSize, currentMonitor } = await import('@tauri-apps/api/window');
        const appWindow = getCurrentWindow();
        const [fullscreen, maximized] = await Promise.all([appWindow.isFullscreen(), appWindow.isMaximized()]);
        if (fullscreen || maximized) return;
        const monitor = await currentMonitor();
        const scaleFactor = monitor?.scaleFactor || (await appWindow.scaleFactor()) || 1;
        const innerSize = await appWindow.innerSize();
        const currentLogicalWidth = innerSize.width / scaleFactor;
        const currentLogicalHeight = innerSize.height / scaleFactor;
        const fallbackWorkAreaWidth = currentLogicalWidth;
        const fallbackWorkAreaHeight = currentLogicalHeight;
        const workAreaWidth = monitor ? monitor.workArea.size.width / scaleFactor : fallbackWorkAreaWidth;
        const workAreaHeight = monitor ? monitor.workArea.size.height / scaleFactor : fallbackWorkAreaHeight;
        const { minWidth, minHeight, targetWidth, targetHeight } = calculateWindowSize({
          columns,
          sidebarOpen,
          adaptiveWindowEnabled,
          currentHeight: currentLogicalHeight,
          workAreaWidth,
          workAreaHeight,
        });

        await appWindow.setMinSize(new LogicalSize(minWidth, minHeight));
        await appWindow.setSize(new LogicalSize(targetWidth, targetHeight));
      } catch (error) {
        console.error('Failed to update window size for dashboard columns', error);
      }
    };

    const requestResize = async () => {
      if (disposed) return;
      if (resizing) {
        resizeQueued = true;
        return;
      }
      resizing = true;
      do {
        resizeQueued = false;
        await resizeWindow();
      } while (resizeQueued && !disposed);
      resizing = false;
    };

    const setupWindowListeners = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const appWindow = getCurrentWindow();

        if (adaptiveWindowEnabled) {
          unlistenScaleChanged = await appWindow.onScaleChanged(() => {
            void requestResize();
          });

          unlistenMoved = await appWindow.onMoved(() => {
            if (moveResizeTimer) clearTimeout(moveResizeTimer);
            moveResizeTimer = setTimeout(() => {
              void requestResize();
            }, 200);
          });
        }
      } catch (error) {
        console.error('Failed to bind window resize listeners', error);
      }
    };

    void requestResize();
    void setupWindowListeners();

    return () => {
      disposed = true;
      if (moveResizeTimer) clearTimeout(moveResizeTimer);
      unlistenScaleChanged?.();
      unlistenMoved?.();
    };
  }, [dashboardColumns, sidebarOpen, adaptiveWindowEnabled]);

  useEffect(() => {
    const unsub = useStore.subscribe((state) => {
      if (!state.isInitialized) return;

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        storageService.save({
          schema_version: STORAGE_SCHEMA_VERSION,
          theme: state.theme,
          language: state.language,
          dashboard_columns: state.dashboardColumns,
          adaptive_window_enabled: state.adaptiveWindowEnabled,
          refresh_concurrency_limit: state.refreshConcurrencyLimit,
          execution_history_limit: state.executionHistoryLimit,
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
          {currentView === 'diagnostics' && (
            <div className="h-full overflow-y-auto">
              <Diagnostics />
            </div>
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
