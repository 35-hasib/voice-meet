/**
 * Audio level analysis shared by the lobby's microphone meter and the room's
 * speaking indicators.
 *
 * One `AudioContext` is reference counted across every consumer in the page.
 * That is not a micro-optimisation: browsers cap how many contexts a document
 * may hold (low single digits on mobile), so a per-card context silently stops
 * being created once the cap is hit and the speaking glows disappear entirely.
 * Sharing also means one poll interval for the whole meeting rather than one per
 * participant.
 *
 * Nothing here touches the network. Levels are derived from streams the browser
 * already holds for playback, which is what lets the room work out who is
 * speaking without the server ever seeing audio.
 */

/** RMS above this counts as speech. Hysteresis against `SILENCE_RMS` stops flicker. */
export const SPEAKING_RMS = 0.06;

/** A stream has to fall this far below the speaking threshold to count as quiet. */
export const SILENCE_RMS = 0.03;

/**
 * RMS treated as a full-scale meter.
 *
 * Speech sits far below 1.0, so a linear bar would sit near empty for a normal
 * voice and only look responsive for someone shouting.
 */
export const METER_FULL_SCALE_RMS = 0.2;

/** Poll interval. Fast enough to catch the start of a word, slow enough to idle cheaply. */
export const LEVEL_POLL_INTERVAL_MS = 180;

/**
 * Per-analyser FFT size. Time-domain data only needs enough samples for a stable
 * RMS, and the read buffer is allocated at the same size, so the two are kept
 * together rather than as independent magic numbers in each caller.
 */
export const FFT_SIZE = 512;

let sharedContext: AudioContext | null = null;
let sharedContextUsers = 0;

type AudioContextWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

export function acquireAudioContext(): AudioContext | null {
  if (sharedContext === null) {
    const audioWindow = window as AudioContextWindow;
    const AudioContextConstructor =
      audioWindow.AudioContext ?? audioWindow.webkitAudioContext;

    if (AudioContextConstructor === undefined) {
      return null;
    }

    sharedContext = new AudioContextConstructor();
  }

  sharedContextUsers += 1;

  return sharedContext;
}

export function releaseAudioContext(): void {
  sharedContextUsers = Math.max(0, sharedContextUsers - 1);

  if (sharedContextUsers === 0 && sharedContext !== null) {
    const context = sharedContext;
    sharedContext = null;
    void context.close().catch(() => undefined);
  }
}

/**
 * Root mean square of a time-domain buffer, which tracks loudness perceptibly.
 *
 * The buffer is explicitly backed by an `ArrayBuffer` rather than the default
 * `ArrayBufferLike`: `getByteTimeDomainData` writes into it, and it refuses a
 * view that could be backed by shared memory, where writing is not permitted.
 */
export function readRms(
  analyser: AnalyserNode,
  samples: Uint8Array<ArrayBuffer>,
): number {
  analyser.getByteTimeDomainData(samples);

  let sum = 0;

  for (const sample of samples) {
    const normalized = (sample - 128) / 128;
    sum += normalized * normalized;
  }

  return Math.sqrt(sum / samples.length);
}

/** RMS mapped onto 0..1 for a meter, with a value above 1 meaning it clipped. */
export function toMeterLevel(rms: number): number {
  return Math.min(1, rms / METER_FULL_SCALE_RMS);
}

/**
 * Speaking state with hysteresis, so a card does not strobe between "speaking"
 * and "quiet" on the boundary of a single threshold.
 *
 * A new stream is judged on the entry threshold only; afterwards the previous
 * state decides which threshold applies.
 */
export function isSpeechLevel(
  rms: number,
  currentlySpeaking: boolean,
): boolean {
  return currentlySpeaking ? rms >= SILENCE_RMS : rms >= SPEAKING_RMS;
}
