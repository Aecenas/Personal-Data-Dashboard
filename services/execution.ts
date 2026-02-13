import { invoke } from '@tauri-apps/api/core';
import {
  Card,
  CardType,
  MappingConfig,
  NormalizedCardPayload,
  ScriptOutputScalar,
  ScriptOutputSeries,
  ScriptOutputStatus,
} from '../types';

export interface RunPythonScriptRequest {
  script_path: string;
  args: string[];
  python_path?: string;
  timeout_ms?: number;
}

export interface RunPythonScriptResponse {
  ok: boolean;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  timed_out: boolean;
  duration_ms: number;
}

export interface ValidatePythonScriptResponse {
  valid: boolean;
  message?: string;
  resolved_python?: string;
}

export interface ExecutionResult {
  ok: boolean;
  payload?: NormalizedCardPayload;
  rawStdout?: string;
  rawStderr?: string;
  error?: string;
  timedOut: boolean;
  exitCode: number | null;
  durationMs: number;
}

export interface DraftExecutionInput {
  type: CardType;
  scriptPath: string;
  args: string[];
  pythonPath?: string;
  timeoutMs?: number;
  mapping: MappingConfig;
  defaultPythonPath?: string;
}

const isTauri = () => typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

const clip = (value: string, max = 300) => {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
};

const readPath = (obj: unknown, path: string): unknown => {
  if (!path) return undefined;
  const parts = path.split('.').map((part) => part.trim()).filter(Boolean);
  let cursor: any = obj;
  for (const part of parts) {
    if (cursor === null || cursor === undefined) return undefined;
    cursor = cursor[part];
  }
  return cursor;
};

const normalizeState = (value: unknown): ScriptOutputStatus['state'] => {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'ok' || normalized === 'success' || normalized === 'healthy') return 'ok';
  if (normalized === 'warning' || normalized === 'warn') return 'warning';
  if (normalized === 'error' || normalized === 'danger' || normalized === 'critical') return 'error';
  return 'unknown';
};

const normalizeScalar = (data: unknown, mapping: MappingConfig): ScriptOutputScalar => {
  const scalarMapping = {
    value_key: 'value',
    unit_key: 'unit',
    trend_key: 'trend',
    color_key: 'color',
    ...(mapping.scalar ?? {}),
  };

  const value = readPath(data, scalarMapping.value_key);
  if (value === undefined || value === null) {
    throw new Error(`字段映射失败：未找到 scalar value (${scalarMapping.value_key})`);
  }

  const unit = readPath(data, scalarMapping.unit_key);
  const trend = readPath(data, scalarMapping.trend_key);
  const color = readPath(data, scalarMapping.color_key);

  return {
    value: value as number | string,
    unit: unit !== undefined ? String(unit) : undefined,
    trend: trend === 'up' || trend === 'down' || trend === 'flat' ? trend : undefined,
    color:
      color === 'success' || color === 'warning' || color === 'danger' || color === 'neutral'
        ? color
        : undefined,
  };
};

const normalizeSeries = (data: unknown, mapping: MappingConfig): ScriptOutputSeries => {
  const seriesMapping = {
    x_axis_key: 'x_axis',
    series_key: 'series',
    series_name_key: 'name',
    series_values_key: 'values',
    ...(mapping.series ?? {}),
  };

  const xAxisRaw = readPath(data, seriesMapping.x_axis_key);
  const seriesRaw = readPath(data, seriesMapping.series_key);

  if (!Array.isArray(xAxisRaw)) {
    throw new Error(`字段映射失败：x_axis 不是数组 (${seriesMapping.x_axis_key})`);
  }
  if (!Array.isArray(seriesRaw)) {
    throw new Error(`字段映射失败：series 不是数组 (${seriesMapping.series_key})`);
  }

  const series = seriesRaw.map((item, index) => {
    const name = readPath(item, seriesMapping.series_name_key);
    const values = readPath(item, seriesMapping.series_values_key);

    if (!Array.isArray(values)) {
      throw new Error(`字段映射失败：series[${index}].values 不是数组`);
    }

    return {
      name: String(name ?? `Series ${index + 1}`),
      values: values.map((value) => Number(value)),
    };
  });

  return {
    x_axis: xAxisRaw.map((item) => (typeof item === 'number' ? item : String(item))),
    series,
  };
};

const normalizeStatus = (data: unknown, mapping: MappingConfig): ScriptOutputStatus => {
  const statusMapping = {
    label_key: 'label',
    state_key: 'state',
    message_key: 'message',
    ...(mapping.status ?? {}),
  };

  const label = readPath(data, statusMapping.label_key);
  const state = readPath(data, statusMapping.state_key);
  const message = readPath(data, statusMapping.message_key);

  if (label === undefined || label === null) {
    throw new Error(`字段映射失败：未找到 status label (${statusMapping.label_key})`);
  }

  return {
    label: String(label),
    state: normalizeState(state),
    message: message !== undefined ? String(message) : undefined,
  };
};

