import { describe, expect, it, vi } from 'vitest';
import {
  clampInteractionSoundVolume,
  createInteractionSoundService,
  interactionSoundRecipes,
  INTERACTION_SOUND_EVENTS,
  volumeToMasterGain,
} from './interaction-sound';

const createFakeAudioContext = () => ({ state: 'running' } as unknown as AudioContext);

describe('interaction sound service', () => {
  it('contains recipes for all declared sound events', () => {
    INTERACTION_SOUND_EVENTS.forEach((event) => {
      expect(interactionSoundRecipes[event]).toBeDefined();
    });
  });

  it('does not play when disabled', () => {
    const scheduleSpy = vi.fn(() => 120);
    const service = createInteractionSoundService({
      createAudioContext: createFakeAudioContext,
      scheduleRecipe: scheduleSpy,
    });

    service.setEnabled(false);
    const played = service.play('ui.tap');

    expect(played).toBe(false);
    expect(scheduleSpy).not.toHaveBeenCalled();
  });

  it('throttles the same event within the recipe throttle window', () => {
    let now = 1_000;
    const scheduleSpy = vi.fn(() => 100);
    const service = createInteractionSoundService({
      now: () => now,
      createAudioContext: createFakeAudioContext,
      scheduleRecipe: scheduleSpy,
    });

    const first = service.play('card.move');
    const second = service.play('card.move');
    now += interactionSoundRecipes['card.move'].throttleMs + 1;
    const third = service.play('card.move');

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(third).toBe(true);
    expect(scheduleSpy).toHaveBeenCalledTimes(2);
  });

  it('passes higher gain when volume is larger', () => {
    let now = 10_000;
    const gainValues: number[] = [];
    const service = createInteractionSoundService({
      now: () => now,
      createAudioContext: createFakeAudioContext,
      scheduleRecipe: (_context, _recipe, masterGain) => {
        gainValues.push(masterGain);
        return 120;
      },
    });

    service.setVolume(0);
    const first = service.play('action.success');
    now += interactionSoundRecipes['action.success'].throttleMs + 1;
    service.setVolume(100);
    const second = service.play('action.success');

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(gainValues).toHaveLength(2);
    expect(gainValues[1]).toBeGreaterThan(gainValues[0]);
  });

  it('queues the first event while audio context is resuming and replays after resume', async () => {
    let currentState: 'suspended' | 'running' = 'suspended';
    const resumeSpy = vi.fn(async () => {
      currentState = 'running';
    });
    const context = {
      get state() {
        return currentState;
      },
      resume: resumeSpy,
    } as unknown as AudioContext;
    const scheduleSpy = vi.fn((_context: AudioContext, _recipe: unknown, _masterGain: number) => 120);

    const service = createInteractionSoundService({
      createAudioContext: () => context,
      scheduleRecipe: scheduleSpy,
    });

    const played = service.play('action.success');
    expect(played).toBeTypeOf('boolean');
    if (!played) {
      expect(scheduleSpy).toHaveBeenCalledTimes(0);
    }

    await Promise.resolve();
    await Promise.resolve();

    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
    expect(scheduleSpy.mock.calls[0]?.[1]).toBe(interactionSoundRecipes['action.success']);
  });
});

describe('interaction sound helpers', () => {
  it('clamps interaction sound volume', () => {
    expect(clampInteractionSoundVolume(-1)).toBe(0);
    expect(clampInteractionSoundVolume(999)).toBe(100);
    expect(clampInteractionSoundVolume('bad')).toBe(65);
  });

  it('maps volume to an increasing gain curve', () => {
    expect(volumeToMasterGain(100)).toBeGreaterThan(volumeToMasterGain(40));
  });
});
