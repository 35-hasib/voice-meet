"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AlertBanner } from "@/components/alert-banner";
import { BrandMark } from "@/components/brand-mark";
import { MeetingRoom } from "@/components/meeting-room";
import { MicLevelMeter } from "@/components/mic-level-meter";
import { StatusScreen } from "@/components/status-screen";
import { useMeetingLookup } from "@/hooks/useMeetingLookup";
import { useMeetingJoin } from "@/hooks/useMeetingJoin";
import { useMicrophone } from "@/hooks/useMicrophone";
import {
  getStoredDisplayNameServerSnapshot,
  readStoredDisplayName,
  subscribeToStoredDisplayName,
} from "@/lib/display-name-storage";
import {
  queryMicrophonePermission,
  type MicrophonePermissionState,
} from "@/lib/microphone-permission";
import {
  ArrowRight,
  ArrowUpRight,
  Headphones,
  LoaderCircle,
  LockKeyhole,
  Mic,
  MicOff,
  ShieldCheck,
  UserRound,
  AudioWaveform,
} from "lucide-react";
import {
  extractMeetingCode,
  MAX_DISPLAY_NAME_CHARACTERS,
  normalizeDisplayName,
} from "@/lib/validation";

function WaitingScreen({ message }: { message: string }): React.JSX.Element {
  return (
    <main className="app-shell safe-gutter bg-slate-950">
      <div className="app-shell-body flex items-center justify-center">
        <div
          className="flex flex-col items-center gap-3 text-slate-300"
          /*
           * Announced rather than decorative. A lookup that takes a moment is
           * invisible to a screen-reader user otherwise, and the alternative is a
           * blank screen with no indication anything is happening.
           */
          role="status"
          aria-live="polite"
        >
          <LoaderCircle aria-hidden="true" className="size-7 animate-spin text-cyan-300" />
          <p className="text-sm">{message}</p>
        </div>
      </div>
    </main>
  );
}

