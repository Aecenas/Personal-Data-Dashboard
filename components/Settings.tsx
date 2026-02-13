import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Moon, Sun, Folder, RefreshCw, Info, TerminalSquare } from 'lucide-react';
import { Button } from './ui/Button';
import { open } from '@tauri-apps/plugin-dialog';

export const Settings = () => {
  const {
    theme,
    setTheme,
    dataPath,
    updateDataPath,
    defaultPythonPath,
    setDefaultPythonPath,
  } = useStore();
  const [pythonPathInput, setPythonPathInput] = useState(defaultPythonPath ?? '');

  useEffect(() => {
    setPythonPathInput(defaultPythonPath ?? '');
  }, [defaultPythonPath]);

  const handleChooseFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Data Folder',
      });

      if (selected) {
        await updateDataPath(selected as string);
      }
    } catch (error) {
      console.error('Failed to open dialog', error);
    }
  };

  const handleResetDefault = async () => {
    await updateDataPath(null);
  };

  const savePythonPath = () => {
    setDefaultPythonPath(pythonPathInput.trim() || undefined);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto animate-in fade-in duration-300">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Settings</h1>
        <p className="text-muted-foreground">Manage application preferences.</p>
      </div>

      <div className="space-y-6">
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

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-medium mb-4">Storage</h2>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <div>
                <p className="font-medium">Data Location</p>
                <p className="text-sm text-muted-foreground">Where your metrics configuration is stored.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleChooseFolder}>
                  <Folder size={14} className="mr-2" /> Change Folder
                </Button>
                <Button variant="ghost" size="sm" onClick={handleResetDefault} title="Reset to Default">
                  <RefreshCw size={14} />
                </Button>
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

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-medium mb-4">Python Runtime</h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="font-medium">Default Interpreter Path (Optional)</p>
              <p className="text-sm text-muted-foreground">
                留空时按系统默认命令解析（macOS/Linux: <code>python3</code>，Windows: <code>python</code>/<code>py -3</code>）。
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pythonPathInput}
                  onChange={(event) => setPythonPathInput(event.target.value)}
                  placeholder="e.g. /usr/bin/python3"
                  className="flex-1 bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <Button onClick={savePythonPath}>Save</Button>
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 text-xs text-muted-foreground space-y-2">
              <div className="flex items-center gap-2 text-foreground">
                <Info size={14} />
                <span className="font-medium">Execution priority</span>
              </div>
              <p>1. Card-level interpreter path (if set)</p>
              <p>2. Default interpreter path in settings (if set)</p>
              <p>3. System default python command</p>
            </div>

            <div className="rounded-lg border border-dashed border-border/70 p-3 text-xs text-muted-foreground flex items-start gap-2">
              <TerminalSquare size={14} className="mt-0.5" />
              <p>
                脚本必须输出 JSON 到 STDOUT，格式：<code>{'{ "type": "scalar|series|status", "data": {...} }'}</code>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
