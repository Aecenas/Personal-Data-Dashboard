export const INTERACTION_SOUND_EVENTS = [
  'ui.tap',
  'nav.switch',
  'toggle.change',
  'modal.open',
  'modal.close',
  'card.move',
  'card.blocked',
  'refresh.trigger',
  'action.success',
  'action.destructive',
  'action.error',
] as const;

export type InteractionSoundEvent = (typeof INTERACTION_SOUND_EVENTS)[number];

interface ToneRecipe {
  type: OscillatorType;
  startHz: number;
  endHz: number;
  durationMs: number;
  delayMs?: number;
  gainScale?: number;
  attackMs?: number;
  releaseMs?: number;
}

interface NoiseRecipe {
  durationMs: number;
  delayMs?: number;
  centerHz: number;
  q?: number;
  gainScale?: number;
  attackMs?: number;
  releaseMs?: number;
  highpassHz?: number;
}

interface SoundRecipe {
  throttleMs: number;
  tones: ToneRecipe[];
  noise?: NoiseRecipe;
}

const MAX_CONCURRENT_VOICES = 4;
const DEFAULT_VOLUME = 65;

const interactionSoundEventSet = new Set<string>(INTERACTION_SOUND_EVENTS as readonly string[]);

export const isInteractionSoundEvent = (value: string): value is InteractionSoundEvent =>
  interactionSoundEventSet.has(value);

export const clampInteractionSoundVolume = (value: unknown, fallback = DEFAULT_VOLUME): number => {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, parsed));
};

export const volumeToMasterGain = (volume: number): number => {
  const normalized = clampInteractionSoundVolume(volume) / 100;
  return 0.03 + Math.pow(normalized, 1.15) * 0.22;
};

export const interactionSoundRecipes: Readonly<Record<InteractionSoundEvent, SoundRecipe>> = {
  'ui.tap': {
    throttleMs: 80,
    tones: [{ type: 'sine', startHz: 1200, endHz: 900, durationMs: 120, attackMs: 6, releaseMs: 110, gainScale: 0.9 }],
  },
  'nav.switch': {
    throttleMs: 100,
    tones: [{ type: 'triangle', startHz: 700, endHz: 980, durationMs: 180, attackMs: 10, releaseMs: 160, gainScale: 0.95 }],
  },
  'toggle.change': {
    throttleMs: 90,
    tones: [{ type: 'square', startHz: 950, endHz: 760, durationMs: 140, attackMs: 4, releaseMs: 120, gainScale: 0.6 }],
  },
  'modal.open': {
    throttleMs: 100,
    tones: [
      { type: 'sine', startHz: 520, endHz: 650, durationMs: 150, attackMs: 10, releaseMs: 120, gainScale: 0.7 },
      { type: 'sine', startHz: 650, endHz: 780, durationMs: 160, delayMs: 90, attackMs: 10, releaseMs: 130, gainScale: 0.75 },
    ],
  },
  'modal.close': {
    throttleMs: 100,
    tones: [
      { type: 'sine', startHz: 760, endHz: 620, durationMs: 130, attackMs: 8, releaseMs: 110, gainScale: 0.66 },
      { type: 'sine', startHz: 620, endHz: 520, durationMs: 140, delayMs: 80, attackMs: 8, releaseMs: 120, gainScale: 0.66 },
    ],
  },
  'card.move': {
    throttleMs: 60,
    tones: [{ type: 'sine', startHz: 860, endHz: 740, durationMs: 90, attackMs: 4, releaseMs: 80, gainScale: 0.85 }],
  },
  'card.blocked': {
    throttleMs: 120,
    tones: [{ type: 'triangle', startHz: 260, endHz: 180, durationMs: 200, attackMs: 6, releaseMs: 175, gainScale: 0.95 }],
    noise: {
      durationMs: 120,
      delayMs: 20,
      centerHz: 420,
      highpassHz: 180,
      q: 1.1,
      gainScale: 0.25,
      attackMs: 4,
      releaseMs: 95,
    },
  },
  'refresh.trigger': {
    throttleMs: 120,
    tones: [{ type: 'sine', startHz: 480, endHz: 620, durationMs: 330, delayMs: 80, attackMs: 14, releaseMs: 300, gainScale: 0.65 }],
    noise: {
      durationMs: 260,
      centerHz: 1000,
      q: 0.8,
      gainScale: 0.2,
      attackMs: 10,
      releaseMs: 240,
    },
  },
  'action.success': {
    throttleMs: 110,
    tones: [
      { type: 'sine', startHz: 660, endHz: 820, durationMs: 220, attackMs: 10, releaseMs: 180, gainScale: 0.75 },
      { type: 'sine', startHz: 840, endHz: 990, durationMs: 260, delayMs: 180, attackMs: 10, releaseMs: 220, gainScale: 0.85 },
    ],
  },
  'action.destructive': {
    throttleMs: 120,
    tones: [{ type: 'triangle', startHz: 420, endHz: 250, durationMs: 350, attackMs: 10, releaseMs: 320, gainScale: 0.8 }],
  },
  'action.error': {
    throttleMs: 120,
    tones: [
      { type: 'sawtooth', startHz: 520, endHz: 420, durationMs: 120, attackMs: 6, releaseMs: 100, gainScale: 0.55 },
      { type: 'sawtooth', startHz: 500, endHz: 400, durationMs: 130, delayMs: 170, attackMs: 6, releaseMs: 110, gainScale: 0.55 },
    ],
  },
};

