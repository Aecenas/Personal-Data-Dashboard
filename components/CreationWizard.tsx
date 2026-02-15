import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  FileCode,
  CheckCircle2,
  ChevronRight,
  BarChart3,
  Binary,
  LayoutGrid,
  Grid2X2,
  RectangleHorizontal,
  RectangleVertical,
  ShieldAlert,
  CircleDot,
  Gauge,
  Play,
  Loader2,
  FolderOpen,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from './ui/Button';
import { useStore } from '../store';
import { Card, CardType, MappingConfig, UIConfig } from '../types';
import { executionService, ExecutionResult } from '../services/execution';
import { t } from '../i18n';

interface CreationWizardProps {
  onClose: () => void;
  editingCard?: Card | null;
}

interface WizardForm {
  title: string;
  group: string;
  type: CardType;
  size: UIConfig['size'];
  colorTheme: UIConfig['color_theme'];
  scriptPath: string;
  scriptArgsText: string;
  pythonPath: string;
  intervalSec: number;
  timeoutMs: number;
  refreshOnStart: boolean;
  refreshOnResume: boolean;
  scalarValueKey: string;
  scalarUnitKey: string;
  scalarTrendKey: string;
  scalarColorKey: string;
  seriesXAxisKey: string;
  seriesKey: string;
  seriesNameKey: string;
  seriesValuesKey: string;
  statusLabelKey: string;
  statusStateKey: string;
  statusMessageKey: string;
  gaugeMinKey: string;
  gaugeMaxKey: string;
  gaugeValueKey: string;
  gaugeUnitKey: string;
}

const defaultForm: WizardForm = {
  title: '',
  group: 'Default',
  type: 'scalar',
  size: '1x1',
  colorTheme: 'default',
  scriptPath: '',
  scriptArgsText: '',
  pythonPath: '',
  intervalSec: 300,
  timeoutMs: 10000,
  refreshOnStart: true,
  refreshOnResume: true,
  scalarValueKey: 'value',
  scalarUnitKey: 'unit',
  scalarTrendKey: 'trend',
  scalarColorKey: 'color',
  seriesXAxisKey: 'x_axis',
  seriesKey: 'series',
  seriesNameKey: 'name',
  seriesValuesKey: 'values',
  statusLabelKey: 'label',
  statusStateKey: 'state',
  statusMessageKey: 'message',
  gaugeMinKey: 'min',
  gaugeMaxKey: 'max',
  gaugeValueKey: 'value',
  gaugeUnitKey: 'unit',
};

const parseArgs = (value: string) =>
  value
    .split(' ')
    .map((item) => item.trim())
    .filter(Boolean);

const buildMappingConfig = (form: WizardForm): MappingConfig => ({
  scalar: {
    value_key: form.scalarValueKey,
    unit_key: form.scalarUnitKey || undefined,
    trend_key: form.scalarTrendKey || undefined,
    color_key: form.scalarColorKey || undefined,
  },
  series: {
    x_axis_key: form.seriesXAxisKey,
    series_key: form.seriesKey,
    series_name_key: form.seriesNameKey,
    series_values_key: form.seriesValuesKey,
  },
  status: {
    label_key: form.statusLabelKey,
    state_key: form.statusStateKey,
    message_key: form.statusMessageKey || undefined,
  },
  gauge: {
    min_key: form.gaugeMinKey,
    max_key: form.gaugeMaxKey,
    value_key: form.gaugeValueKey,
    unit_key: form.gaugeUnitKey || undefined,
  },
});

