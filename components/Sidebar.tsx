import React from 'react';
import { useStore } from '../store';
import {
  LayoutDashboard,
  Trash2,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
  ActivitySquare,
  FolderTree,
} from 'lucide-react';
import { t } from '../i18n';
import { ViewMode } from '../types';

interface SidebarProps {
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onMobileOpenChange }) => {
  const { currentView, setView, sidebarOpen, toggleSidebar, language } = useStore();
  const tr = (key: string) => t(language, key);
  const expanded = sidebarOpen || mobileOpen;
  const brandIcon = (
    <img
      src="/app-icon.png"
      alt="MyMetrics Icon"
      className="h-8 w-8 rounded-md object-cover shadow-sm"
      draggable={false}
    />
  );

  const menuItems: Array<{ id: ViewMode; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
    { id: 'dashboard', label: tr('sidebar.dashboard'), icon: LayoutDashboard },
    { id: 'group_management', label: tr('sidebar.groupManagement'), icon: FolderTree },
    { id: 'diagnostics', label: tr('sidebar.diagnostics'), icon: ActivitySquare },
    { id: 'recycle_bin', label: tr('sidebar.recycleBin'), icon: Trash2 },
    { id: 'settings', label: tr('sidebar.settings'), icon: Settings },
  ];

  return (
    <>
      <div
        aria-hidden={!mobileOpen}
        onClick={() => onMobileOpenChange(false)}
        className={`fixed inset-0 z-30 bg-black/45 backdrop-blur-[1px] transition-opacity duration-300 lg:hidden ${
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        className={`
          fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-card shadow-xl
          transition-[width,transform] duration-300
          w-72 ${mobileOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'}
          lg:translate-x-0 lg:shadow-none ${sidebarOpen ? 'lg:w-64' : 'lg:w-16'}
          lg:pointer-events-auto
        `}
      >
        {/* Brand */}
        <div className="h-16 flex items-center border-b border-border px-3">
          <div className={`flex w-full items-center gap-2 font-bold text-xl tracking-tight ${sidebarOpen ? 'lg:justify-start' : 'lg:justify-center'}`}>
            {brandIcon}
            <span className={`inline ${sidebarOpen ? 'lg:inline' : 'lg:hidden'}`}>MyMetrics</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setView(item.id);
                  onMobileOpenChange(false);
                }}
                data-sound="nav.switch"
                className={`
                  w-full flex items-center justify-start px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${isActive
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                  }
                  ${!sidebarOpen ? 'lg:justify-center lg:px-0' : ''}
                `}
                title={!expanded ? item.label : undefined}
              >
                <Icon size={20} className={`mr-3 ${!sidebarOpen ? 'lg:mr-0' : ''}`} />
                <span className={`inline ${sidebarOpen ? 'lg:inline' : 'lg:hidden'}`}>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Collapse Toggle */}
        <div className="p-4 border-t border-border flex justify-end">
          <button
            onClick={() => onMobileOpenChange(false)}
            data-sound="toggle.change"
            aria-label={tr('sidebar.closeNavigation')}
            title={tr('sidebar.closeNavigation')}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors lg:hidden"
          >
            <X size={18} />
          </button>
          <button
            onClick={toggleSidebar}
            data-sound="toggle.change"
            aria-label={sidebarOpen ? tr('sidebar.collapseNavigation') : tr('sidebar.expandNavigation')}
            title={sidebarOpen ? tr('sidebar.collapseNavigation') : tr('sidebar.expandNavigation')}
            className="hidden p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors lg:inline-flex"
          >
            {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>
      </aside>
    </>
  );
};
