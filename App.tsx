import React, { useState, useEffect, useRef } from 'react';
import { useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { RecycleBin } from './components/RecycleBin';
import { Settings } from './components/Settings';
import { CreationWizard } from './components/CreationWizard';
import { storageService } from './services/storage';

const App: React.FC = () => {
  const { currentView, sidebarOpen, theme, initializeStore, isInitialized } = useStore();
  const [isWizardOpen, setWizardOpen] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize Data
  useEffect(() => {
    initializeStore();
  }, []);

  // Apply theme
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  // Auto-save subscription
  useEffect(() => {
    // Subscribe to store changes
    const unsub = useStore.subscribe((state) => {
        if (!state.isInitialized) return;

        // Debounce save
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        
        saveTimeoutRef.current = setTimeout(() => {
            storageService.save({
                theme: state.theme,
                cards: state.cards,
                activeGroup: state.activeGroup
            });
        }, 1000);
    });

    return () => {
        unsub();
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  if (!isInitialized) {
      return (
          <div className="min-h-screen bg-background flex items-center justify-center">
              <div className="animate-pulse flex flex-col items-center">
                  <div className="h-12 w-12 bg-primary/20 rounded-full mb-4"></div>
                  <div className="h-4 w-32 bg-muted rounded"></div>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased flex">
      <Sidebar />
      
      {/* Main Content Area */}
      <main 
        className={`
          flex-1 transition-all duration-300 relative
          ${sidebarOpen ? 'ml-64' : 'ml-16'}
        `}
      >
        <div className="h-screen overflow-hidden">
          {currentView === 'dashboard' && <Dashboard onAddClick={() => setWizardOpen(true)} />}
          {currentView === 'recycle_bin' && <RecycleBin />}
          {currentView === 'settings' && <Settings />}
        </div>
      </main>

      {/* Modals */}
      {isWizardOpen && <CreationWizard onClose={() => setWizardOpen(false)} />}
    </div>
  );
};

export default App;