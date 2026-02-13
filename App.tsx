import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { RecycleBin } from './components/RecycleBin';
import { Settings } from './components/Settings';
import { CreationWizard } from './components/CreationWizard';
import { storageService } from './services/storage';

const App: React.FC = () => {
  const {
    currentView,
    sidebarOpen,
    theme,
    initializeStore,
    isInitialized,
    cards,
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
    const unsub = useStore.subscribe((state) => {
      if (!state.isInitialized) return;

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        storageService.save({
          schema_version: 1,
          theme: state.theme,
          cards: state.cards,
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
          flex-1 transition-all duration-300 relative
          ${sidebarOpen ? 'ml-64' : 'ml-16'}
        `}
      >
        <div className="h-screen overflow-hidden">
          {currentView === 'dashboard' && (
            <Dashboard onAddClick={openCreateWizard} onEditCard={openEditWizard} />
          )}
          {currentView === 'recycle_bin' && <RecycleBin />}
          {currentView === 'settings' && <Settings />}
        </div>
      </main>

      {isWizardOpen && <CreationWizard onClose={closeWizard} editingCard={editingCard} />}
    </div>
  );
};

export default App;
