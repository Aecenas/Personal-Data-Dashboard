import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Plus,
  Loader2,
  FolderOpen,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from './ui/Button';
import { useStore } from '../store';
import {
  Card,
  CardType,
  MappingConfig,
  UIConfig,
  ScalarContentPosition,
  TextSizePreset,
  VerticalContentPosition,
} from '../types';
import { executionService, ExecutionResult } from '../services/execution';
import { ArgParseError, formatScriptArgs, parseScriptArgs } from '../services/arg-parser';
import { normalizeAlertConfig } from '../services/alerts';
import { t } from '../i18n';
import { interactionSoundService } from '../services/interaction-sound';

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
  scalarPosition: ScalarContentPosition;
  scalarTextSize: TextSizePreset;
  statusVerticalPosition: VerticalContentPosition;
  statusTextSize: TextSizePreset;
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
  alertEnabled: boolean;
  alertCooldownSec: number;
  alertStatusChangeEnabled: boolean;
  alertUpperThreshold: string;
  alertLowerThreshold: string;
}

type ScriptValidationStatus = 'idle' | 'checking' | 'valid' | 'invalid';

interface ScriptValidationState {
  status: ScriptValidationStatus;
  message?: string;
  resolvedPython?: string;
}

type ValidationAnchor = 'title' | null;

const defaultForm: WizardForm = {
  title: '',
  group: 'Default',
  type: 'scalar',
  size: '1x1',
  colorTheme: 'default',
  scalarPosition: 'center',
  scalarTextSize: 'medium',
  statusVerticalPosition: 'center',
  statusTextSize: 'medium',
  scriptPath: '',
  scriptArgsText: '',
  pythonPath: '',
  intervalSec: 300,
  timeoutMs: 10000,
  refreshOnStart: false,
  refreshOnResume: false,
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
  alertEnabled: false,
  alertCooldownSec: 300,
  alertStatusChangeEnabled: true,
  alertUpperThreshold: '',
  alertLowerThreshold: '',
};

const groupMutationErrorKeyMap: Record<string, string> = {
  empty: 'groups.error.empty',
  reserved: 'groups.error.reserved',
  duplicate: 'groups.error.duplicate',
  not_found: 'groups.error.notFound',
  target_required: 'groups.error.targetRequired',
  target_invalid: 'groups.error.targetInvalid',
  target_same: 'groups.error.targetSame',
  last_group: 'groups.error.lastGroup',
};

const scalarPositionOptions: Array<{ value: ScalarContentPosition; labelKey: string }> = [
  { value: 'top-left', labelKey: 'wizard.position.topLeft' },
  { value: 'top-center', labelKey: 'wizard.position.topCenter' },
  { value: 'top-right', labelKey: 'wizard.position.topRight' },
  { value: 'middle-left', labelKey: 'wizard.position.middleLeft' },
  { value: 'center', labelKey: 'wizard.position.center' },
  { value: 'middle-right', labelKey: 'wizard.position.middleRight' },
  { value: 'bottom-left', labelKey: 'wizard.position.bottomLeft' },
  { value: 'bottom-center', labelKey: 'wizard.position.bottomCenter' },
  { value: 'bottom-right', labelKey: 'wizard.position.bottomRight' },
];

const verticalPositionOptions: Array<{ value: VerticalContentPosition; labelKey: string }> = [
  { value: 'top', labelKey: 'wizard.position.top' },
  { value: 'center', labelKey: 'wizard.position.center' },
  { value: 'bottom', labelKey: 'wizard.position.bottom' },
];

const textSizeOptions: Array<{ value: TextSizePreset; labelKey: string }> = [
  { value: 'small', labelKey: 'wizard.textSizeSmall' },
  { value: 'medium', labelKey: 'wizard.textSizeMedium' },
  { value: 'large', labelKey: 'wizard.textSizeLarge' },
];

const scalarPositionPreviewClassMap: Record<ScalarContentPosition, string> = {
  'top-left': 'items-start justify-start',
  'top-center': 'items-start justify-center',
  'top-right': 'items-start justify-end',
  'middle-left': 'items-center justify-start',
  center: 'items-center justify-center',
  'middle-right': 'items-center justify-end',
  'bottom-left': 'items-end justify-start',
  'bottom-center': 'items-end justify-center',
  'bottom-right': 'items-end justify-end',
};

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