const getRecipeDurationMs = (recipe: SoundRecipe): number => {
  const toneDuration = recipe.tones.reduce((max, tone) => Math.max(max, (tone.delayMs ?? 0) + tone.durationMs), 0);
  const noiseDuration = recipe.noise
    ? (recipe.noise.delayMs ?? 0) + recipe.noise.durationMs
    : 0;
  return Math.max(toneDuration, noiseDuration);
};

const createNoiseBuffer = (context: AudioContext, durationMs: number): AudioBuffer => {
  const frameCount = Math.max(1, Math.floor((durationMs / 1000) * context.sampleRate));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i += 1) {
    channelData[i] = Math.random() * 2 - 1;
  }
  return buffer;
};

const scheduleTone = (
  context: AudioContext,
  destination: AudioDestinationNode,
  baseStartTime: number,
  masterGain: number,
  tone: ToneRecipe,
) => {
  const startTime = baseStartTime + (tone.delayMs ?? 0) / 1000;
  const durationSec = tone.durationMs / 1000;
  const attackSec = Math.max(0.001, (tone.attackMs ?? 8) / 1000);
  const releaseSec = Math.max(0.001, (tone.releaseMs ?? tone.durationMs - 8) / 1000);
  const endTime = startTime + durationSec;
  const releaseStartTime = Math.max(startTime + attackSec, endTime - releaseSec);
  const targetGain = Math.max(0.0001, masterGain * (tone.gainScale ?? 1));

  const oscillator = context.createOscillator();
  oscillator.type = tone.type;
  oscillator.frequency.setValueAtTime(tone.startHz, startTime);
  oscillator.frequency.linearRampToValueAtTime(tone.endHz, endTime);

  const gainNode = context.createGain();
  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.linearRampToValueAtTime(targetGain, startTime + attackSec);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, Math.max(releaseStartTime + 0.005, endTime));

  oscillator.connect(gainNode);
  gainNode.connect(destination);

  oscillator.start(startTime);
  oscillator.stop(endTime + 0.01);
};

const scheduleNoise = (
  context: AudioContext,
  destination: AudioDestinationNode,
  baseStartTime: number,
  masterGain: number,
  recipe: NoiseRecipe,
) => {
  const startTime = baseStartTime + (recipe.delayMs ?? 0) / 1000;
  const durationSec = recipe.durationMs / 1000;
  const attackSec = Math.max(0.001, (recipe.attackMs ?? 10) / 1000);
  const releaseSec = Math.max(0.001, (recipe.releaseMs ?? recipe.durationMs - 12) / 1000);
  const endTime = startTime + durationSec;
  const releaseStartTime = Math.max(startTime + attackSec, endTime - releaseSec);
  const targetGain = Math.max(0.0001, masterGain * (recipe.gainScale ?? 1));

  const source = context.createBufferSource();
  source.buffer = createNoiseBuffer(context, recipe.durationMs);

  const highpassFilter = context.createBiquadFilter();
  highpassFilter.type = 'highpass';
  highpassFilter.frequency.value = recipe.highpassHz ?? 120;

  const bandpassFilter = context.createBiquadFilter();
  bandpassFilter.type = 'bandpass';
  bandpassFilter.frequency.value = recipe.centerHz;
  bandpassFilter.Q.value = recipe.q ?? 0.9;

  const gainNode = context.createGain();
  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.linearRampToValueAtTime(targetGain, startTime + attackSec);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, Math.max(releaseStartTime + 0.005, endTime));

  source.connect(highpassFilter);
  highpassFilter.connect(bandpassFilter);
  bandpassFilter.connect(gainNode);
  gainNode.connect(destination);

  source.start(startTime);
  source.stop(endTime + 0.01);
};