const normalizePayload = (output: any, type: CardType, mapping: MappingConfig): NormalizedCardPayload => {
  if (!output || typeof output !== 'object') {
    throw new Error('脚本输出不是有效 JSON 对象');
  }

  if (typeof output.type !== 'string') {
    throw new Error('脚本输出缺少 type 字段');
  }

  if (!('data' in output)) {
    throw new Error('脚本输出缺少 data 字段');
  }

  if (output.type !== type) {
    throw new Error(`脚本输出类型为 ${output.type}，与卡片类型 ${type} 不一致`);
  }

  if (type === 'scalar') return normalizeScalar(output.data, mapping);
  if (type === 'series') return normalizeSeries(output.data, mapping);
  return normalizeStatus(output.data, mapping);
};

const runScript = async (request: RunPythonScriptRequest): Promise<RunPythonScriptResponse> => {
  if (!isTauri()) {
    throw new Error('当前运行环境不是 Tauri，无法调用本地 Python 脚本');
  }

  return invoke<RunPythonScriptResponse>('run_python_script', {
    request,
  });
};

const normalizeExecutionError = (response: RunPythonScriptResponse): string => {
  if (response.timed_out) return '脚本执行超时，请检查脚本逻辑或增大超时时间';
  if (response.exit_code !== 0) {
    if (response.stderr.trim()) return `脚本执行失败：${clip(response.stderr.trim())}`;
    return `脚本执行失败，退出码 ${response.exit_code}`;
  }
  return '脚本执行失败';
};

const executeDraft = async (input: DraftExecutionInput): Promise<ExecutionResult> => {
  const request: RunPythonScriptRequest = {
    script_path: input.scriptPath,
    args: input.args,
    python_path: input.pythonPath || input.defaultPythonPath,
    timeout_ms: input.timeoutMs,
  };

  try {
    const response = await runScript(request);

    if (!response.ok || response.exit_code !== 0 || response.timed_out) {
      return {
        ok: false,
        error: normalizeExecutionError(response),
        rawStdout: response.stdout,
        rawStderr: response.stderr,
        timedOut: response.timed_out,
        exitCode: response.exit_code,
        durationMs: response.duration_ms,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.stdout);
    } catch {
      return {
        ok: false,
        error: `脚本输出不是合法 JSON：${clip(response.stdout)}`,
        rawStdout: response.stdout,
        rawStderr: response.stderr,
        timedOut: response.timed_out,
        exitCode: response.exit_code,
        durationMs: response.duration_ms,
      };
    }

    const payload = normalizePayload(parsed, input.type, input.mapping);

    return {
      ok: true,
      payload,
      rawStdout: response.stdout,
      rawStderr: response.stderr,
      timedOut: false,
      exitCode: response.exit_code,
      durationMs: response.duration_ms,
    };
  } catch (error) {
    return {
      ok: false,
      error: (error as Error).message,
      timedOut: false,
      exitCode: null,
      durationMs: 0,
    };
  }
};

export const executionService = {
  async runCard(card: Card, defaultPythonPath?: string): Promise<ExecutionResult> {
    return executeDraft({
      type: card.type,
      scriptPath: card.script_config.path,
      args: card.script_config.args,
      pythonPath: card.script_config.env_path,
      timeoutMs: card.refresh_config.timeout_ms,
      mapping: card.mapping_config,
      defaultPythonPath,
    });
  },

  async runDraft(input: DraftExecutionInput): Promise<ExecutionResult> {
    return executeDraft(input);
  },

  async validateScript(
    scriptPath: string,
    pythonPath?: string,
  ): Promise<ValidatePythonScriptResponse> {
    if (!scriptPath.trim()) {
      return { valid: false, message: '脚本路径不能为空' };
    }

    if (!scriptPath.endsWith('.py')) {
      return { valid: false, message: '脚本文件必须以 .py 结尾' };
    }

    if (!isTauri()) {
      return {
        valid: true,
        message: '浏览器模式下仅做基础校验，完整校验需在 Tauri 桌面端进行',
      };
    }

    try {
      const response = await invoke<ValidatePythonScriptResponse>('validate_python_script', {
        request: {
          script_path: scriptPath,
          python_path: pythonPath,
        },
      });
      return response;
    } catch (error) {
      return {
        valid: false,
        message: (error as Error).message,
      };
    }
  },
};

export const __testables = {
  readPath,
  normalizePayload,
  normalizeState,
};
