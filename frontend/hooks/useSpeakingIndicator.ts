"use client";

import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 180;
const SPEAKING_THRESHOLD = 0.06;
const SILENT_THRESHOLD = 0.03;

type AudioContextWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

interface SpeakingState {
  streamKey: string | null;
  isSpeaking: boolean;
}

/**
 * One AudioContext shared by every card, reference counted.
 *
 * A per-card context looks harmless but browsers cap the number a page may hold
 * (low single digits on mobile), so past a handful of participants the analysers
 * would silently stop being created and the speaking glow would disappear
 * entirely. Sharing also avoids a burst of contexts on join and leave, which is
 * what drains battery on low-end Android.
 */
let sharedContext: AudioContext | null = null;
let sharedContextUsers = 0;

function acquireAudioContext(): AudioContext | null {
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

function releaseAudioContext(): void {
  sharedContextUsers = Math.max(0, sharedContextUsers - 1);

  // Close once the last card lets go, so an empty meeting holds no audio hardware.
  if (sharedContextUsers === 0 && sharedContext !== null) {
    const context = sharedContext;
    sharedContext = null;
    void context.close().catch(() => undefined);
  }
}

export function useSpeakingIndicator(
  stream: MediaStream | null,
  enabled = true,
): boolean {
  const streamKey = enabled && stream !== null ? stream.id : null;
  const [state, setState] = useState<SpeakingState>({
    streamKey: null,
    isSpeaking: false,
  });

  useEffect(() => {
    if (streamKey === null || stream === null) {
      return;
    }

    const context = acquireAudioContext();

    if (context === null) {
      return;
    }

    let interval: number | null = null;

    try {
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);

      interval = window.setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;

        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          sum += normalized * normalized;
        }

        const level = Math.sqrt(sum / samples.length);

        setState((current) => {
          const isNewStream = current.streamKey !== streamKey;
          const isSpeaking = isNewStream
            ? level >= SPEAKING_THRESHOLD
            : level >= (current.isSpeaking ? SILENT_THRESHOLD : SPEAKING_THRESHOLD);

          if (!isNewStream && current.isSpeaking === isSpeaking) {
            return current;
          }

          return { streamKey, isSpeaking };
        });
      }, POLL_INTERVAL_MS);
    } catch {
      interval = null;
    }

    return () => {
      if (interval !== null) {
        window.clearInterval(interval);
      }

      releaseAudioContext();
    };
  }, [stream, streamKey]);

  return streamKey !== null && state.streamKey === streamKey && state.isSpeaking;
}