const createFormFromCard = (card: Card): WizardForm => {
  const alertConfig = normalizeAlertConfig(card.alert_config);

  return {
    title: card.title,
    group: card.group,
    type: card.type,
    size: card.ui_config.size,
    colorTheme: card.ui_config.color_theme,
    scalarPosition: card.ui_config.scalar_position ?? 'center',
    scalarTextSize: card.ui_config.scalar_text_size ?? 'medium',
    statusVerticalPosition: card.ui_config.status_vertical_position ?? 'center',
    statusTextSize: card.ui_config.status_text_size ?? 'medium',
    scriptPath: card.script_config.path,
    scriptArgsText: formatScriptArgs(card.script_config.args),
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
    alertEnabled: alertConfig.enabled,
    alertCooldownSec: alertConfig.cooldown_sec,
    alertStatusChangeEnabled: alertConfig.status_change_enabled ?? true,
    alertUpperThreshold: alertConfig.upper_threshold !== undefined ? String(alertConfig.upper_threshold) : '',
    alertLowerThreshold: alertConfig.lower_threshold !== undefined ? String(alertConfig.lower_threshold) : '',
  };
};

export const CreationWizard: React.FC<CreationWizardProps> = ({ onClose, editingCard }) => {
  const { cards, groups, addCard, updateCard, refreshCard, createGroup, defaultPythonPath, language } = useStore();
  const tr = (key: string, params?: Record<string, string | number>) => t(language, key, params);

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<WizardForm>(defaultForm);
  const [testResult, setTestResult] = useState<ExecutionResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string>('');
  const [validationAnchor, setValidationAnchor] = useState<ValidationAnchor>(null);
  const [scriptValidation, setScriptValidation] = useState<ScriptValidationState>({ status: 'idle' });
  const [isCreateGroupOpen, setCreateGroupOpen] = useState(false);
  const [createGroupName, setCreateGroupName] = useState('');
  const [createGroupError, setCreateGroupError] = useState('');
  const scriptValidationRequestRef = useRef(0);

  const isEditing = Boolean(editingCard);

  const groupOptions = useMemo(
    () =>
      groups
        .slice()
        .sort((a, b) => {
          if (a.order !== b.order) return a.order - b.order;
          return a.name.localeCompare(b.name);
        })
        .map((group) => group.name),
    [groups],
  );

  useEffect(() => {
    scriptValidationRequestRef.current += 1;
    setScriptValidation({ status: 'idle' });
    setValidationMessage('');
    setValidationAnchor(null);

    if (editingCard) {
      setForm(createFormFromCard(editingCard));
      setTestResult(null);
      setStep(1);
      return;
    }

    setForm({
      ...defaultForm,
      group: groupOptions[0] ?? '',
    });
    setTestResult(null);
    setStep(1);
  }, [editingCard?.id, groupOptions]);

  useEffect(() => {
    if (groupOptions.length === 0) {
      if (form.group) {
        setForm((prev) => ({ ...prev, group: '' }));
      }
      return;
    }
    if (!groupOptions.includes(form.group)) {
      setForm((prev) => ({ ...prev, group: groupOptions[0] }));
    }
  }, [groupOptions, form.group]);

  useEffect(() => {
    setTestResult(null);
  }, [
    form.type,
    form.scalarPosition,
    form.scalarTextSize,
    form.statusVerticalPosition,
    form.statusTextSize,
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

  useEffect(() => {
    const scriptPath = form.scriptPath.trim();
    const pythonPath = form.pythonPath.trim() || defaultPythonPath?.trim() || undefined;

    scriptValidationRequestRef.current += 1;
    const requestId = scriptValidationRequestRef.current;

    if (!scriptPath) {
      setScriptValidation({ status: 'idle' });
      return;
    }

    if (!scriptPath.endsWith('.py')) {
      setScriptValidation({
        status: 'invalid',
        message: tr('wizard.validation.scriptExt'),
      });
      return;
    }

    setScriptValidation({ status: 'checking' });

    const timerId = setTimeout(() => {
      void (async () => {
        const result = await executionService.validateScript(scriptPath, pythonPath);
        if (scriptValidationRequestRef.current !== requestId) return;

        if (result.valid) {
          setScriptValidation({
            status: 'valid',
            message: result.message,
            resolvedPython: result.resolved_python,
          });
          return;
        }

        setScriptValidation({
          status: 'invalid',
          message: result.message || tr('wizard.validation.scriptPrecheckFailed'),
        });
      })();
    }, 400);

    return () => {
      clearTimeout(timerId);
    };
  }, [form.scriptPath, form.pythonPath, defaultPythonPath, language]);

  const getScriptValidationBlockMessage = () => {
    if (scriptValidation.status === 'checking') {
      return tr('wizard.validation.scriptChecking');
    }
    if (scriptValidation.status === 'invalid') {
      return scriptValidation.message || tr('wizard.validation.scriptPrecheckFailed');
    }
    if (scriptValidation.status === 'idle') {
      return tr('wizard.validation.scriptPrecheckPending');
    }
    return '';
  };

  const parsedArgs = useMemo(() => {
    try {
      return {
        args: parseScriptArgs(form.scriptArgsText),
        error: '',
      };
    } catch (error) {
      if (error instanceof ArgParseError && error.code === 'UNCLOSED_QUOTE') {
        return {
          args: [] as string[],
          error: tr('wizard.validation.scriptArgsUnclosedQuote', {
            quote: error.quote ?? '"',
          }),
        };
      }
      return {
        args: [] as string[],
        error: tr('wizard.validation.scriptArgsInvalid'),
      };
    }
  }, [form.scriptArgsText, language]);

  const parseOptionalThreshold = (input: string): number | undefined => {
    const value = input.trim();
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const buildAlertConfig = () => normalizeAlertConfig({
    enabled: form.alertEnabled,
    cooldown_sec: Number(form.alertCooldownSec),
    status_change_enabled: form.alertStatusChangeEnabled,
    upper_threshold: parseOptionalThreshold(form.alertUpperThreshold),
    lower_threshold: parseOptionalThreshold(form.alertLowerThreshold),
  });

  const updateForm = <K extends keyof WizardForm>(key: K, value: WizardForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setValidationError = (message: string, anchor: ValidationAnchor = null) => {
    setValidationMessage(message);
    setValidationAnchor(anchor);
  };

  const clearValidationError = () => {
    setValidationMessage('');
    setValidationAnchor(null);
  };

  const resolveGroupErrorMessage = (error: string) => tr(groupMutationErrorKeyMap[error] ?? 'groups.error.generic');

  const openCreateGroupDialog = () => {
    interactionSoundService.play('modal.open');
    setCreateGroupError('');
    setCreateGroupOpen(true);
  };

  const closeCreateGroupDialog = (playSound = true) => {
    if (playSound) interactionSoundService.play('modal.close');
    setCreateGroupOpen(false);
    setCreateGroupError('');
    setCreateGroupName('');
  };

  const submitCreateGroup = () => {
    setCreateGroupError('');
    const result = createGroup(createGroupName);
    if ('error' in result) {
      interactionSoundService.play('action.error');
      setCreateGroupError(resolveGroupErrorMessage(result.error));
      return;
    }

    const normalizedName = createGroupName.trim();
    if (normalizedName) {
      updateForm('group', normalizedName);
    }
    interactionSoundService.play('action.success');
    closeCreateGroupDialog(false);
  };

  const validateStep = (targetStep: number): boolean => {
    if (targetStep === 1) {
      if (!form.title.trim()) {
        setValidationError(tr('wizard.validation.titleRequired'), 'title');
        return false;
      }
      if (!form.group.trim()) {
        setValidationError(tr('wizard.validation.groupRequired'));
        return false;
      }
    }

    if (targetStep === 2) {
      if (!form.scriptPath.trim()) {
        setValidationError(tr('wizard.validation.scriptPathRequired'));
        return false;
      }
      if (!form.scriptPath.trim().endsWith('.py')) {
        setValidationError(tr('wizard.validation.scriptExt'));
        return false;
      }
      if (form.intervalSec < 0) {
        setValidationError(tr('wizard.validation.intervalMin'));
        return false;
      }
      if (form.timeoutMs < 1000) {
        setValidationError(tr('wizard.validation.timeoutMin'));
        return false;
      }
      if (parsedArgs.error) {
        setValidationError(parsedArgs.error);
        return false;
      }
      if (scriptValidation.status !== 'valid') {
        setValidationError(getScriptValidationBlockMessage());
        return false;
      }
    }

    if (targetStep === 3) {
      if (form.type === 'scalar' && !form.scalarValueKey.trim()) {
        setValidationError(tr('wizard.validation.scalarValue'));
        return false;
      }
      if (form.type === 'series') {
        if (!form.seriesXAxisKey.trim() || !form.seriesKey.trim()) {
          setValidationError(tr('wizard.validation.seriesAxes'));
          return false;
        }
        if (!form.seriesNameKey.trim() || !form.seriesValuesKey.trim()) {
          setValidationError(tr('wizard.validation.seriesFields'));
          return false;
        }
      }
      if (form.type === 'status') {
        if (!form.statusLabelKey.trim() || !form.statusStateKey.trim()) {
          setValidationError(tr('wizard.validation.statusFields'));
          return false;
        }
      }
      if (form.type === 'gauge') {
        if (!form.gaugeMinKey.trim() || !form.gaugeMaxKey.trim() || !form.gaugeValueKey.trim()) {
          setValidationError(tr('wizard.validation.gaugeFields'));
          return false;
        }
      }
    }

    if (targetStep === 4) {
      if (form.alertCooldownSec < 0) {
        setValidationError(tr('wizard.validation.alertCooldownMin'));
        return false;
      }

      const upperRaw = form.alertUpperThreshold.trim();
      const lowerRaw = form.alertLowerThreshold.trim();
      const upperThreshold = parseOptionalThreshold(form.alertUpperThreshold);
      const lowerThreshold = parseOptionalThreshold(form.alertLowerThreshold);

      if (upperRaw && upperThreshold === undefined) {
        setValidationError(tr('wizard.validation.alertUpperNumber'));
        return false;
      }

      if (lowerRaw && lowerThreshold === undefined) {
        setValidationError(tr('wizard.validation.alertLowerNumber'));
        return false;
      }

      if ((form.type === 'scalar' || form.type === 'gauge') && form.alertEnabled) {
        if (!upperRaw && !lowerRaw) {
          setValidationError(tr('wizard.validation.alertThresholdRequired'));
          return false;
        }
      }

      if (
        upperThreshold !== undefined &&
        lowerThreshold !== undefined &&
        lowerThreshold > upperThreshold
      ) {
        setValidationError(tr('wizard.validation.alertThresholdRange'));
        return false;
      }
    }

    clearValidationError();
    return true;
  };

  const validateAllRequiredSteps = () => {
    const requiredSteps = [1, 2, 3, 4];
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
      interactionSoundService.play('action.error');
      return;
    }

    interactionSoundService.play('refresh.trigger');
    setIsTesting(true);
    const result = await executionService.runDraft({
      type: form.type,
      scriptPath: form.scriptPath.trim(),
      args: parsedArgs.args,
      pythonPath: form.pythonPath.trim() || undefined,
      timeoutMs: Number(form.timeoutMs),
      mapping: buildMappingConfig(form),
      defaultPythonPath,
    });

    setTestResult(result);
    if (!result.ok) {
      interactionSoundService.play('action.error');
    }
    setIsTesting(false);
  };

  const handleSubmit = async () => {
    const valid = validateAllRequiredSteps();
    if (!valid) {
      interactionSoundService.play('action.error');
      return;
    }

    const mappingConfig = buildMappingConfig(form);
    const alertConfig = buildAlertConfig();
    const args = parsedArgs.args;
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
        alert_config: alertConfig,
        ui_config: {
          ...editingCard.ui_config,
          size: form.size,
          color_theme: form.colorTheme,
          scalar_position: form.scalarPosition,
          scalar_text_size: form.scalarTextSize,
          status_vertical_position: form.statusVerticalPosition,
          status_text_size: form.statusTextSize,
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
      interactionSoundService.play('action.success');
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
      alert_config: alertConfig,
      alert_state: {
        condition_last_trigger_at: {},
      },
      ui_config: {
        color_theme: form.colorTheme,
        size: form.size,
        x: 0,
        y: 0,
        scalar_position: form.scalarPosition,
        scalar_text_size: form.scalarTextSize,
        status_vertical_position: form.statusVerticalPosition,
        status_text_size: form.statusTextSize,
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
    interactionSoundService.play('action.success');
    onClose();
  };

  const goNext = () => {
    const ok = validateStep(step);
    if (!ok) {
      interactionSoundService.play('action.error');
      return;
    }

    if (step < 5) setStep((prev) => prev + 1);
  };

  const goBack = () => {
    clearValidationError();
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
          onChange={(event) => {
            const nextTitle = event.target.value;
            updateForm('title', nextTitle);
            if (validationAnchor === 'title' && nextTitle.trim()) {
              clearValidationError();
            }
          }}
        />
        {validationAnchor === 'title' && validationMessage && (
          <div
            className="rounded-md border border-red-500/40 bg-red-500/15 px-3 py-2 text-sm font-semibold text-red-600"
            role="alert"
          >
            {validationMessage}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">{tr('wizard.group')}</label>
          <div className="flex gap-2">
            <select
              className="flex-1 bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              value={form.group}
              onChange={(event) => updateForm('group', event.target.value)}
            >
              {groupOptions.length === 0 && (
                <option value="">{tr('wizard.groupEmptyOption')}</option>
              )}
              {groupOptions.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" data-sound="none" onClick={openCreateGroupDialog}>
              <Plus size={14} className="mr-1" /> {tr('wizard.groupCreate')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{tr('wizard.groupManageHint')}</p>
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

      {form.type === 'scalar' && (
        <div className="rounded-lg border border-border/70 bg-secondary/20 p-4 space-y-4">
          <p className="text-sm font-medium">{tr('wizard.displayOptions')}</p>
          <div className="space-y-2">
            <label className="text-sm font-medium">{tr('wizard.scalarContentPosition')}</label>
            <div className="grid grid-cols-3 gap-2">
              {scalarPositionOptions.map((option) => {
                const selected = form.scalarPosition === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    title={tr(option.labelKey)}
                    aria-label={tr(option.labelKey)}
                    onClick={() => updateForm('scalarPosition', option.value)}
                    className={`rounded-md border p-2 transition-colors ${
                      selected
                        ? 'border-primary bg-secondary text-primary'
                        : 'border-input bg-secondary/40 hover:bg-secondary/70 text-muted-foreground'
                    }`}
                  >
                    <div
                      className={`h-8 w-full rounded border border-current/30 bg-background/40 p-1 flex ${
                        scalarPositionPreviewClassMap[option.value]
                      }`}
                    >
                      <span className="h-2.5 w-2.5 rounded-full bg-current" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{tr('wizard.textSizePreset')}</label>
            <div className="grid grid-cols-3 gap-2">
              {textSizeOptions.map((option) => {
                const selected = form.scalarTextSize === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateForm('scalarTextSize', option.value)}
                    className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                      selected
                        ? 'border-primary bg-secondary text-primary'
                        : 'border-input bg-secondary/40 hover:bg-secondary/70'
                    }`}
                  >
                    {tr(option.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {form.type === 'status' && (
        <div className="rounded-lg border border-border/70 bg-secondary/20 p-4 space-y-4">
          <p className="text-sm font-medium">{tr('wizard.displayOptions')}</p>
          <div className="space-y-2">
            <label className="text-sm font-medium">{tr('wizard.statusVerticalPosition')}</label>
            <div className="grid grid-cols-3 gap-2">
              {verticalPositionOptions.map((option) => {
                const selected = form.statusVerticalPosition === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateForm('statusVerticalPosition', option.value)}
                    className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                      selected
                        ? 'border-primary bg-secondary text-primary'
                        : 'border-input bg-secondary/40 hover:bg-secondary/70'
                    }`}
                  >
                    {tr(option.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{tr('wizard.textSizePreset')}</label>
            <div className="grid grid-cols-3 gap-2">
              {textSizeOptions.map((option) => {
                const selected = form.statusTextSize === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateForm('statusTextSize', option.value)}
                    className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                      selected
                        ? 'border-primary bg-secondary text-primary'
                        : 'border-input bg-secondary/40 hover:bg-secondary/70'
                    }`}
                  >
                    {tr(option.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

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
          {parsedArgs.error && <p className="text-xs text-red-400">{parsedArgs.error}</p>}
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

      {scriptValidation.status !== 'idle' && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            scriptValidation.status === 'valid'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : scriptValidation.status === 'checking'
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          <div className="flex items-start gap-2">
            {scriptValidation.status === 'checking' && <Loader2 size={16} className="mt-0.5 animate-spin" />}
            {scriptValidation.status === 'valid' && <CheckCircle2 size={16} className="mt-0.5" />}
            {scriptValidation.status === 'invalid' && <ShieldAlert size={16} className="mt-0.5" />}
            <div className="space-y-1">
              <p className="font-medium">
                {scriptValidation.status === 'checking'
                  ? tr('wizard.scriptValidationChecking')
                  : scriptValidation.status === 'valid'
                    ? tr('wizard.scriptValidationValid')
                    : tr('wizard.scriptValidationInvalid')}
              </p>
              {scriptValidation.status === 'valid' && (
                <p>
                  {scriptValidation.resolvedPython
                    ? tr('wizard.scriptValidationResolved', { python: scriptValidation.resolvedPython })
                    : tr('wizard.scriptValidationResolvedFallback')}
                </p>
              )}
              {scriptValidation.status === 'invalid' && scriptValidation.message && <p>{scriptValidation.message}</p>}
            </div>
          </div>
        </div>
      )}

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

  const renderStepFour = () => (
    <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="rounded-lg border border-border/70 bg-secondary/20 p-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{tr('wizard.alerts.title')}</p>
            <p className="text-xs text-muted-foreground">{tr('wizard.alerts.description')}</p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.alertEnabled}
              onChange={(event) => updateForm('alertEnabled', event.target.checked)}
            />
            <span>{tr('wizard.alerts.enabled')}</span>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{tr('wizard.alerts.cooldown')}</label>
            <input
              type="number"
              min={0}
              value={form.alertCooldownSec}
              onChange={(event) => updateForm('alertCooldownSec', Number(event.target.value))}
              className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm"
            />
          </div>

          {form.type === 'status' && (
            <div className="space-y-2">
              <label className="text-sm font-medium">{tr('wizard.alerts.statusModeLabel')}</label>
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer mt-2">
                <input
                  type="checkbox"
                  checked={form.alertStatusChangeEnabled}
                  onChange={(event) => updateForm('alertStatusChangeEnabled', event.target.checked)}
                />
                <span>{tr('wizard.alerts.statusChange')}</span>
              </label>
            </div>
          )}

          {(form.type === 'scalar' || form.type === 'gauge') && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">{tr('wizard.alerts.upperThreshold')}</label>
                <input
                  type="number"
                  value={form.alertUpperThreshold}
                  onChange={(event) => updateForm('alertUpperThreshold', event.target.value)}
                  placeholder={tr('wizard.alerts.thresholdOptional')}
                  className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{tr('wizard.alerts.lowerThreshold')}</label>
                <input
                  type="number"
                  value={form.alertLowerThreshold}
                  onChange={(event) => updateForm('alertLowerThreshold', event.target.value)}
                  placeholder={tr('wizard.alerts.thresholdOptional')}
                  className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm"
                />
              </div>
            </>
          )}
        </div>

        {form.type === 'series' && (
          <p className="text-xs text-muted-foreground">{tr('wizard.alerts.seriesNotSupported')}</p>
        )}
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

  const renderStepFive = () => (
    <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium">{tr('wizard.testAndPreview')}</h3>
        </div>
        <Button
          onClick={runTest}
          data-sound="none"
          disabled={isTesting || scriptValidation.status !== 'valid' || Boolean(parsedArgs.error)}
        >
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
    tr('wizard.step.alert'),
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
          <Button variant="ghost" size="icon" data-sound="none" onClick={onClose}>
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
                        clearValidationError();
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
          {step === 5 && renderStepFive()}

          {validationMessage && !(step === 1 && validationAnchor === 'title') && (
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
              {step < 5 && (
                <Button variant="outline" onClick={goNext}>
                  {tr('common.next')} <ChevronRight size={16} className="ml-1" />
                </Button>
              )}
              <Button
                onClick={handleSubmit}
                disabled={scriptValidation.status !== 'valid' || Boolean(parsedArgs.error)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {tr('wizard.saveChanges')}
              </Button>
            </div>
          ) : step < 5 ? (
            <Button onClick={goNext}>
              {tr('common.next')} <ChevronRight size={16} className="ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={scriptValidation.status !== 'valid' || Boolean(parsedArgs.error)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {tr('wizard.createCard')}
            </Button>
          )}
        </div>
      </div>

      {isCreateGroupOpen && (
        <div className="fixed inset-0 z-[60] bg-black/55 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">{tr('wizard.groupCreateDialogTitle')}</h3>
              <button
                type="button"
                data-sound="none"
                onClick={() => closeCreateGroupDialog()}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{tr('wizard.group')}</label>
              <input
                autoFocus
                type="text"
                value={createGroupName}
                onChange={(event) => {
                  setCreateGroupName(event.target.value);
                  if (createGroupError) setCreateGroupError('');
                }}
                placeholder={tr('wizard.groupPlaceholder')}
                className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {createGroupError && <p className="text-sm text-destructive">{createGroupError}</p>}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                data-sound="none"
                onClick={() => closeCreateGroupDialog()}
              >
                {tr('common.cancel')}
              </Button>
              <Button type="button" data-sound="none" onClick={submitCreateGroup}>
                {tr('wizard.groupCreateConfirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