const scheduleRecipeWithWebAudio = (context: AudioContext, recipe: SoundRecipe, masterGain: number): number => {
  const startTime = context.currentTime + 0.005;
  const destination = context.destination;

  recipe.tones.forEach((tone) => {
    scheduleTone(context, destination, startTime, masterGain, tone);
  });

  if (recipe.noise) {
    scheduleNoise(context, destination, startTime, masterGain, recipe.noise);
  }

  return getRecipeDurationMs(recipe);
};

interface InteractionSoundServiceDependencies {
  now: () => number;
  scheduleRecipe: (context: AudioContext, recipe: SoundRecipe, masterGain: number) => number;
  warn: (...args: unknown[]) => void;
  createAudioContext: () => AudioContext | null;
}

const createDefaultAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  const ContextCtor = (window as typeof window & { webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!ContextCtor) return null;
  return new ContextCtor();
};

export interface InteractionSoundService {
  initializeIfNeeded: () => boolean;
  setEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  play: (event: InteractionSoundEvent) => boolean;
}

export const createInteractionSoundService = (
  partialDeps: Partial<InteractionSoundServiceDependencies> = {},
): InteractionSoundService => {
  const deps: InteractionSoundServiceDependencies = {
    now: partialDeps.now ?? (() => Date.now()),
    scheduleRecipe: partialDeps.scheduleRecipe ?? scheduleRecipeWithWebAudio,
    warn: partialDeps.warn ?? ((...args) => console.warn(...args)),
    createAudioContext: partialDeps.createAudioContext ?? createDefaultAudioContext,
  };

  let enabled = true;
  let volume = DEFAULT_VOLUME;
  let context: AudioContext | null = null;
  let warnedUnsupported = false;
  let activeVoiceExpiresAt: number[] = [];
  const lastPlayedAt = new Map<InteractionSoundEvent, number>();

  const initializeIfNeeded = (): boolean => {
    if (context) {
      if (context.state === 'closed') {
        context = null;
      } else if (context.state !== 'running') {
        void context.resume().catch(() => undefined);
        return false;
      } else {
        return true;
      }
    }

    const created = deps.createAudioContext();
    if (!created) {
      if (!warnedUnsupported) {
        warnedUnsupported = true;
        deps.warn('[interaction-sound] Web Audio API is unavailable, sound feedback is disabled.');
      }
      return false;
    }

    context = created;
    if (context.state !== 'running') {
      void context.resume().catch(() => undefined);
      return false;
    }
    return true;
  };

  const setEnabled = (nextEnabled: boolean) => {
    enabled = Boolean(nextEnabled);
  };

  const setVolume = (nextVolume: number) => {
    volume = clampInteractionSoundVolume(nextVolume);
  };

  const purgeExpiredVoices = (now: number) => {
    activeVoiceExpiresAt = activeVoiceExpiresAt.filter((expiresAt) => expiresAt > now);
  };

  const play = (event: InteractionSoundEvent): boolean => {
    if (!enabled) return false;

    const recipe = interactionSoundRecipes[event];
    const now = deps.now();
    purgeExpiredVoices(now);
    if (activeVoiceExpiresAt.length >= MAX_CONCURRENT_VOICES) return false;

    if (!initializeIfNeeded() || !context) return false;

    const lastTime = lastPlayedAt.get(event) ?? -Infinity;
    if (now - lastTime < recipe.throttleMs) return false;

    const masterGain = volumeToMasterGain(volume);
    try {
      const durationMs = deps.scheduleRecipe(context, recipe, masterGain);
      lastPlayedAt.set(event, now);
      activeVoiceExpiresAt.push(now + Math.max(80, durationMs + 40));
      return true;
    } catch (error) {
      deps.warn('[interaction-sound] Failed to play sound event:', event, error);
      return false;
    }
  };

  return {
    initializeIfNeeded,
    setEnabled,
    setVolume,
    play,
  };
};

export const interactionSoundService = createInteractionSoundService();
