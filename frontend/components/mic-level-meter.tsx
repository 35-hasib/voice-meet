"use client";

import { useEffect, useRef, useState } from "react";
import {
  acquireAudioContext,
  FFT_SIZE,
  LEVEL_POLL_INTERVAL_MS,
  readRms,
  releaseAudioContext,
  toMeterLevel,
} from "@/lib/audio-analysis";

/**
 * How long the level has to sit comfortably below full scale before the clipping
 * warning clears. Roughly a second at the poll interval, so a loud syllable does
 * not flip the label off during the gap between two words.
 */
const CLIP_HOLD_SAMPLES = 6;

/** Level must fall to here before a cleared warning will stay cleared. */
const CLIP_CLEAR_LEVEL = 0.85;

/**
 * Live input meter for the microphone preview.
 *
 * The lobby is for an audio product, and "Microphone ready" only proves that
 * `getUserMedia` resolved, not that anything is being captured. A user who is
 * too quiet, muted by the OS, or on a broken input cannot tell the difference
 * from this screen, and finds out after joining the call. A meter answers the
 * three questions that actually matter before they become a call problem: is
 * sound arriving, is it loud enough, and is it clipping.
 *
 * The preview element is deliberately muted, so this is the only feedback loop
 * available before joining.
 */
export function MicLevelMeter({
  stream,
  muted,
}: {
  stream: MediaStream;
  muted: boolean;
}): React.JSX.Element {
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const [clipping, setClipping] = useState(false);
  const peakRef = useRef(0);
  const levelRef = useRef(0);
  const clippingRef = useRef(false);
  const safeSamplesRef = useRef(0);

  useEffect(() => {
    const context = acquireAudioContext();

    if (context === null) {
      return;
    }

    let analyser: AnalyserNode;

    try {
      const source = context.createMediaStreamSource(stream);
      analyser = context.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
    } catch {
      releaseAudioContext();
      return;
    }

    const samples = new Uint8Array(FFT_SIZE);

    const interval = window.setInterval(() => {
      const rms = muted ? 0 : readRms(analyser, samples);
      const next = toMeterLevel(rms);

      // A gentle rise and a slow fall: an instant attack so the bar responds the
      // moment someone speaks, and a decay slow enough that a short word still
      // leaves a readable trace instead of vanishing between syllables.
      levelRef.current =
        next > levelRef.current ? next : levelRef.current * 0.82 + next * 0.18;
      setLevel(levelRef.current);

      if (next >= 1) {
        peakRef.current = 1;
        clippingRef.current = true;
        safeSamplesRef.current = 0;
      } else {
        peakRef.current = Math.max(next, peakRef.current - 0.012);

        // The warning has to clear on its own once the input is back in range.
        // Latching it meant a single loud syllable left the meter reading "Too
        // loud" for the rest of the session, after the user had already fixed the
        // gain — the least useful possible time to keep telling them about it.
        if (clippingRef.current) {
          safeSamplesRef.current += 1;

          if (next < CLIP_CLEAR_LEVEL && safeSamplesRef.current >= CLIP_HOLD_SAMPLES) {
            clippingRef.current = false;
            safeSamplesRef.current = 0;
          }
        }
      }

      setPeak(peakRef.current);
      setClipping(clippingRef.current);
    }, LEVEL_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
      analyser.disconnect();
      releaseAudioContext();
    };
  }, [muted, stream]);

  const percent = Math.round(Math.min(1, level) * 100);
  const peakPercent = Math.round(Math.min(1, peak) * 100);
  const quiet = level < 0.06;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-slate-300">Input level</span>
        <span
          className={`text-xs font-medium ${
            clipping
              ? "text-rose-300"
              : quiet
                ? "text-amber-200"
                : "text-emerald-300"
          }`}
        >
          {muted
            ? "Preview muted"
            : clipping
              ? "Too loud"
              : quiet
                ? "No signal"
                : "Detected"}
        </span>
      </div>

      <div
        className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-white/10"
        role="meter"
        aria-label="Microphone input level"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={
          muted
            ? "Preview muted"
            : clipping
              ? "Input level too loud"
              : quiet
                ? "No input signal detected"
                : `Input level ${percent.toString()} percent`
        }
      >
        <div
          data-testid="mic-level-fill"
          className={`h-full rounded-full transition-[width,background-color] duration-100 ${
            clipping ? "bg-rose-400" : quiet ? "bg-amber-300/70" : "bg-emerald-300"
          }`}
          style={{ width: `${percent.toString()}%` }}
        />
        {/*
          * Peak hold. Without it a clipped syllable is over before anyone can
          * read the bar, and "was that too loud?" goes unanswered.
        */}
        {peak > 0.02 && !clipping ? (
          <div
            className="absolute inset-y-0 w-0.5 bg-white/70"
            style={{ left: `calc(${peakPercent.toString()}% - 1px)` }}
          />
        ) : null}
      </div>

      {!muted && quiet ? (
        <p className="mt-1.5 text-xs text-amber-100/90">
          No sound yet. Say something, or check your input device.
        </p>
      ) : null}
    </div>
  );
}
