"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  acquireAudioContext,
  FFT_SIZE,
  isSpeechLevel,
  LEVEL_POLL_INTERVAL_MS,
  readRms,
  releaseAudioContext,
  toMeterLevel,
} from "@/lib/audio-analysis";

/** A stream as it appears to the room: absent until its track arrives. */
export interface AudioLevelReading {
  /** 0..1 for a meter, where 1 is full scale. */
  level: number;
  speaking: boolean;
}

export interface RoomAudioLevels {
  /** Keyed by the same identifiers the caller passed in. */
  readings: ReadonlyMap<string, AudioLevelReading>;
  /**
   * The loudest current speaker, or null when nobody is speaking.
   *
   * Sticky: when the room falls silent the previous winner is retained so a
   * promoted card does not flicker back to neutral on every pause between words.
   */
  loudestParticipantId: string | null;
}

/**
 * Speaking state for every stream in the room, plus the loudest speaker.
 *
 * One hook for all streams rather than one per card, for two reasons:
 *
 * - "Who is speaking?" is a question about the room, not about a card, so the
 *   comparison has to happen somewhere that can see every stream at once. With
 *   per-card analysis each card only knew about itself, which is why the active
 *   speaker could not be promoted.
 * - One poll loop and one shared `AudioContext` instead of one of each per
 *   participant, which is what keeps a dozen-person room viable on a phone.
 *
 * Nothing leaves the browser. Levels come from streams that are already being
 * played back locally, so the server still never sees audio.
 */
export function useRoomAudioLevels(
  streams: ReadonlyMap<string, MediaStream | null>,
  muted: ReadonlySet<string>,
): RoomAudioLevels {
  const [readings, setReadings] = useState<ReadonlyMap<string, AudioLevelReading>>(
    () => new Map(),
  );
  const [loudestParticipantId, setLoudestParticipantId] = useState<string | null>(
    null,
  );

  // Read inside the interval so a mute change lands on the next tick instead of
  // tearing down every analyser and restarting the poll. Written in an effect
  // rather than during render: a ref is not render state, and mutating one while
  // rendering is what the React compiler rules exist to prevent.
  const streamsRef = useRef(streams);
  const mutedRef = useRef(muted);
  const loudestRef = useRef<string | null>(null);

  useEffect(() => {
    streamsRef.current = streams;
    mutedRef.current = muted;
  }, [muted, streams]);

  /**
   * Identity of the analysable set, as a string.
   *
   * The effect must re-run when a stream is added, removed, or replaced. Keying
   * on the Map itself would do that too, but a parent that rebuilds the Map each
   * render would then restart the analysers on every tick. `MediaStream.id` is
   * stable for a given track, so this captures real changes and nothing else.
   */
  const signature = useMemo(
    () =>
      [...streams.entries()]
        .map(([id, stream]) => `${id}:${stream?.id ?? "none"}`)
        .sort()
        .join("|"),
    [streams],
  );

  useEffect(() => {
    const active = [...streamsRef.current.entries()].filter(
      (entry): entry is [string, MediaStream] => entry[1] !== null,
    );

    if (active.length === 0) {
      setReadings(new Map());
      // Everyone has left, so there is no previous speaker to hold on to. Keeping
      // the stale winner would promote a card for a participant who is no longer
      // in the room.
      loudestRef.current = null;
      setLoudestParticipantId(null);
      return;
    }

    const context = acquireAudioContext();

    if (context === null) {
      return;
    }

    const analysers = new Map<string, AnalyserNode>();

    for (const [participantId, stream] of active) {
      try {
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        analysers.set(participantId, analyser);
      } catch {
        // A stream that cannot be analysed (ended, or owned by another context)
        // is left out and simply reports silence, rather than taking down every
        // other participant's meter with it.
      }
    }

    if (analysers.size === 0) {
      releaseAudioContext();
      return;
    }

    const samples = new Uint8Array(FFT_SIZE);
    const speaking = new Map<string, boolean>();

    const interval = window.setInterval(() => {
      const next = new Map<string, AudioLevelReading>();
      let loudestId: string | null = null;
      let loudestRms = 0;

      for (const [participantId, analyser] of analysers) {
        if (mutedRef.current.has(participantId)) {
          next.set(participantId, { level: 0, speaking: false });
          speaking.set(participantId, false);
          continue;
        }

        const rms = readRms(analyser, samples);
        const isSpeaking = isSpeechLevel(rms, speaking.get(participantId) ?? false);
        speaking.set(participantId, isSpeaking);

        next.set(participantId, { level: toMeterLevel(rms), speaking: isSpeaking });

        if (isSpeaking && rms > loudestRms) {
          loudestRms = rms;
          loudestId = participantId;
        }
      }

      setReadings(next);

      // Retaining the previous winner is what stops a promoted card from
      // flickering back to neutral on the pause between two words.
      if (loudestId !== null) {
        loudestRef.current = loudestId;
      }

      if (loudestRef.current !== null) {
        setLoudestParticipantId(loudestRef.current);
      }
    }, LEVEL_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);

      for (const analyser of analysers.values()) {
        analyser.disconnect();
      }

      releaseAudioContext();
    };
  }, [signature]);

  return { readings, loudestParticipantId };
}