const createFormFromCard = (card: Card): WizardForm => ({
  title: card.title,
  group: card.group,
  type: card.type,
  size: card.ui_config.size,
  colorTheme: card.ui_config.color_theme,
  scriptPath: card.script_config.path,
  scriptArgsText: card.script_config.args.join(' '),
  pythonPath: card.script_config.env_path ?? '',
  intervalSec: card.refresh_config.interval_sec,
  timeoutMs: card.refresh_config.timeout_ms,
  refreshOnStart: card.refresh_config.refresh_on_start,
  refreshOnResume: card.refresh_config.refresh_on_resume,
  scalarValueKey: card.mapping_config.scalar?.value_key ?? 'value',
  scalarUnitKey: card.mapping_config.scalar?.unit_key ?? 'unit',
  scalarTrendKey: card.mapping_config.scalar?.trend_key ?? 'trend',
  scalarColorKey: card.mapping_config.scalar?.color_key ?? 'color',
  seriesXAxisKey: card.mapping_config.series?.x_axis_key ?? 'x_axis',
  seriesKey: card.mapping_config.series?.series_key ?? 'series',
  seriesNameKey: card.mapping_config.series?.series_name_key ?? 'name',
  seriesValuesKey: card.mapping_config.series?.series_values_key ?? 'values',
  statusLabelKey: card.mapping_config.status?.label_key ?? 'label',
  statusStateKey: card.mapping_config.status?.state_key ?? 'state',
  statusMessageKey: card.mapping_config.status?.message_key ?? 'message',
  gaugeMinKey: card.mapping_config.gauge?.min_key ?? 'min',
  gaugeMaxKey: card.mapping_config.gauge?.max_key ?? 'max',
  gaugeValueKey: card.mapping_config.gauge?.value_key ?? 'value',
  gaugeUnitKey: card.mapping_config.gauge?.unit_key ?? 'unit',
});

