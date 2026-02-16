import React from 'react';
import { useStore } from '../store';
import { LayoutDashboard, Trash2, Settings, ChevronLeft, ChevronRight, Activity, ActivitySquare } from 'lucide-react';
import { t } from '../i18n';
import { ViewMode } from '../types';

export const Sidebar = () => {
  const { currentView, setView, sidebarOpen, toggleSidebar, language } = useStore();
  const tr = (key: string) => t(language, key);

  const menuItems: Array<{ id: ViewMode; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
    { id: 'dashboard', label: tr('sidebar.dashboard'), icon: LayoutDashboard },
    { id: 'diagnostics', label: tr('sidebar.diagnostics'), icon: ActivitySquare },
    { id: 'recycle_bin', label: tr('sidebar.recycleBin'), icon: Trash2 },
    { id: 'settings', label: tr('sidebar.settings'), icon: Settings },
  ];

  return (
    <aside 
      className={`
        fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-card transition-all duration-300
        ${sidebarOpen ? 'w-64' : 'w-16'}
      `}
    >
      {/* Brand */}
      <div className="h-16 flex items-center justify-center border-b border-border">
        {sidebarOpen ? (
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
            <div className="p-1 bg-primary rounded text-background">
              <Activity size={20} />
            </div>
            <span>MyMetrics</span>
          </div>
        ) : (
          <div className="p-1 bg-primary rounded text-background">
             <Activity size={20} />
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`
                w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${isActive 
                  ? 'bg-secondary text-foreground' 
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                }
                ${!sidebarOpen && 'justify-center px-0'}
              `}
              title={!sidebarOpen ? item.label : undefined}
            >
              <Icon size={20} className={`${sidebarOpen && 'mr-3'}`} />
              {sidebarOpen && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className="p-4 border-t border-border flex justify-end">
        <button 
          onClick={toggleSidebar}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>
    </aside>
  );
};
