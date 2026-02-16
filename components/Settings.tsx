import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Moon, Sun, Folder, RefreshCw, Info, TerminalSquare } from 'lucide-react';
import { Button } from './ui/Button';
import { open } from '@tauri-apps/plugin-dialog';
import { t } from '../i18n';
import { MAX_DASHBOARD_COLUMNS, MIN_DASHBOARD_COLUMNS } from '../grid';
import { MAX_REFRESH_CONCURRENCY, MIN_REFRESH_CONCURRENCY } from '../refresh';
import { notificationService, NotificationPermissionStatus } from '../services/notification';
import {
  clampExecutionHistoryLimit,
  MAX_EXECUTION_HISTORY_LIMIT,
  MIN_EXECUTION_HISTORY_LIMIT,
} from '../services/diagnostics';

export const Settings = () => {
  const {
    theme,
    setTheme,
    language,
    setLanguage,
    dashboardColumns,
    setDashboardColumns,
    adaptiveWindowEnabled,
    setAdaptiveWindowEnabled,
    dataPath,
    updateDataPath,
    defaultPythonPath,
    setDefaultPythonPath,
    refreshConcurrencyLimit,
    setRefreshConcurrencyLimit,
    executionHistoryLimit,
    setExecutionHistoryLimit,
  } = useStore();
  const [pythonPathInput, setPythonPathInput] = useState(defaultPythonPath ?? '');
  const [executionHistoryLimitInput, setExecutionHistoryLimitInput] = useState(
    String(executionHistoryLimit),
  );
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionStatus>('unsupported');
  const [isUpdatingNotificationPermission, setIsUpdatingNotificationPermission] = useState(false);
  const [isSendingTestNotification, setIsSendingTestNotification] = useState(false);
  const [notificationHint, setNotificationHint] = useState('');
  const tr = (key: string, params?: Record<string, string | number>) => t(language, key, params);

  useEffect(() => {
    setPythonPathInput(defaultPythonPath ?? '');
  }, [defaultPythonPath]);

  useEffect(() => {
    setExecutionHistoryLimitInput(String(executionHistoryLimit));
  }, [executionHistoryLimit]);

  const refreshNotificationPermission = async () => {
    const status = await notificationService.getPermissionStatus();
    setNotificationPermission(status);
  };

  useEffect(() => {
    void refreshNotificationPermission();
  }, []);

  const handleRequestNotificationPermission = async () => {
    setIsUpdatingNotificationPermission(true);
    setNotificationHint('');
    try {
      const status = await notificationService.requestPermission();
      setNotificationPermission(status);
      if (status === 'granted') {
        setNotificationHint(tr('settings.notificationPermissionGrantedHint'));
      } else if (status === 'denied') {
        setNotificationHint(tr('settings.notificationPermissionDeniedHint'));
      }
    } finally {
      setIsUpdatingNotificationPermission(false);
    }
  };

  const handleSendTestNotification = async () => {
    setIsSendingTestNotification(true);
    setNotificationHint('');
    try {
      const ok = await notificationService.sendDesktopNotification(
        tr('settings.testNotificationTitle'),
        tr('settings.testNotificationBody'),
      );
      await refreshNotificationPermission();
      setNotificationHint(ok ? tr('settings.testNotificationSent') : tr('settings.testNotificationFailed'));
    } finally {
      setIsSendingTestNotification(false);
    }
  };

  const getPermissionLabel = (status: NotificationPermissionStatus) => {
    if (status === 'granted') return tr('settings.notificationPermissionGranted');
    if (status === 'denied') return tr('settings.notificationPermissionDenied');
    if (status === 'default') return tr('settings.notificationPermissionDefault');
    return tr('settings.notificationPermissionUnsupported');
  };

  const handleChooseFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: tr('settings.selectDataFolder'),
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

  const saveExecutionHistoryLimit = () => {
    const parsed = Number.parseInt(executionHistoryLimitInput.trim(), 10);
    const normalized = clampExecutionHistoryLimit(parsed, executionHistoryLimit);
    setExecutionHistoryLimit(normalized);
    setExecutionHistoryLimitInput(String(normalized));
  };

  return (
    <div className="p-8 max-w-5xl mx-auto animate-in fade-in duration-300">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">{tr('settings.title')}</h1>
        <p className="text-muted-foreground">{tr('settings.description')}</p>
      </div>

      <div className="space-y-6">
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-medium mb-4">{tr('settings.appearance')}</h2>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="font-medium">{tr('settings.theme')}</p>
              <p className="text-sm text-muted-foreground">{tr('settings.themeDesc')}</p>
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
                <span>{tr('settings.light')}</span>
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
                <span>{tr('settings.dark')}</span>
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="font-medium">{tr('settings.language')}</p>
              <p className="text-sm text-muted-foreground">{tr('settings.languageDesc')}</p>
            </div>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as 'en-US' | 'zh-CN')}
              className="bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="en-US">{tr('settings.languageEnglish')}</option>
              <option value="zh-CN">{tr('settings.languageChinese')}</option>
            </select>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="font-medium">{tr('settings.dashboardColumns')}</p>
              <p className="text-sm text-muted-foreground">{tr('settings.dashboardColumnsDesc')}</p>
            </div>
            <select
              value={dashboardColumns}
              onChange={(event) => setDashboardColumns(Number.parseInt(event.target.value, 10))}
              className="bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {Array.from(
                { length: MAX_DASHBOARD_COLUMNS - MIN_DASHBOARD_COLUMNS + 1 },
                (_, index) => MIN_DASHBOARD_COLUMNS + index,
              ).map((columns) => (
                <option key={columns} value={columns}>
                  {columns}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="font-medium">{tr('settings.adaptiveWindow')}</p>
              <p className="text-xs text-muted-foreground">{tr('settings.adaptiveWindowDesc')}</p>
            </div>
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={adaptiveWindowEnabled}
                onChange={(event) => setAdaptiveWindowEnabled(event.target.checked)}
                className="sr-only peer"
              />
              <div className="relative w-11 h-6 rounded-full border border-border/70 bg-secondary/80 shadow-inner transition-colors peer-checked:bg-emerald-500 peer-checked:border-emerald-500/80">
                <span className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-transform peer-checked:translate-x-5" />
              </div>
            </label>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-medium mb-4">{tr('settings.storage')}</h2>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <div>
                <p className="font-medium">{tr('settings.dataLocation')}</p>
                <p className="text-sm text-muted-foreground">{tr('settings.dataLocationDesc')}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleChooseFolder}>
                  <Folder size={14} className="mr-2" /> {tr('settings.changeFolder')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetDefault}
                  title={tr('settings.resetToDefault')}
                >
                  <RefreshCw size={14} />
                </Button>
              </div>
            </div>
            <div className="bg-secondary/20 p-3 rounded-md border border-border/50 font-mono text-xs text-muted-foreground break-all">
              {dataPath || tr('common.loading')}
            </div>
            <div className="text-xs text-amber-500/80">
              {tr('settings.pathChangeNote')}
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-medium mb-4">{tr('settings.pythonRuntime')}</h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="font-medium">{tr('settings.defaultInterpreterPath')}</p>
              <p className="text-sm text-muted-foreground">{tr('settings.defaultInterpreterDesc')}</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pythonPathInput}
                  onChange={(event) => setPythonPathInput(event.target.value)}
                  placeholder="e.g. /usr/bin/python3"
                  className="flex-1 bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <Button onClick={savePythonPath}>{tr('common.save')}</Button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-medium">{tr('settings.maxConcurrentRuns')}</p>
              <p className="text-sm text-muted-foreground">
                {tr('settings.maxConcurrentRunsDesc', {
                  min: MIN_REFRESH_CONCURRENCY,
                  max: MAX_REFRESH_CONCURRENCY,
                })}
              </p>
              <select
                value={refreshConcurrencyLimit}
                onChange={(event) => setRefreshConcurrencyLimit(Number.parseInt(event.target.value, 10))}
                className="w-28 bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {Array.from(
                  { length: MAX_REFRESH_CONCURRENCY - MIN_REFRESH_CONCURRENCY + 1 },
                  (_, index) => MIN_REFRESH_CONCURRENCY + index,
                ).map((limit) => (
                  <option key={limit} value={limit}>
                    {limit}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <p className="font-medium">{tr('settings.historyLimit')}</p>
              <p className="text-sm text-muted-foreground">
                {tr('settings.historyLimitDesc', {
                  min: MIN_EXECUTION_HISTORY_LIMIT,
                  max: MAX_EXECUTION_HISTORY_LIMIT,
                })}
              </p>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min={MIN_EXECUTION_HISTORY_LIMIT}
                  max={MAX_EXECUTION_HISTORY_LIMIT}
                  step={1}
                  value={executionHistoryLimitInput}
                  onChange={(event) => setExecutionHistoryLimitInput(event.target.value)}
                  onBlur={saveExecutionHistoryLimit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      saveExecutionHistoryLimit();
                    }
                  }}
                  className="w-32 bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-xs text-muted-foreground">{tr('settings.historyLimitHint')}</span>
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 text-xs text-muted-foreground space-y-2">
              <div className="flex items-center gap-2 text-foreground">
                <Info size={14} />
                <span className="font-medium">{tr('settings.executionPriority')}</span>
              </div>
              <p>{tr('settings.priorityCard')}</p>
              <p>{tr('settings.priorityDefault')}</p>
              <p>{tr('settings.prioritySystem')}</p>
            </div>

            <div className="rounded-lg border border-dashed border-border/70 p-3 text-xs text-muted-foreground flex items-start gap-2">
              <TerminalSquare size={14} className="mt-0.5" />
              <p>
                {tr('settings.scriptOutputFormat')}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-medium mb-4">{tr('settings.notifications')}</h2>
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="font-medium">{tr('settings.notificationPermission')}</p>
              <p className="text-sm text-muted-foreground">{tr('settings.notificationPermissionDesc')}</p>
            </div>

            <div className="inline-flex items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{tr('settings.notificationPermissionCurrent')}</span>
              <span className="font-medium">{getPermissionLabel(notificationPermission)}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleRequestNotificationPermission}
                disabled={isUpdatingNotificationPermission}
              >
                {isUpdatingNotificationPermission
                  ? tr('settings.requestingNotificationPermission')
                  : tr('settings.requestNotificationPermission')}
              </Button>
              <Button
                variant="outline"
                onClick={handleSendTestNotification}
                disabled={notificationPermission !== 'granted' || isSendingTestNotification}
              >
                {isSendingTestNotification
                  ? tr('settings.sendingTestNotification')
                  : tr('settings.sendTestNotification')}
              </Button>
            </div>

            {notificationHint && (
              <p className="text-xs text-muted-foreground">{notificationHint}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