export const CreationWizard: React.FC<CreationWizardProps> = ({ onClose, editingCard }) => {
  const { cards, addCard, updateCard, refreshCard, defaultPythonPath, language } = useStore();
  const tr = (key: string, params?: Record<string, string | number>) => t(language, key, params);

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<WizardForm>(defaultForm);
  const [testResult, setTestResult] = useState<ExecutionResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string>('');

  const isEditing = Boolean(editingCard);

  useEffect(() => {
    if (editingCard) {
      setForm(createFormFromCard(editingCard));
      setTestResult(null);
      setStep(1);
      return;
    }

    setForm(defaultForm);
    setTestResult(null);
    setStep(1);
  }, [editingCard?.id]);

  const groups = useMemo(() => {
    const groupSet = new Set(cards.filter((card) => !card.status.is_deleted).map((card) => card.group));
    return Array.from(groupSet).sort();
  }, [cards]);

  useEffect(() => {
    setTestResult(null);
  }, [
    form.type,
    form.scriptPath,
    form.scriptArgsText,
    form.pythonPath,
    form.timeoutMs,
    form.scalarValueKey,
    form.scalarUnitKey,
    form.scalarTrendKey,
    form.scalarColorKey,
    form.seriesXAxisKey,
    form.seriesKey,
    form.seriesNameKey,
    form.seriesValuesKey,
    form.statusLabelKey,
    form.statusStateKey,
    form.statusMessageKey,
    form.gaugeMinKey,
    form.gaugeMaxKey,
    form.gaugeValueKey,
    form.gaugeUnitKey,
  ]);

  const updateForm = <K extends keyof WizardForm>(key: K, value: WizardForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validateStep = (targetStep: number): boolean => {
    if (targetStep === 1) {
      if (!form.title.trim()) {
        setValidationMessage(tr('wizard.validation.titleRequired'));
        return false;
      }
      if (!form.group.trim()) {
        setValidationMessage(tr('wizard.validation.groupRequired'));
        return false;
      }
    }

    if (targetStep === 2) {
      if (!form.scriptPath.trim()) {
        setValidationMessage(tr('wizard.validation.scriptPathRequired'));
        return false;
      }
      if (!form.scriptPath.trim().endsWith('.py')) {
        setValidationMessage(tr('wizard.validation.scriptExt'));
        return false;
      }
      if (form.intervalSec < 0) {
        setValidationMessage(tr('wizard.validation.intervalMin'));
        return false;
      }
      if (form.timeoutMs < 1000) {
        setValidationMessage(tr('wizard.validation.timeoutMin'));
        return false;
      }
    }

    if (targetStep === 3) {
      if (form.type === 'scalar' && !form.scalarValueKey.trim()) {
        setValidationMessage(tr('wizard.validation.scalarValue'));
        return false;
      }
      if (form.type === 'series') {
        if (!form.seriesXAxisKey.trim() || !form.seriesKey.trim()) {
          setValidationMessage(tr('wizard.validation.seriesAxes'));
          return false;
        }
        if (!form.seriesNameKey.trim() || !form.seriesValuesKey.trim()) {
          setValidationMessage(tr('wizard.validation.seriesFields'));
          return false;
        }
      }
      if (form.type === 'status') {
        if (!form.statusLabelKey.trim() || !form.statusStateKey.trim()) {
          setValidationMessage(tr('wizard.validation.statusFields'));
          return false;
        }
      }
      if (form.type === 'gauge') {
        if (!form.gaugeMinKey.trim() || !form.gaugeMaxKey.trim() || !form.gaugeValueKey.trim()) {
          setValidationMessage(tr('wizard.validation.gaugeFields'));
          return false;
        }
      }
    }

    setValidationMessage('');
    return true;
  };

  const validateAllRequiredSteps = () => {
    const requiredSteps = [1, 2, 3];
    for (const requiredStep of requiredSteps) {
      const ok = validateStep(requiredStep);
      if (!ok) {
        setStep(requiredStep);
        return false;
      }
    }
    return true;
  };

  const browseScriptFile = async () => {
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        title: tr('wizard.selectPythonScript'),
        filters: [{ name: 'Python', extensions: ['py'] }],
      });

      if (selected) {
        updateForm('scriptPath', String(selected));
      }
    } catch (error) {
      console.error('Unable to open file dialog', error);
    }
  };

  const runTest = async () => {
    const valid = validateAllRequiredSteps();
    if (!valid) {
      return;
    }

    setIsTesting(true);
    const result = await executionService.runDraft({
      type: form.type,
      scriptPath: form.scriptPath.trim(),
      args: parseArgs(form.scriptArgsText),
      pythonPath: form.pythonPath.trim() || undefined,
      timeoutMs: Number(form.timeoutMs),
      mapping: buildMappingConfig(form),
      defaultPythonPath,
    });

    setTestResult(result);
    setIsTesting(false);
  };

  const handleSubmit = async () => {
    const valid = validateAllRequiredSteps();
    if (!valid) return;

    const mappingConfig = buildMappingConfig(form);
    const args = parseArgs(form.scriptArgsText);
    const runtimePayload = testResult?.ok ? testResult.payload : undefined;

    if (editingCard) {
      updateCard(editingCard.id, {
        title: form.title.trim(),
        group: form.group.trim(),
        type: form.type,
        script_config: {
          path: form.scriptPath.trim(),
          args,
          env_path: form.pythonPath.trim() || undefined,
        },
        mapping_config: mappingConfig,
        refresh_config: {
          interval_sec: Number(form.intervalSec),
          refresh_on_start: form.refreshOnStart,
          refresh_on_resume: form.refreshOnResume,
          timeout_ms: Number(form.timeoutMs),
        },
        ui_config: {
          ...editingCard.ui_config,
          size: form.size,
          color_theme: form.colorTheme,
        },
        cache_data: runtimePayload
          ? {
              ...editingCard.cache_data,
              last_success_payload: runtimePayload,
              last_success_at: Date.now(),
              raw_stdout_excerpt: testResult?.rawStdout?.slice(0, 500),
            }
          : editingCard.cache_data,
      });

      await refreshCard(editingCard.id);
      onClose();
      return;
    }

    const newCardId = crypto.randomUUID();
    const visibleCardCount = cards.filter((card) => !card.status.is_deleted).length;

    const newCard: Card = {
      id: newCardId,
      title: form.title.trim(),
      group: form.group.trim(),
      type: form.type,
      script_config: {
        path: form.scriptPath.trim(),
        args,
        env_path: form.pythonPath.trim() || undefined,
      },
      mapping_config: mappingConfig,
      refresh_config: {
        interval_sec: Number(form.intervalSec),
        refresh_on_start: form.refreshOnStart,
        refresh_on_resume: form.refreshOnResume,
        timeout_ms: Number(form.timeoutMs),
      },
      ui_config: {
        color_theme: form.colorTheme,
        size: form.size,
        x: 0,
        y: 0,
      },
      status: {
        is_deleted: false,
        deleted_at: null,
        sort_order: visibleCardCount + 1,
      },
      cache_data: runtimePayload
        ? {
            last_success_payload: runtimePayload,
            last_success_at: Date.now(),
            raw_stdout_excerpt: testResult?.rawStdout?.slice(0, 500),
            stderr_excerpt: testResult?.rawStderr?.slice(0, 500),
            last_exit_code: testResult?.exitCode,
            last_duration_ms: testResult?.durationMs,
          }
        : undefined,
      runtimeData: runtimePayload
        ? {
            state: 'success',
            isLoading: false,
            source: 'cache',
            payload: runtimePayload,
            lastUpdated: Date.now(),
          }
        : {
            state: 'idle',
            isLoading: false,
            source: 'none',
          },
    };

    addCard(newCard);
    await refreshCard(newCardId);
    onClose();
  };

  const goNext = () => {
    const ok = validateStep(step);
    if (!ok) return;

    if (step < 4) setStep((prev) => prev + 1);
  };

  const goBack = () => {
    setValidationMessage('');
    setStep((prev) => Math.max(1, prev - 1));
  };

  const renderStepOne = () => (
    <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="space-y-2">
        <label className="text-sm font-medium">{tr('wizard.cardTitle')}</label>
        <input
          type="text"
          className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder={tr('wizard.cardTitlePlaceholder')}
          value={form.title}
          onChange={(event) => updateForm('title', event.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">{tr('wizard.group')}</label>
          <input
            list="wizard-group-options"
            className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            value={form.group}
            onChange={(event) => updateForm('group', event.target.value)}
            placeholder={tr('wizard.groupPlaceholder')}
          />
          <datalist id="wizard-group-options">
            {groups.map((group) => (
              <option key={group} value={group} />
            ))}
          </datalist>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{tr('wizard.size')}</label>
          <div className="flex gap-2">
            <button
              onClick={() => updateForm('size', '1x1')}
              className={`p-2 rounded border ${
                form.size === '1x1' ? 'border-primary bg-secondary' : 'border-border'
              } hover:bg-secondary/50`}
              title="1x1"
            >
              <LayoutGrid size={18} />
            </button>
            <button
              onClick={() => updateForm('size', '2x1')}
              className={`p-2 rounded border ${
                form.size === '2x1' ? 'border-primary bg-secondary' : 'border-border'
              } hover:bg-secondary/50`}
              title="2x1"
            >
              <RectangleHorizontal size={18} />
            </button>
            <button
              onClick={() => updateForm('size', '1x2')}
              className={`p-2 rounded border ${
                form.size === '1x2' ? 'border-primary bg-secondary' : 'border-border'
              } hover:bg-secondary/50`}
              title="1x2"
            >
              <RectangleVertical size={18} />
            </button>
            <button
              onClick={() => updateForm('size', '2x2')}
              className={`p-2 rounded border ${
                form.size === '2x2' ? 'border-primary bg-secondary' : 'border-border'
              } hover:bg-secondary/50`}
              title="2x2"
            >
              <Grid2X2 size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{tr('wizard.visualizationType')}</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div
            className={`border rounded-lg p-4 cursor-pointer hover:bg-secondary/50 transition-colors ${
              form.type === 'scalar' ? 'border-primary bg-secondary/50' : 'border-border'
            }`}
            onClick={() => updateForm('type', 'scalar')}
          >
            <Binary className="mb-2 text-primary" />
            <div className="font-medium">{tr('wizard.typeScalar')}</div>
            <div className="text-xs text-muted-foreground">{tr('wizard.typeScalarDesc')}</div>
          </div>
          <div
            className={`border rounded-lg p-4 cursor-pointer hover:bg-secondary/50 transition-colors ${
              form.type === 'series' ? 'border-primary bg-secondary/50' : 'border-border'
            }`}
            onClick={() => updateForm('type', 'series')}
          >
            <BarChart3 className="mb-2 text-primary" />
            <div className="font-medium">{tr('wizard.typeSeries')}</div>
            <div className="text-xs text-muted-foreground">{tr('wizard.typeSeriesDesc')}</div>
          </div>
          <div
            className={`border rounded-lg p-4 cursor-pointer hover:bg-secondary/50 transition-colors ${
              form.type === 'status' ? 'border-primary bg-secondary/50' : 'border-border'
            }`}
            onClick={() => updateForm('type', 'status')}
          >
            <ShieldAlert className="mb-2 text-primary" />
            <div className="font-medium">{tr('wizard.typeStatus')}</div>
            <div className="text-xs text-muted-foreground">{tr('wizard.typeStatusDesc')}</div>
          </div>
          <div
            className={`border rounded-lg p-4 cursor-pointer hover:bg-secondary/50 transition-colors ${
              form.type === 'gauge' ? 'border-primary bg-secondary/50' : 'border-border'
            }`}
            onClick={() => updateForm('type', 'gauge')}
          >
            <Gauge className="mb-2 text-primary" />
            <div className="font-medium">{tr('wizard.typeGauge')}</div>
            <div className="text-xs text-muted-foreground">{tr('wizard.typeGaugeDesc')}</div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{tr('wizard.colorTheme')}</label>
        <select
          value={form.colorTheme}
          onChange={(event) => updateForm('colorTheme', event.target.value as UIConfig['color_theme'])}
          className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="default">{tr('wizard.colorDefault')}</option>
          <option value="blue">{tr('wizard.colorBlue')}</option>
          <option value="green">{tr('wizard.colorGreen')}</option>
          <option value="red">{tr('wizard.colorRed')}</option>
          <option value="yellow">{tr('wizard.colorYellow')}</option>
          <option value="purple">{tr('wizard.colorPurple')}</option>
        </select>
      </div>
    </div>
  );

  const renderStepTwo = () => (
    <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="space-y-2">
        <label className="text-sm font-medium">{tr('wizard.pythonScriptPath')}</label>
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={tr('wizard.pythonScriptPlaceholder')}
            value={form.scriptPath}
            onChange={(event) => updateForm('scriptPath', event.target.value)}
          />
          <Button variant="secondary" onClick={browseScriptFile}>
            <FolderOpen size={14} className="mr-2" /> {tr('wizard.browse')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">{tr('wizard.scriptArgs')}</label>
          <input
            type="text"
            className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={tr('wizard.scriptArgsPlaceholder')}
            value={form.scriptArgsText}
            onChange={(event) => updateForm('scriptArgsText', event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{tr('wizard.interpreterPathOptional')}</label>
          <input
            type="text"
            className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={tr('wizard.interpreterPathPlaceholder')}
            value={form.pythonPath}
            onChange={(event) => updateForm('pythonPath', event.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">{tr('wizard.refreshInterval')}</label>
          <input
            type="number"
            min={0}
            value={form.intervalSec}
            onChange={(event) => updateForm('intervalSec', Number(event.target.value))}
            className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{tr('wizard.timeout')}</label>
          <input
            type="number"
            min={1000}
            step={500}
            value={form.timeoutMs}
            onChange={(event) => updateForm('timeoutMs', Number(event.target.value))}
            className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="flex gap-6 text-sm">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.refreshOnStart}
            onChange={(event) => updateForm('refreshOnStart', event.target.checked)}
          />
          <span>{tr('wizard.refreshOnStart')}</span>
        </label>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.refreshOnResume}
            onChange={(event) => updateForm('refreshOnResume', event.target.checked)}
          />
          <span>{tr('wizard.refreshOnResume')}</span>
        </label>
      </div>

      <div className="p-4 bg-secondary/30 rounded-lg border border-border">
        <div className="flex items-center gap-2 text-sm font-medium mb-2">
          <FileCode size={16} /> {tr('wizard.expectedOutput')}
        </div>
        <pre className="text-xs font-mono text-muted-foreground overflow-x-auto p-2 bg-black/20 rounded">
{form.type === 'scalar'
  ? `{
  "type": "scalar",
  "data": { "value": 100, "unit": "ms" }
}`
  : form.type === 'series'
    ? `{
  "type": "series",
  "data": {
    "x_axis": ["10:00", "11:00"],
    "series": [{ "name": "val", "values": [1, 2] }]
  }
}`
    : form.type === 'status'
      ? `{
  "type": "status",
  "data": {
    "label": "service-A",
    "state": "ok",
    "message": "healthy"
  }
}`
      : `{
  "type": "gauge",
  "data": {
    "min": 0,
    "max": 100,
    "value": 80,
    "unit": "%"
  }
}`}
        </pre>
      </div>
    </div>
  );

  const renderStepThree = () => (
    <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
      {form.type === 'scalar' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{tr('wizard.valueKey')}</label>
            <input
              className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm"
              value={form.scalarValueKey}
              onChange={(event) => updateForm('scalarValueKey', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{tr('wizard.unitKey')}</label>
            <input
              className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm"
              value={form.scalarUnitKey}
              onChange={(event) => updateForm('scalarUnitKey', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{tr('wizard.trendKey')}</label>
            <input
              className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm"
              value={form.scalarTrendKey}
              onChange={(event) => updateForm('scalarTrendKey', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{tr('wizard.colorKey')}</label>
            <input
              className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm"
              value={form.scalarColorKey}
              onChange={(event) => updateForm('scalarColorKey', event.target.value)}
            />
          </div>
        </div>
      )}

      {form.type === 'series' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{tr('wizard.xAxisKey')}</label>
            <input
              className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm"
              value={form.seriesXAxisKey}
              onChange={(event) => updateForm('seriesXAxisKey', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{tr('wizard.seriesKey')}</label>
            <input
              className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm"
              value={form.seriesKey}
              onChange={(event) => updateForm('seriesKey', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{tr('wizard.seriesNameKey')}</label>
            <input
              className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm"
              value={form.seriesNameKey}
              onChange={(event) => updateForm('seriesNameKey', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{tr('wizard.seriesValuesKey')}</label>
            <input
              className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm"
              value={form.seriesValuesKey}
              onChange={(event) => updateForm('seriesValuesKey', event.target.value)}
            />
          </div>
        </div>
      )}

      {form.type === 'status' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{tr('wizard.labelKey')}</label>
            <input
              className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm"
              value={form.statusLabelKey}
              onChange={(event) => updateForm('statusLabelKey', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{tr('wizard.stateKey')}</label>
            <input
              className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm"
              value={form.statusStateKey}
              onChange={(event) => updateForm('statusStateKey', event.target.value)}
            />
          </div>
          <div className="space-y-2 col-span-2">
            <label className="text-sm font-medium">{tr('wizard.messageKeyOptional')}</label>
            <input
              className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm"
              value={form.statusMessageKey}
              onChange={(event) => updateForm('statusMessageKey', event.target.value)}
            />
          </div>
        </div>
      )}

      {form.type === 'gauge' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{tr('wizard.gaugeMinKey')}</label>
            <input
              className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm"
              value={form.gaugeMinKey}
              onChange={(event) => updateForm('gaugeMinKey', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{tr('wizard.gaugeMaxKey')}</label>
            <input
              className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm"
              value={form.gaugeMaxKey}
              onChange={(event) => updateForm('gaugeMaxKey', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{tr('wizard.gaugeValueKey')}</label>
            <input
              className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm"
              value={form.gaugeValueKey}
              onChange={(event) => updateForm('gaugeValueKey', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{tr('wizard.gaugeUnitKeyOptional')}</label>
            <input
              className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm"
              value={form.gaugeUnitKey}
              onChange={(event) => updateForm('gaugeUnitKey', event.target.value)}
            />
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border/70 bg-secondary/20 p-3 text-xs text-muted-foreground">
        {tr('wizard.mappingHint')}
      </div>
    </div>
  );

  const renderPreview = () => {
    if (!testResult) {
      return (
        <div className="w-full h-32 border border-dashed border-border rounded-lg flex items-center justify-center text-sm text-muted-foreground bg-secondary/10">
          {tr('wizard.clickRunTest')}
        </div>
      );
    }

    if (!testResult.ok) {
      return (
        <div className="w-full border border-red-500/30 bg-red-500/10 rounded-lg p-4 text-sm text-red-300">
          <p className="font-medium mb-1">{tr('wizard.testFailed')}</p>
          <p>{testResult.error}</p>
        </div>
      );
    }

    if (form.type === 'scalar') {
      const payload = testResult.payload as any;
      return (
        <div className="w-full border border-emerald-500/30 bg-emerald-500/10 rounded-lg p-4">
          <p className="text-xs uppercase text-emerald-300 mb-2">{tr('wizard.scalarPreview')}</p>
          <div className="text-3xl font-bold">
            {payload.value}
            {payload.unit ? <span className="text-base ml-1 text-muted-foreground">{payload.unit}</span> : null}
          </div>
        </div>
      );
    }

    if (form.type === 'series') {
      const payload = testResult.payload as any;
      return (
        <div className="w-full border border-blue-500/30 bg-blue-500/10 rounded-lg p-4 space-y-2">
          <p className="text-xs uppercase text-blue-300">{tr('wizard.seriesPreview')}</p>
          <p className="text-sm text-muted-foreground">
            {tr('wizard.points', { count: payload?.x_axis?.length ?? 0 })}
          </p>
          <p className="text-sm text-muted-foreground">
            {tr('wizard.seriesCount', { count: payload?.series?.length ?? 0 })}
          </p>
        </div>
      );
    }

    if (form.type === 'gauge') {
      const payload = testResult.payload as any;
      const min = Number(payload?.min ?? 0);
      const max = Number(payload?.max ?? 100);
      const value = Number(payload?.value ?? 0);
      const hasRange = Number.isFinite(min) && Number.isFinite(max) && max > min;
      const percent = hasRange ? Math.round(Math.max(0, Math.min(1, (value - min) / (max - min))) * 100) : 0;

      return (
        <div className="w-full border border-cyan-500/30 bg-cyan-500/10 rounded-lg p-4 space-y-3">
          <p className="text-xs uppercase text-cyan-300">{tr('wizard.gaugePreview')}</p>
          <div className="flex items-end justify-between text-xs text-muted-foreground">
            <span>{min}</span>
            <span>{max}</span>
          </div>
          <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
            <div className="h-full bg-cyan-400 transition-all duration-300" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-2xl font-bold">
            {value}
            {payload?.unit ? <span className="text-base ml-1 text-muted-foreground">{payload.unit}</span> : null}
          </p>
        </div>
      );
    }

    const payload = testResult.payload as any;
    return (
      <div className="w-full border border-amber-500/30 bg-amber-500/10 rounded-lg p-4 space-y-2">
        <p className="text-xs uppercase text-amber-300">{tr('wizard.statusPreview')}</p>
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 px-3 py-1 text-sm font-medium">
          <CircleDot size={14} />
          <span>{payload?.label}</span>
          <span className="uppercase">{payload?.state}</span>
        </div>
        {payload?.message && <p className="text-sm text-muted-foreground">{payload.message}</p>}
      </div>
    );
  };

  const renderStepFour = () => (
    <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium">{tr('wizard.testAndPreview')}</h3>
        </div>
        <Button onClick={runTest} disabled={isTesting}>
          {isTesting ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Play size={16} className="mr-2" />}{' '}
          {isTesting ? tr('wizard.running') : tr('wizard.runTest')}
        </Button>
      </div>

      {renderPreview()}

      <div className="space-y-2">
        <p className="text-sm font-medium">{tr('wizard.rawStdout')}</p>
        <pre className="text-xs font-mono bg-black/20 rounded p-3 max-h-40 overflow-auto border border-border/60">
          {testResult?.rawStdout || tr('wizard.noOutputYet')}
        </pre>
      </div>

      {testResult?.rawStderr && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-amber-400">{tr('wizard.stderr')}</p>
          <pre className="text-xs font-mono bg-black/20 rounded p-3 max-h-40 overflow-auto border border-border/60 text-amber-300">
            {testResult.rawStderr}
          </pre>
        </div>
      )}

      {testResult?.ok && (
        <div className="flex items-center gap-2 text-emerald-400 text-sm">
          <CheckCircle2 size={16} />
          <span>{tr('wizard.testPassed')}</span>
        </div>
      )}
    </div>
  );

  const stepLabels = [
    tr('wizard.step.info'),
    tr('wizard.step.source'),
    tr('wizard.step.mapping'),
    tr('wizard.step.test'),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-3xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              {isEditing ? tr('wizard.editMetric') : tr('wizard.addMetric')}
            </h2>
            <p className="text-sm text-muted-foreground">{tr('wizard.subtitle')}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          <div className="flex items-center mb-8 gap-3 text-sm overflow-x-auto pb-2">
            {stepLabels.map((label, index) => {
              const currentStep = index + 1;
              const active = isEditing ? step === currentStep : step >= currentStep;

              return (
                <React.Fragment key={label}>
                  {isEditing ? (
                    <button
                      type="button"
                      onClick={() => {
                        setValidationMessage('');
                        setStep(currentStep);
                      }}
                      className={`flex items-center gap-2 ${
                        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs">
                        {currentStep}
                      </span>
                      <span>{label}</span>
                    </button>
                  ) : (
                    <div className={`flex items-center gap-2 ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                      <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs">
                        {currentStep}
                      </span>
                      <span>{label}</span>
                    </div>
                  )}
                  {currentStep < stepLabels.length && <div className="h-px w-8 bg-border" />}
                </React.Fragment>
              );
            })}
          </div>

          {step === 1 && renderStepOne()}
          {step === 2 && renderStepTwo()}
          {step === 3 && renderStepThree()}
          {step === 4 && renderStepFour()}

          {validationMessage && (
            <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {validationMessage}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border flex justify-between bg-card">
          <Button variant="ghost" onClick={goBack} disabled={step === 1}>
            {tr('common.back')}
          </Button>

          {isEditing ? (
            <div className="flex items-center gap-2">
              {step < 4 && (
                <Button variant="outline" onClick={goNext}>
                  {tr('common.next')} <ChevronRight size={16} className="ml-1" />
                </Button>
              )}
              <Button onClick={handleSubmit} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {tr('wizard.saveChanges')}
              </Button>
            </div>
          ) : step < 4 ? (
            <Button onClick={goNext}>
              {tr('common.next')} <ChevronRight size={16} className="ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {tr('wizard.createCard')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
