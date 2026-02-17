import React, { useEffect, useState } from 'react';
import { buildSettingsPayload, useStore } from '../store';
import {
  Bell,
  Database,
  Download,
  Folder,
  HardDriveDownload,
  Info,
  LayoutGrid,
  Moon,
  RefreshCw,
  Upload,
  Sun,
  TerminalSquare,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Button } from './ui/Button';
import { open, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { t } from '../i18n';
import { MAX_DASHBOARD_COLUMNS, MIN_DASHBOARD_COLUMNS } from '../grid';
import { MAX_REFRESH_CONCURRENCY, MIN_REFRESH_CONCURRENCY } from '../refresh';
import { notificationService, NotificationPermissionStatus } from '../services/notification';
import {
  BACKUP_INTERVAL_VALUES,
  MAX_BACKUP_RETENTION,
  MIN_BACKUP_RETENTION,
  storageService,
} from '../services/storage';
import { BackupIntervalMinutes, BackupWeekday } from '../types';
import {
  clampExecutionHistoryLimit,
  MAX_EXECUTION_HISTORY_LIMIT,
  MIN_EXECUTION_HISTORY_LIMIT,
} from '../services/diagnostics';
import { interactionSoundService } from '../services/interaction-sound';

type SettingsSectionId = 'general' | 'storage' | 'runtime' | 'notifications';

interface SettingsSectionConfig {
  id: SettingsSectionId;
  icon: LucideIcon;
  labelKey: string;
  descriptionKey: string;
}

const SETTINGS_SECTIONS: SettingsSectionConfig[] = [
  {
    id: 'general',
    icon: LayoutGrid,
    labelKey: 'settings.section.general',
    descriptionKey: 'settings.section.generalDesc',
  },
  {
    id: 'storage',
    icon: Database,
    labelKey: 'settings.section.storage',
    descriptionKey: 'settings.section.storageDesc',
  },
  {
    id: 'runtime',
    icon: Wrench,
    labelKey: 'settings.section.runtime',
    descriptionKey: 'settings.section.runtimeDesc',
  },
  {
    id: 'notifications',
    icon: Bell,
    labelKey: 'settings.section.notifications',
    descriptionKey: 'settings.section.notificationsDesc',
  },
];

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
    backupDirectory,
    backupRetentionCount,
    backupAutoEnabled,
    backupSchedule,
    setBackupDirectory,
    setBackupRetentionCount,
    setBackupAutoEnabled,
    setBackupScheduleMode,
    setBackupIntervalMinutes,
    setBackupDailyTime,
    setBackupWeeklySchedule,
    interactionSoundEnabled,
    interactionSoundVolume,
    setInteractionSoundEnabled,
    setInteractionSoundVolume,
    applyImportedSettings,
    defaultPythonPath,
    setDefaultPythonPath,
    refreshConcurrencyLimit,
    setRefreshConcurrencyLimit,
    executionHistoryLimit,
    setExecutionHistoryLimit,
  } = useStore();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('general');
  const [pythonPathInput, setPythonPathInput] = useState(defaultPythonPath ?? '');
  const [executionHistoryLimitInput, setExecutionHistoryLimitInput] = useState(
    String(executionHistoryLimit),
  );
  const [backupPathDisplay, setBackupPathDisplay] = useState('');
  const [storageHint, setStorageHint] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
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

  useEffect(() => {
    let active = true;
    const refreshBackupPath = async () => {
      const resolved = await storageService.getCurrentBackupPath({ directory: backupDirectory });
      if (active) {
        setBackupPathDisplay(resolved);
      }
    };

    void refreshBackupPath();

    return () => {
      active = false;
    };
  }, [backupDirectory, dataPath]);

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

      const selectedPath = Array.isArray(selected) ? selected[0] : selected;
      if (selectedPath) {
        await updateDataPath(selectedPath);
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

  const retentionOptions = Array.from(
    { length: MAX_BACKUP_RETENTION - MIN_BACKUP_RETENTION + 1 },
    (_, index) => MIN_BACKUP_RETENTION + index,
  );

  const hourOptions = Array.from({ length: 24 }, (_, hour) => hour);
  const minuteOptions = Array.from({ length: 60 }, (_, minute) => minute);
  const weekdayOptions: Array<{ value: BackupWeekday; label: string }> = [
    { value: 0, label: tr('settings.weekday.sunday') },
    { value: 1, label: tr('settings.weekday.monday') },
    { value: 2, label: tr('settings.weekday.tuesday') },
    { value: 3, label: tr('settings.weekday.wednesday') },
    { value: 4, label: tr('settings.weekday.thursday') },
    { value: 5, label: tr('settings.weekday.friday') },
    { value: 6, label: tr('settings.weekday.saturday') },
  ];

  const handleChooseBackupFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: tr('settings.selectBackupFolder'),
      });

      const selectedPath = Array.isArray(selected) ? selected[0] : selected;
      if (selectedPath) {
        setBackupDirectory(selectedPath);
      }
    } catch (error) {
      console.error('Failed to open backup folder dialog', error);
    }
  };

  const handleResetBackupFolder = () => {
    setBackupDirectory(undefined);
  };

  const createExportFileName = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    return `dashboard-config-${year}${month}${day}-${hour}${minute}${second}.json`;
  };

  const handleExportConfig = async () => {
    setIsExporting(true);
    setStorageHint('');
    try {
      const targetPath = await saveDialog({
        title: tr('settings.exportDialogTitle'),
        defaultPath: createExportFileName(),
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!targetPath) return;

      await storageService.exportToFile(targetPath, buildSettingsPayload(useStore.getState()));
      setStorageHint(tr('settings.exportSuccess', { path: targetPath }));
    } catch (error) {
      const message = error instanceof Error ? error.message : tr('settings.importErrorUnknown');
      setStorageHint(message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportConfig = async () => {
    setIsImporting(true);
    setStorageHint('');
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        title: tr('settings.importDialogTitle'),
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      const selectedPath = Array.isArray(selected) ? selected[0] : selected;
      if (!selectedPath) return;

      const result = await storageService.importFromFile(selectedPath);
      await applyImportedSettings(result.settings);

      if (result.migratedFromSchemaVersion !== undefined) {
        setStorageHint(
          tr('settings.importSuccessMigrated', { schema: result.migratedFromSchemaVersion }),
        );
      } else {
        setStorageHint(tr('settings.importSuccess'));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : tr('settings.importErrorUnknown');
      setStorageHint(message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleCreateBackupNow = async () => {
    setIsBackingUp(true);
    setStorageHint('');
    try {
      const outputPath = await storageService.createBackup(buildSettingsPayload(useStore.getState()), {
        directory: backupDirectory,
        retentionCount: backupRetentionCount,
      });
      setStorageHint(tr('settings.backupNowSuccess', { path: outputPath }));
    } catch (error) {
      const message = error instanceof Error ? error.message : tr('settings.importErrorUnknown');
      setStorageHint(message);
    } finally {
      setIsBackingUp(false);
    }
  };

  const activeSectionMeta =
    SETTINGS_SECTIONS.find((section) => section.id === activeSection) ?? SETTINGS_SECTIONS[0];
  const ActiveSectionIcon = activeSectionMeta.icon;
  const getIntervalPresetLabel = (minutes: BackupIntervalMinutes) => {
    if (minutes === 5) return tr('settings.intervalPreset.5m');
    if (minutes === 30) return tr('settings.intervalPreset.30m');
    if (minutes === 60) return tr('settings.intervalPreset.1h');
    if (minutes === 180) return tr('settings.intervalPreset.3h');
    return tr('settings.intervalPreset.12h');
  };

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto animate-in fade-in duration-300">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">{tr('settings.title')}</h1>
        <p className="text-muted-foreground">{tr('settings.description')}</p>
      </div>

      <div className="lg:hidden mb-4 overflow-x-auto pb-1">
        <div className="flex gap-2 min-w-max">
          {SETTINGS_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = section.id === activeSection;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                data-sound="nav.switch"
                aria-current={isActive ? 'page' : undefined}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'border-primary/35 bg-primary/10 text-foreground'
                    : 'border-border/80 bg-card text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                }`}
              >
                <Icon size={15} className={isActive ? 'text-primary' : ''} />
                <span className="whitespace-nowrap">{tr(section.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden lg:block lg:sticky lg:top-6">
          <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {tr('settings.category')}
            </p>
            <nav className="space-y-1" aria-label={tr('settings.category')}>
              {SETTINGS_SECTIONS.map((section) => {
                const Icon = section.icon;
                const isActive = section.id === activeSection;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    data-sound="nav.switch"
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full rounded-lg border px-3 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                      isActive
                        ? 'border-primary/35 bg-primary/10 text-foreground shadow-sm'
                        : 'border-transparent text-muted-foreground hover:border-border/80 hover:bg-secondary/60 hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Icon size={16} className={`mt-0.5 ${isActive ? 'text-primary' : ''}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{tr(section.labelKey)}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {tr(section.descriptionKey)}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        <section className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg border border-primary/25 bg-primary/10 flex items-center justify-center text-primary">
                <ActiveSectionIcon size={18} />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{tr(activeSectionMeta.labelKey)}</h2>
                <p className="text-sm text-muted-foreground mt-1">{tr(activeSectionMeta.descriptionKey)}</p>
              </div>
            </div>
          </div>

          {activeSection === 'general' && (
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-medium mb-4">{tr('settings.appearance')}</h3>
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium">{tr('settings.theme')}</p>
                  <p className="text-sm text-muted-foreground">{tr('settings.themeDesc')}</p>
                </div>
                <div className="flex items-center bg-secondary/50 p-1 rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    data-sound="toggle.change"
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
                    type="button"
                    onClick={() => setTheme('dark')}
                    data-sound="toggle.change"
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

              <div className="mt-6 border-t border-border/60 pt-5 space-y-4">
                <div className="space-y-1">
                  <p className="font-medium">{tr('settings.interactionSound')}</p>
                  <p className="text-sm text-muted-foreground">{tr('settings.interactionSoundDesc')}</p>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-medium">{tr('settings.interactionSoundEnabled')}</p>
                    <p className="text-xs text-muted-foreground">{tr('settings.interactionSoundEnabledDesc')}</p>
                  </div>
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      data-sound="none"
                      checked={interactionSoundEnabled}
                      onChange={(event) => {
                        const nextEnabled = event.target.checked;
                        if (nextEnabled) {
                          interactionSoundService.setEnabled(true);
                        }
                        interactionSoundService.play('toggle.change');
                        setInteractionSoundEnabled(nextEnabled);
                      }}
                      className="sr-only peer"
                    />
                    <div className="relative w-11 h-6 rounded-full border border-border/70 bg-secondary/80 shadow-inner transition-colors peer-checked:bg-emerald-500 peer-checked:border-emerald-500/80">
                      <span className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-transform peer-checked:translate-x-5" />
                    </div>
                  </label>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{tr('settings.interactionSoundVolume')}</p>
                    <span className="text-sm text-muted-foreground">{interactionSoundVolume}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{tr('settings.interactionSoundVolumeDesc')}</p>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={interactionSoundVolume}
                    onChange={(event) => setInteractionSoundVolume(Number.parseInt(event.target.value, 10))}
                    className="w-full accent-primary"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    data-sound="none"
                    onClick={() => interactionSoundService.play('ui.tap')}
                  >
                    {tr('settings.interactionSoundTestTap')}
                  </Button>
                  <Button
                    variant="outline"
                    data-sound="none"
                    onClick={() => interactionSoundService.play('action.success')}
                  >
                    {tr('settings.interactionSoundTestSuccess')}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'storage' && (
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-medium mb-4">{tr('settings.storage')}</h3>
              <div className="space-y-6">
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
                <div className="text-xs text-amber-500/80">{tr('settings.pathChangeNote')}</div>

                <div className="border-t border-border/60 pt-5 space-y-4">
                  <div className="space-y-1">
                    <p className="font-medium">{tr('settings.importExportConfig')}</p>
                    <p className="text-sm text-muted-foreground">{tr('settings.importExportConfigDesc')}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleImportConfig} disabled={isImporting}>
                      <Upload size={14} className="mr-2" />
                      {isImporting ? tr('settings.importing') : tr('settings.importConfig')}
                    </Button>
                    <Button variant="outline" onClick={handleExportConfig} disabled={isExporting}>
                      <Download size={14} className="mr-2" />
                      {isExporting ? tr('settings.exporting') : tr('settings.exportConfig')}
                    </Button>
                  </div>
                </div>

                <div className="border-t border-border/60 pt-5 space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-medium">{tr('settings.backup')}</p>
                        <p className="text-sm text-muted-foreground">{tr('settings.backupDesc')}</p>
                      </div>
                      <Button variant="outline" onClick={handleCreateBackupNow} disabled={isBackingUp}>
                        <HardDriveDownload size={14} className="mr-2" />
                        {isBackingUp ? tr('settings.backingUp') : tr('settings.backupNow')}
                      </Button>
                    </div>

                    <p className="font-medium">{tr('settings.backupFolder')}</p>
                    <p className="text-sm text-muted-foreground">{tr('settings.backupFolderDesc')}</p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={handleChooseBackupFolder}>
                        <Folder size={14} className="mr-2" /> {tr('settings.changeBackupFolder')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleResetBackupFolder}
                        title={tr('settings.useDefaultBackupFolder')}
                      >
                        <RefreshCw size={14} />
                      </Button>
                    </div>
                    <div className="bg-secondary/20 p-3 rounded-md border border-border/50 font-mono text-xs text-muted-foreground break-all">
                      {backupPathDisplay || tr('common.loading')}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <p className="font-medium">{tr('settings.backupRetentionCount')}</p>
                      <p className="text-sm text-muted-foreground">
                        {tr('settings.backupRetentionDesc', {
                          min: MIN_BACKUP_RETENTION,
                          max: MAX_BACKUP_RETENTION,
                        })}
                      </p>
                      <select
                        value={backupRetentionCount}
                        onChange={(event) => setBackupRetentionCount(Number.parseInt(event.target.value, 10))}
                        className="w-36 bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {retentionOptions.map((count) => (
                          <option key={count} value={count}>
                            {count}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium">{tr('settings.autoBackup')}</p>
                          <p className="text-sm text-muted-foreground">{tr('settings.autoBackupDesc')}</p>
                        </div>
                        <label className="inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={backupAutoEnabled}
                            onChange={(event) => setBackupAutoEnabled(event.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="relative w-11 h-6 rounded-full border border-border/70 bg-secondary/80 shadow-inner transition-colors peer-checked:bg-emerald-500 peer-checked:border-emerald-500/80">
                            <span className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-transform peer-checked:translate-x-5" />
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {backupAutoEnabled && (
                    <>
                      <div className="space-y-2">
                        <p className="font-medium">{tr('settings.autoBackupSchedule')}</p>
                        <p className="text-sm text-muted-foreground">{tr('settings.autoBackupScheduleDesc')}</p>
                        <select
                          value={backupSchedule.mode}
                          onChange={(event) =>
                            setBackupScheduleMode(event.target.value as 'interval' | 'daily' | 'weekly')
                          }
                          className="w-40 bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="interval">{tr('settings.backupModeInterval')}</option>
                          <option value="daily">{tr('settings.backupModeDaily')}</option>
                          <option value="weekly">{tr('settings.backupModeWeekly')}</option>
                        </select>
                      </div>

                      {backupSchedule.mode === 'interval' && (
                        <div className="space-y-2">
                          <p className="font-medium">{tr('settings.intervalOption')}</p>
                          <div className="flex flex-wrap gap-2">
                            {BACKUP_INTERVAL_VALUES.map((minutes) => (
                              <button
                                key={minutes}
                                type="button"
                                onClick={() => setBackupIntervalMinutes(minutes as BackupIntervalMinutes)}
                                className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                                  backupSchedule.every_minutes === minutes
                                    ? 'border-primary/35 bg-primary/10 text-foreground'
                                    : 'border-border/80 bg-secondary/30 text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                {getIntervalPresetLabel(minutes as BackupIntervalMinutes)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {backupSchedule.mode === 'daily' && (
                        <div className="space-y-2">
                          <p className="font-medium">{tr('settings.dailyTime')}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={backupSchedule.hour}
                              onChange={(event) =>
                                setBackupDailyTime(
                                  Number.parseInt(event.target.value, 10),
                                  backupSchedule.minute,
                                )
                              }
                              className="w-24 bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              {hourOptions.map((hour) => (
                                <option key={hour} value={hour}>
                                  {hour.toString().padStart(2, '0')}
                                </option>
                              ))}
                            </select>
                            <span className="text-sm text-muted-foreground">:</span>
                            <select
                              value={backupSchedule.minute}
                              onChange={(event) =>
                                setBackupDailyTime(
                                  backupSchedule.hour,
                                  Number.parseInt(event.target.value, 10),
                                )
                              }
                              className="w-24 bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              {minuteOptions.map((minute) => (
                                <option key={minute} value={minute}>
                                  {minute.toString().padStart(2, '0')}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}

                      {backupSchedule.mode === 'weekly' && (
                        <div className="space-y-2">
                          <p className="font-medium">{tr('settings.weeklyTime')}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={backupSchedule.weekday}
                              onChange={(event) =>
                                setBackupWeeklySchedule(
                                  Number.parseInt(event.target.value, 10) as BackupWeekday,
                                  backupSchedule.hour,
                                  backupSchedule.minute,
                                )
                              }
                              className="w-36 bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              {weekdayOptions.map((day) => (
                                <option key={day.value} value={day.value}>
                                  {day.label}
                                </option>
                              ))}
                            </select>
                            <select
                              value={backupSchedule.hour}
                              onChange={(event) =>
                                setBackupWeeklySchedule(
                                  backupSchedule.weekday,
                                  Number.parseInt(event.target.value, 10),
                                  backupSchedule.minute,
                                )
                              }
                              className="w-24 bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              {hourOptions.map((hour) => (
                                <option key={hour} value={hour}>
                                  {hour.toString().padStart(2, '0')}
                                </option>
                              ))}
                            </select>
                            <span className="text-sm text-muted-foreground">:</span>
                            <select
                              value={backupSchedule.minute}
                              onChange={(event) =>
                                setBackupWeeklySchedule(
                                  backupSchedule.weekday,
                                  backupSchedule.hour,
                                  Number.parseInt(event.target.value, 10),
                                )
                              }
                              className="w-24 bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              {minuteOptions.map((minute) => (
                                <option key={minute} value={minute}>
                                  {minute.toString().padStart(2, '0')}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {storageHint && <p className="text-xs text-muted-foreground break-all">{storageHint}</p>}
                </div>
              </div>
            </div>
          )}

          {activeSection === 'runtime' && (
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-medium mb-4">{tr('settings.pythonRuntime')}</h3>
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
                  <p>{tr('settings.scriptOutputFormat')}</p>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'notifications' && (
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-medium mb-4">{tr('settings.notifications')}</h3>
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

                {notificationHint && <p className="text-xs text-muted-foreground">{notificationHint}</p>}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