export function MeetingLobby({
  meetingCode,
}: {
  meetingCode: string;
}): React.JSX.Element {
  const normalizedCode = extractMeetingCode(meetingCode);
  const lookup = useMeetingLookup(normalizedCode);
  const microphone = useMicrophone();
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const { roomStream, roomName, isJoining, formError, join, clearError, showError, leaveRoom } =
    useMeetingJoin(microphone);

  /*
   * A preview is muted by default and only unmuted on request. Unmuting it
   * unconditionally would play the user's own voice back at them through the
   * speakers, which on a laptop is an instant feedback loop.
   */
  const [previewAudible, setPreviewAudible] = useState(false);

  // A remembered name is read through the store rather than into state so the
  // server-rendered empty input stays valid HTML and the stored name simply
  // appears once the client takes over. `null` means "the user has not touched
  // the field", which is what keeps the remembered name as the default instead
  // of snapping back to it after the user clears their own typing.
  const storedName = useSyncExternalStore(
    subscribeToStoredDisplayName,
    readStoredDisplayName,
    getStoredDisplayNameServerSnapshot,
  );
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const displayName = nameDraft ?? storedName;

  const [microphonePermission, setMicrophonePermission] =
    useState<MicrophonePermissionState | null>(null);
  const [autoJoinFailed, setAutoJoinFailed] = useState(false);
  const autoJoinRef = useRef(false);

  useEffect(() => {
    const audio = previewRef.current;

    if (audio === null || microphone.stream === null) {
      return;
    }

    audio.srcObject = microphone.stream;
    void audio.play().catch(() => undefined);
  }, [microphone.stream]);

  useEffect(() => {
    let active = true;

    void queryMicrophonePermission().then((permission) => {
      if (active) {
        setMicrophonePermission(permission);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  /**
   * A rejection the server will accept on a later attempt comes back out of the
   * room, because the cap is checked when the socket join is acknowledged, which
   * is after the lobby has already handed over the stream. The room is torn down
   * here so the message lands on the form, next to the Join button that can
   * actually retry it.
   *
   * Wrapped in `useCallback` because it is a dependency of the signalling start
   * callback: a fresh function on every render would re-run the join effect on
   * every render, tearing the connection down as fast as it came up.
   */
  const handleJoinRejected = useCallback(
    (message: string): void => {
      setAutoJoinFailed(true);
      showError(message);
      leaveRoom();
    },
    [leaveRoom, showError],
  );

  // Joins straight in when there is a name to reuse and the browser will hand
  // over the microphone without prompting. The guard makes this a one-shot per
  // visit, so leaving the room returns the user to the lobby rather than
  // pulling them straight back in.
  useEffect(() => {
    if (autoJoinRef.current) {
      return;
    }

    if (
      lookup.status !== "ready" ||
      normalizedCode === null ||
      roomStream !== null ||
      microphonePermission !== "granted"
    ) {
      return;
    }

    const name = normalizeDisplayName(storedName);

    if (name.length === 0) {
      return;
    }

    autoJoinRef.current = true;
    void join(name).then((joined) => {
      // A failed automatic join has to hand control back, otherwise the waiting
      // screen would sit there forever with the microphone error behind it.
      if (!joined) {
        setAutoJoinFailed(true);
      }
    });
  }, [
    join,
    lookup.status,
    microphonePermission,
    normalizedCode,
    roomStream,
    storedName,
  ]);

  // Dropping the draft on the way out hands the field back to the remembered
  // name, which is the normalized value that was actually accepted when
  // joining, instead of the raw text that was typed.
  const handleLeftRoom = (): void => {
    setNameDraft(null);
    clearError();
    leaveRoom();
  };

  if (normalizedCode === null) {
    return (
      <StatusScreen
        title="Meeting not found"
        message="Sorry, this meeting doesn't exist. Check the link and try again."
        primaryAction={{ label: "Back to home", href: "/" }}
      />
    );
  }

  if (lookup.status === "loading") {
    return <WaitingScreen message="Looking up this meeting…" />;
  }

  if (lookup.status === "not-found") {
    return (
      <StatusScreen
        title="Meeting not found"
        message="Sorry, this meeting doesn't exist. Check the link and try again."
        primaryAction={{ label: "Back to home", href: "/" }}
      />
    );
  }

  if (lookup.status === "closed") {
    return (
      <StatusScreen
        title="Meeting closed"
        message="This meeting has been closed."
        tone="warning"
        icon={LockKeyhole}
        primaryAction={{ label: "Back to home", href: "/" }}
      />
    );
  }

  if (lookup.status === "error") {
    return (
      <StatusScreen
        title="Unable to connect"
        message={lookup.error ?? "Unable to connect to the server."}
        primaryAction={{ label: "Back to home", href: "/" }}
        secondaryAction={{ label: "Try again", onClick: lookup.retry }}
      />
    );
  }

  if (roomStream !== null && normalizedCode !== null) {
    return (
      <MeetingRoom
        meetingCode={normalizedCode}
        displayName={roomName}
        stream={roomStream}
        onLeft={handleLeftRoom}
        onJoinRejected={handleJoinRejected}
      />
    );
  }

  // The form is only reachable once the user is definitely going to have to
  // press Join. Showing it while an automatic join is still in flight is what
  // produced the flash of a name prompt for people who never needed to see it.
  // A pending permission query counts as still-deciding, so a slow answer
  // cannot reveal the form either. First-time visitors are unaffected: with no
  // stored name there is nothing to auto-join with, so the form appears as soon
  // as the lookup does.
  const automaticJoinPending =
    !autoJoinFailed &&
    normalizeDisplayName(storedName).length > 0 &&
    (microphonePermission === null || microphonePermission === "granted");

  if (automaticJoinPending) {
    return <WaitingScreen message="Joining the meeting…" />;
  }

  return (
    <div className="app-shell relative bg-slate-950" data-testid="join-shell">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(34,211,238,0.14),transparent_32%),radial-gradient(circle_at_85%_20%,rgba(168,85,247,0.12),transparent_28%)]"
      />

      <header className="safe-top safe-gutter relative z-10 shrink-0 border-b border-white/8 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-13 w-full max-w-5xl items-center justify-between gap-3 sm:h-14">
          <BrandMark compact />
          <span className="min-w-0 truncate rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-slate-300">
            {normalizedCode}
          </span>
        </div>
      </header>

      {/*
        * The card is centred with `my-auto` rather than by centring the scroll
        * container. `justify-center` on an overflowing flex container pushes the
        * start edge past the scroll origin, where it becomes unreachable in Chrome
        * and Safari — the same trap documented in lib/participant-layout.ts. The
        * auto margins centre when there is room and collapse to zero when there
        * is not, so the top of the form always stays scrollable into view.
        */}
      <main className="app-shell-body safe-gutter relative z-10 flex overflow-hidden">
        <div className="contained-scroll mx-auto flex w-full max-w-lg flex-col py-3">
          <div className="my-auto w-full rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-6">
            <div className="text-center">
              <div className="mx-auto grid size-11 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                <AudioWaveform aria-hidden="true" className="size-5" />
              </div>
              <h1 className="mt-3 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                Join audio meeting
              </h1>
              <p className="mt-1.5 text-sm leading-6 text-slate-400">
                Choose a name and join. No account needed.
              </p>
            </div>

            <div className="mt-4 space-y-3.5">
              <div>
                <label
                  htmlFor="display-name"
                  className="flex items-center justify-between gap-3 text-sm font-medium text-slate-200"
                >
                  <span className="inline-flex items-center gap-2">
                    <UserRound aria-hidden="true" className="size-4 text-cyan-300" />
                    Your name
                  </span>
                  <span className="text-xs font-normal text-slate-400">
                    {displayName.length}/{MAX_DISPLAY_NAME_CHARACTERS}
                  </span>
                </label>
                <input
                  id="display-name"
                  value={displayName}
                  onChange={(event) => {
                    setNameDraft(event.target.value);
                    clearError();
                  }}
                  onBlur={() => {
                    setNameDraft(normalizeDisplayName(displayName));
                  }}
                  maxLength={MAX_DISPLAY_NAME_CHARACTERS * 2}
                  autoComplete="name"
                  placeholder="Hasib"
                  className="mt-1.5 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-300/10"
                />
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="flex items-start gap-2.5">
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                      microphone.status === "ready"
                        ? "bg-emerald-300/10 text-emerald-200"
                        : "bg-white/5 text-slate-400"
                    }`}
                  >
                    {microphone.status === "ready" ? (
                      <Mic aria-hidden="true" className="size-4" />
                    ) : (
                      <MicOff aria-hidden="true" className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">
                      {microphone.status === "ready"
                        ? "Microphone ready"
                        : "Check your microphone"}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-400">
                      {microphone.status === "ready"
                        ? microphone.isMuted
                          ? "Your microphone is muted. You can unmute after joining."
                          : "Audio stays local until you join and speak."
                        : "Your browser will ask for permission. No audio is recorded or stored."}
                    </p>
                  </div>
                </div>

                {/*
                  * The meter. "Microphone ready" only proved that getUserMedia
                  * resolved, not that anything was being captured, and the preview
                  * is muted, so a broken or too-quiet input was invisible until the
                  * user was already in the call.
                  */}
                {microphone.stream !== null ? (
                  <MicLevelMeter
                    stream={microphone.stream}
                    muted={microphone.isMuted}
                  />
                ) : null}

                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  {microphone.status !== "ready" ? (
                    <button
                      type="button"
                      onClick={() => {
                        void microphone.start();
                      }}
                      disabled={microphone.status === "requesting"}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {microphone.status === "requesting" ? (
                        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                      ) : (
                        <Mic aria-hidden="true" className="size-4" />
                      )}
                      {microphone.status === "requesting"
                        ? "Requesting access…"
                        : "Enable microphone"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={microphone.toggleMuted}
                      aria-pressed={microphone.isMuted}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-sm font-medium text-white transition hover:bg-white/10"
                    >
                      {microphone.isMuted ? (
                        <MicOff aria-hidden="true" className="size-4" />
                      ) : (
                        <Mic aria-hidden="true" className="size-4" />
                      )}
                      {microphone.isMuted ? "Unmute preview" : "Mute preview"}
                    </button>
                  )}

                  {microphone.stream !== null ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewAudible((audible) => !audible);
                      }}
                      aria-pressed={previewAudible}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-sm font-medium text-white transition hover:bg-white/10"
                    >
                      <Headphones aria-hidden="true" className="size-4" />
                      {previewAudible ? "Stop listening" : "Listen to myself"}
                    </button>
                  ) : (
                    <span className="hidden h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white/[0.04] text-xs text-slate-400 sm:inline-flex">
                      <ShieldCheck aria-hidden="true" className="size-3.5" />
                      Never recorded
                    </span>
                  )}
                </div>

                {/*
                  * Only while actively playing back, so a laptop speaker cannot
                  * loop the user's own voice back into the microphone.
                  */}
                {previewAudible ? (
                  <p className="mt-2 text-xs text-amber-100/90">
                    Playing your microphone out loud. Use headphones to avoid
                    feedback.
                  </p>
                ) : null}
              </div>

              {microphone.error !== null ? (
                <AlertBanner>{microphone.error}</AlertBanner>
              ) : null}
              {formError !== null ? <AlertBanner>{formError}</AlertBanner> : null}
              {!microphone.isSupported ? (
                <AlertBanner tone="warning">
                  This browser does not support microphone access. Try a current
                  version of Chrome, Firefox, Safari, or Edge.
                </AlertBanner>
              ) : null}
            </div>
          </div>
        </div>
      </main>

      {/*
        * The action is pinned to the bottom of the shell rather than sitting at
        * the end of the scrolling card. It used to scroll out of view behind up to
        * three stacked error banners, on exactly the small screens the internal
        * scroll exists for, which is where losing the primary action costs the
        * most.
        */}
      <footer className="safe-bottom safe-x relative z-10 shrink-0 border-t border-white/8 bg-slate-950/85 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-lg">
          <button
            type="button"
            onClick={() => {
              void join(displayName);
            }}
            disabled={isJoining || microphone.status === "requesting"}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 text-sm font-semibold text-slate-950 shadow-[0_18px_60px_-20px_rgba(34,211,238,0.9)] transition hover:bg-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isJoining ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <ArrowRight aria-hidden="true" className="size-4" />
            )}
            {isJoining ? "Joining…" : "Join meeting"}
          </button>

          <p className="mt-2.5 flex items-start justify-center gap-2 text-center text-xs leading-5 text-slate-400">
            <LockKeyhole aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
            Anyone with this link can join. Share it only with people you trust.
          </p>

          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>Permanent meeting link</span>
            <Link href="/" className="inline-flex items-center gap-1 hover:text-slate-200">
              Home
              <ArrowUpRight aria-hidden="true" className="size-3" />
            </Link>
          </div>
        </div>
      </footer>

      {/*
       * Muted unless the user asks to hear themselves. The meter above is the
       * primary feedback; this is the optional second opinion.
       */}
      <audio ref={previewRef} autoPlay muted={!previewAudible} className="hidden" />
    </div>
  );
}
