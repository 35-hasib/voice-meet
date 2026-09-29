import { describe, expect, it } from "vitest";
import {
  FFT_SIZE,
  isSpeechLevel,
  METER_FULL_SCALE_RMS,
  readRms,
  SILENCE_RMS,
  SPEAKING_RMS,
  toMeterLevel,
} from "../lib/audio-analysis.js";

/**
 * Builds a byte time-domain buffer the way an `AnalyserNode` would, where 128 is
 * silence and larger deviations from it are louder.
 */
function timeDomainBuffer(amplitude: number): Uint8Array<ArrayBuffer> {
  const samples = new Uint8Array(FFT_SIZE);
  samples.fill(128);

  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.round(128 + amplitude * (index % 2 === 0 ? 1 : -1));
  }

  return samples;
}

describe("readRms", () => {
  it("reads silence as zero", () => {
    const analyser = {
      getByteTimeDomainData(target: Uint8Array<ArrayBuffer>): void {
        target.fill(128);
      },
    } as unknown as AnalyserNode;

    expect(readRms(analyser, new Uint8Array(FFT_SIZE))).toBe(0);
  });

  it("reads a full-scale square wave as near one", () => {
    const analyser = {
      getByteTimeDomainData(target: Uint8Array<ArrayBuffer>): void {
        target.set(timeDomainBuffer(127));
      },
    } as unknown as AnalyserNode;

    expect(readRms(analyser, new Uint8Array(FFT_SIZE))).toBeCloseTo(127 / 128, 2);
  });

  it("grows with loudness rather than clipping at the top", () => {
    const rmsAt = (amplitude: number): number => {
      const analyser = {
        getByteTimeDomainData(target: Uint8Array<ArrayBuffer>): void {
          target.set(timeDomainBuffer(amplitude));
        },
      } as unknown as AnalyserNode;

      return readRms(analyser, new Uint8Array(FFT_SIZE));
    };

    const quiet = rmsAt(8);
    const loud = rmsAt(64);

    expect(quiet).toBeGreaterThan(0);
    expect(loud).toBeGreaterThan(quiet);
    expect(loud).toBeLessThanOrEqual(1);
  });
});

describe("toMeterLevel", () => {
  it("maps silence and full scale onto the ends of the meter", () => {
    expect(toMeterLevel(0)).toBe(0);
    expect(toMeterLevel(METER_FULL_SCALE_RMS)).toBe(1);
  });

  it("never exceeds full scale", () => {
    expect(toMeterLevel(METER_FULL_SCALE_RMS * 4)).toBe(1);
  });

  it("puts ordinary speech well up the bar instead of near empty", () => {
    // Speech sits far below full scale, so a linear mapping left the meter almost
    // flat for a normal talking voice. This is the regression the scale exists
    // to prevent.
    expect(toMeterLevel(SPEAKING_RMS)).toBeGreaterThan(0.25);
    expect(toMeterLevel(SPEAKING_RMS)).toBeLessThan(1);
  });
});

describe("isSpeechLevel", () => {
  it("uses the entry threshold when the participant was quiet", () => {
    expect(isSpeechLevel(SPEAKING_RMS, false)).toBe(true);
    expect(isSpeechLevel(SPEAKING_RMS - 0.001, false)).toBe(false);
  });

  it("keeps a speaker active until they drop well below the entry threshold", () => {
    // Without hysteresis a card strobed between lit and unlit on the boundary of
    // a single threshold, which is exactly what the gap is for.
    expect(isSpeechLevel(SPEAKING_RMS - 0.01, true)).toBe(true);
    expect(isSpeechLevel(SILENCE_RMS, true)).toBe(true);
    expect(isSpeechLevel(SILENCE_RMS - 0.001, true)).toBe(false);
  });

  it("has a gap between the two thresholds for the hysteresis to live in", () => {
    expect(SILENCE_RMS).toBeLessThan(SPEAKING_RMS);
  });
});
