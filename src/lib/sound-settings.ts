export type SoundSettings = {
  restingBpm: number;
  reactionBpm: number;
  heartbeatVolume: number;
  voiceVolume: number;
  voiceName: 'Kore' | 'Puck';
};

export const defaultSoundSettings: SoundSettings = {
  restingBpm: 64,
  reactionBpm: 32,
  heartbeatVolume: 0.35,
  voiceVolume: 1,
  voiceName: 'Kore',
};

const key = 'tell.sound-settings.v1';
const clamp = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;

export function readSoundSettings(): SoundSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    return {
      restingBpm: clamp(saved.restingBpm, 64, 50, 90),
      reactionBpm: clamp(saved.reactionBpm, 32, 0, 40),
      heartbeatVolume: clamp(saved.heartbeatVolume, 0.35, 0, 1),
      voiceVolume: clamp(saved.voiceVolume, 1, 0, 1),
      voiceName: saved.voiceName === 'Puck' ? 'Puck' : 'Kore',
    };
  } catch {
    return defaultSoundSettings;
  }
}

export function saveSoundSettings(settings: SoundSettings) {
  try {
    localStorage.setItem(key, JSON.stringify(settings));
  } catch {
    /* optional preference */
  }
}
