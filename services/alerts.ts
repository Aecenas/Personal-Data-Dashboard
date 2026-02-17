import {
  CardAlertConfig,
  CardAlertState,
  CardType,
  NormalizedCardPayload,
  ScriptOutputGauge,
  ScriptOutputScalar,
  ScriptOutputStatus,
} from '../types';

export const DEFAULT_ALERT_COOLDOWN_SEC = 300;

const STATUS_STATES: ScriptOutputStatus['state'][] = ['ok', 'warning', 'error', 'unknown'];

const parseFiniteNumber = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeState = (value: unknown): ScriptOutputStatus['state'] | undefined => {
  if (typeof value !== 'string') return undefined;
  return STATUS_STATES.includes(value as ScriptOutputStatus['state'])
    ? (value as ScriptOutputStatus['state'])
    : undefined;
};

export const createDefaultAlertConfig = (): CardAlertConfig => ({
  enabled: false,
  cooldown_sec: DEFAULT_ALERT_COOLDOWN_SEC,
  status_change_enabled: true,
  upper_threshold: undefined,
  lower_threshold: undefined,
});

export const normalizeAlertConfig = (config?: Partial<CardAlertConfig> | null): CardAlertConfig => {
  const defaults = createDefaultAlertConfig();
  const cooldownCandidate = parseFiniteNumber(config?.cooldown_sec);
  const upperCandidate = parseFiniteNumber(config?.upper_threshold);
  const lowerCandidate = parseFiniteNumber(config?.lower_threshold);

  return {
    enabled: config?.enabled ?? defaults.enabled,
    cooldown_sec: Math.max(0, Math.floor(cooldownCandidate ?? defaults.cooldown_sec)),
    status_change_enabled: config?.status_change_enabled ?? defaults.status_change_enabled,
    upper_threshold: upperCandidate,
    lower_threshold: lowerCandidate,
  };
};

export const createDefaultAlertState = (): CardAlertState => ({
  condition_last_trigger_at: {},
});

export const normalizeAlertState = (state?: Partial<CardAlertState> | null): CardAlertState => {
  const normalized: Record<string, number> = {};
  const rawMap = state?.condition_last_trigger_at;

  if (rawMap && typeof rawMap === 'object') {
    Object.entries(rawMap).forEach(([key, value]) => {
      const timestamp = parseFiniteNumber(value);
      if (timestamp === undefined) return;
      normalized[key] = Math.floor(timestamp);
    });
  }

  return {
    last_status_state: normalizeState(state?.last_status_state),
    condition_last_trigger_at: normalized,
  };
};

export type AlertTriggerReason = 'status_change' | 'upper_threshold' | 'lower_threshold';

export interface AlertTriggerEvent {
  conditionKey: string;
  reason: AlertTriggerReason;
  value?: number;
  threshold?: number;
  fromState?: ScriptOutputStatus['state'];
  toState?: ScriptOutputStatus['state'];
}

export interface AlertEvaluationResult {
  events: AlertTriggerEvent[];
  nextState: CardAlertState;
}

export interface EvaluateCardAlertInput {
  cardType: CardType;
  payload: NormalizedCardPayload;
  config?: Partial<CardAlertConfig>;
  state?: Partial<CardAlertState>;
  now: number;
}

export interface EvaluateThresholdAlertActiveInput {
  cardType: CardType;
  payload?: NormalizedCardPayload;
  config?: Partial<CardAlertConfig>;
}

const extractNumericValue = (cardType: CardType, payload: NormalizedCardPayload): number | undefined => {
  if (cardType === 'scalar') {
    return parseFiniteNumber((payload as ScriptOutputScalar).value);
  }

  if (cardType === 'gauge') {
    return parseFiniteNumber((payload as ScriptOutputGauge).value);
  }

  return undefined;
};

export const isThresholdAlertActive = ({
  cardType,
  payload,
  config,
}: EvaluateThresholdAlertActiveInput): boolean => {
  if (!payload) return false;
  if (cardType !== 'scalar' && cardType !== 'gauge') return false;

  const normalizedConfig = normalizeAlertConfig(config);
  if (!normalizedConfig.enabled) return false;

  const value = extractNumericValue(cardType, payload);
  if (value === undefined) return false;

  const reachedUpper =
    normalizedConfig.upper_threshold !== undefined && value >= normalizedConfig.upper_threshold;
  const reachedLower =
    normalizedConfig.lower_threshold !== undefined && value <= normalizedConfig.lower_threshold;

  return reachedUpper || reachedLower;
};

const shouldTrigger = (
  conditionKey: string,
  now: number,
  cooldownMs: number,
  state: CardAlertState,
) => {
  const lastTriggeredAt = state.condition_last_trigger_at[conditionKey];
  if (lastTriggeredAt === undefined) return true;
  return now - lastTriggeredAt >= cooldownMs;
};

export const evaluateCardAlert = ({
  cardType,
  payload,
  config,
  state,
  now,
}: EvaluateCardAlertInput): AlertEvaluationResult => {
  const normalizedConfig = normalizeAlertConfig(config);
  const nextState = normalizeAlertState(state);
  const events: AlertTriggerEvent[] = [];
  const cooldownMs = Math.max(0, normalizedConfig.cooldown_sec * 1000);

  if (cardType === 'status') {
    const statusPayload = payload as ScriptOutputStatus;
    const previousState = nextState.last_status_state;
    const currentState = statusPayload.state;

    if (
      normalizedConfig.enabled &&
      normalizedConfig.status_change_enabled &&
      previousState &&
      previousState !== currentState
    ) {
      const conditionKey = `status_change:${previousState}->${currentState}`;
      if (shouldTrigger(conditionKey, now, cooldownMs, nextState)) {
        nextState.condition_last_trigger_at[conditionKey] = now;
        events.push({
          conditionKey,
          reason: 'status_change',
          fromState: previousState,
          toState: currentState,
        });
      }
    }

    nextState.last_status_state = currentState;
    return { events, nextState };
  }

  if (cardType === 'scalar' || cardType === 'gauge') {
    const value = extractNumericValue(cardType, payload);
    if (value === undefined || !normalizedConfig.enabled) {
      return { events, nextState };
    }

    if (normalizedConfig.upper_threshold !== undefined && value >= normalizedConfig.upper_threshold) {
      const conditionKey = 'threshold:upper';
      if (shouldTrigger(conditionKey, now, cooldownMs, nextState)) {
        nextState.condition_last_trigger_at[conditionKey] = now;
        events.push({
          conditionKey,
          reason: 'upper_threshold',
          value,
          threshold: normalizedConfig.upper_threshold,
        });
      }
    }

    if (normalizedConfig.lower_threshold !== undefined && value <= normalizedConfig.lower_threshold) {
      const conditionKey = 'threshold:lower';
      if (shouldTrigger(conditionKey, now, cooldownMs, nextState)) {
        nextState.condition_last_trigger_at[conditionKey] = now;
        events.push({
          conditionKey,
          reason: 'lower_threshold',
          value,
          threshold: normalizedConfig.lower_threshold,
        });
      }
    }
  }

  return { events, nextState };
};
