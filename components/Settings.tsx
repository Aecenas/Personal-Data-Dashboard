import React from 'react';
import { useStore } from '../store';
import { Moon, Sun, Folder, RefreshCw } from 'lucide-react';
import { Button } from './ui/Button';
import { open } from '@tauri-apps/plugin-dialog';

export const Settings = () => {
  const { theme, setTheme, dataPath, updateDataPath } = useStore();

  const handleChooseFolder = async () => {
    try {
        const selected = await open({
            directory: true,
            multiple: false,
            title: 'Select Data Folder'
        });

        if (selected) {
            // selected is string (path) or null
            await updateDataPath(selected as string);
        }
    } catch (e) {
        console.error("Failed to open dialog", e);
    }
  };

  const handleResetDefault = async () => {
     await updateDataPath(null);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto animate-in fade-in duration-300">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Settings</h1>
        <p className="text-muted-foreground">Manage application preferences.</p>
      </div>

      <div className="space-y-6">
        {/* Appearance Section */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-medium mb-4">Appearance</h2>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="font-medium">Theme</p>
              <p className="text-sm text-muted-foreground">Select your preferred color scheme.</p>
            </div>
            <div className="flex items-center bg-secondary/50 p-1 rounded-lg border border-border">
              <button
                onClick={() => setTheme('light')}
                className={`p-2 rounded-md flex items-center gap-2 text-sm transition-all ${
                  theme === 'light' 
                    ? 'bg-background text-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Sun size={16} />
                <span>Light</span>
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`p-2 rounded-md flex items-center gap-2 text-sm transition-all ${
                  theme === 'dark' 
                    ? 'bg-background text-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Moon size={16} />
                <span>Dark</span>
              </button>
            </div>
          </div>
        </div>
        
        {/* Storage Section */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
             <h2 className="text-lg font-medium mb-4">Storage</h2>
             <div className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                  <div>
                    <p className="font-medium">Data Location</p>
                    <p className="text-sm text-muted-foreground">Where your metrics configuration is stored.</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handleChooseFolder}>
                             <Folder size={14} className="mr-2" /> Change Folder
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleResetDefault} title="Reset to Default">
                            <RefreshCw size={14} />
                        </Button>
                      </div>
                  </div>
                </div>
                <div className="bg-secondary/20 p-3 rounded-md border border-border/50 font-mono text-xs text-muted-foreground break-all">
                    {dataPath}
                </div>
                <div className="text-xs text-amber-500/80">
                    Note: Changing this will move your existing <code>user_settings.json</code> to the new location.
                </div>
             </div>
        </div>

        {/* General Placeholder */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm opacity-50 pointer-events-none select-none grayscale">
             <h2 className="text-lg font-medium mb-4">General</h2>
             <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-border pb-4">
                  <div>
                    <p className="font-medium">Update Channel</p>
                    <p className="text-sm text-muted-foreground">Select update frequency</p>
                  </div>
                  <span className="text-sm text-muted-foreground">Stable</span>
                </div>
                 <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">App Version</p>
                    <p className="text-sm text-muted-foreground">Current installed version</p>
                  </div>
                  <span className="text-sm text-muted-foreground">v0.1.0-alpha</span>
                </div>
             </div>
        </div>
      </div>
    </div>
  );
};