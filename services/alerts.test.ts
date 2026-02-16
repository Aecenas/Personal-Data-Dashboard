import { describe, expect, it } from 'vitest';
import { evaluateCardAlert } from './alerts';

describe('alert evaluation', () => {
  it('does not trigger for first status sample but records last state', () => {
    const result = evaluateCardAlert({
      cardType: 'status',
      payload: {
        label: 'API',
        state: 'ok',
      },
      config: {
        enabled: true,
        cooldown_sec: 300,
        status_change_enabled: true,
      },
      state: undefined,
      now: 1_000,
    });

    expect(result.events).toEqual([]);
    expect(result.nextState.last_status_state).toBe('ok');
  });

  it('triggers status change and applies cooldown per transition', () => {
    const first = evaluateCardAlert({
      cardType: 'status',
      payload: {
        label: 'API',
        state: 'error',
      },
      config: {
        enabled: true,
        cooldown_sec: 60,
        status_change_enabled: true,
      },
      state: {
        last_status_state: 'ok',
        condition_last_trigger_at: {},
      },
      now: 1_000,
    });

    expect(first.events).toHaveLength(1);
    expect(first.events[0].conditionKey).toBe('status_change:ok->error');

    const second = evaluateCardAlert({
      cardType: 'status',
      payload: {
        label: 'API',
        state: 'error',
      },
      config: {
        enabled: true,
        cooldown_sec: 60,
        status_change_enabled: true,
      },
      state: {
        last_status_state: 'ok',
        condition_last_trigger_at: first.nextState.condition_last_trigger_at,
      },
      now: 30_000,
    });

    expect(second.events).toEqual([]);
  });

  it('enforces cooldown per threshold condition', () => {
    const first = evaluateCardAlert({
      cardType: 'scalar',
      payload: {
        value: 98,
        unit: '%',
      },
      config: {
        enabled: true,
        cooldown_sec: 60,
        upper_threshold: 90,
        lower_threshold: 10,
      },
      state: {
        condition_last_trigger_at: {},
      },
      now: 1_000,
    });

    expect(first.events).toHaveLength(1);
    expect(first.events[0].conditionKey).toBe('threshold:upper');

    const second = evaluateCardAlert({
      cardType: 'scalar',
      payload: {
        value: 95,
        unit: '%',
      },
      config: {
        enabled: true,
        cooldown_sec: 60,
        upper_threshold: 90,
        lower_threshold: 10,
      },
      state: first.nextState,
      now: 30_000,
    });

    expect(second.events).toEqual([]);

    const third = evaluateCardAlert({
      cardType: 'scalar',
      payload: {
        value: 2,
        unit: '%',
      },
      config: {
        enabled: true,
        cooldown_sec: 60,
        upper_threshold: 90,
        lower_threshold: 10,
      },
      state: first.nextState,
      now: 30_000,
    });

    expect(third.events).toHaveLength(1);
    expect(third.events[0].conditionKey).toBe('threshold:lower');
  });

  it('evaluates threshold alerts for gauge values', () => {
    const result = evaluateCardAlert({
      cardType: 'gauge',
      payload: {
        min: 0,
        max: 100,
        value: 88,
        unit: '%',
      },
      config: {
        enabled: true,
        cooldown_sec: 10,
        upper_threshold: 80,
      },
      state: {
        condition_last_trigger_at: {},
      },
      now: 5_000,
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      reason: 'upper_threshold',
      value: 88,
      threshold: 80,
    });
  });
});
