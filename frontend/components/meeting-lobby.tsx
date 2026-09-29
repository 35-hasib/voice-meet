"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AlertBanner } from "@/components/alert-banner";
import { BrandMark } from "@/components/brand-mark";
import { MeetingRoom } from "@/components/meeting-room";
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
  LoaderCircle,
  LockKeyhole,
  Mic,
  MicOff,
  RotateCcw,
  ShieldCheck,
  UserRound,
  AudioWaveform,
} from "lucide-react";
import {
  extractMeetingCode,
  MAX_DISPLAY_NAME_CHARACTERS,
  normalizeDisplayName,
} from "@/lib/validation";

function LookupScreen({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}): React.JSX.Element {
  return (
    <main className="app-shell safe-gutter bg-slate-950">
      <div className="app-shell-body flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/70 p-6 text-center shadow-2xl shadow-black/40 sm:p-7">
          <div className="mx-auto mb-4 w-fit">
            <BrandMark compact />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
            {title}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">{message}</p>
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-50"
            >
              Back to home
            </Link>
            {actionLabel !== undefined && onAction !== undefined ? (
              <button
                type="button"
                onClick={onAction}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-medium text-white transition hover:bg-white/10"
              >
                <RotateCcw aria-hidden="true" className="size-4" />
                {actionLabel}
              </button>
            ) : null}
          </div>
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
  const { roomStream, roomName, isJoining, formError, join, clearError, leaveRoom } =
    useMeetingJoin(microphone);

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
    void join(name);
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
      <LookupScreen
        title="Meeting not found"
        message="Sorry, this meeting doesn't exist. Check the link and try again."
      />
    );
  }

  if (lookup.status === "loading") {
    return (
      <main className="app-shell safe-gutter bg-slate-950">
        <div className="app-shell-body flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-slate-300">
            <LoaderCircle aria-hidden="true" className="size-7 animate-spin text-cyan-300" />
            <p className="text-sm">Looking up this meeting…</p>
          </div>
        </div>
      </main>
    );
  }

  if (lookup.status === "not-found") {
    return (
      <LookupScreen
        title="Meeting not found"
        message="Sorry, this meeting doesn't exist. Check the link and try again."
      />
    );
  }

  if (lookup.status === "closed") {
    return (
      <LookupScreen
        title="Meeting closed"
        message="This meeting has been closed."
      />
    );
  }

  if (lookup.status === "error") {
    return (
      <LookupScreen
        title="Unable to connect"
        message={lookup.error ?? "Unable to connect to the server."}
        actionLabel="Try again"
        onAction={lookup.retry}
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
      />
    );
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
          <span className="min-w-0 truncate rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-slate-400">
            {normalizedCode}
          </span>
        </div>
      </header>

      {/*
       * min-h-0 plus an internal scroll is deliberate: the on-screen keyboard
       * shrinks the viewport to roughly half, and the form has to stay reachable.
       * The page itself still never scrolls.
       */}
      <main className="app-shell-body safe-gutter relative z-10">
        <div className="contained-scroll mx-auto flex h-full w-full max-w-lg flex-col justify-center py-3">
        <div className="w-full rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-6">
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
                className="flex items-center justify-between gap-3 text-sm font-medium text-slate-300"
              >
                <span className="inline-flex items-center gap-2">
                  <UserRound aria-hidden="true" className="size-4 text-cyan-300" />
                  Your name
                </span>
                <span className="text-xs font-normal text-slate-500">
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
                className="mt-1.5 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-300/10"
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
                <span className="hidden h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white/[0.04] text-xs text-slate-400 sm:inline-flex">
                  <ShieldCheck aria-hidden="true" className="size-3.5" />
                  Never recorded
                </span>
              </div>
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

            <p className="flex items-start justify-center gap-2 text-center text-[0.6875rem] leading-5 text-slate-500">
              <LockKeyhole aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
              Anyone with this link can join. Share it only with people you trust.
            </p>
          </div>
        </div>
        </div>
      </main>

      <footer className="safe-bottom safe-x relative z-10 shrink-0 border-t border-white/8 bg-slate-950/70 px-4 py-2 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between text-[0.6875rem] text-slate-500">
          <span>Permanent meeting link</span>
          <Link href="/" className="inline-flex items-center gap-1 hover:text-slate-300">
            Home
            <ArrowUpRight aria-hidden="true" className="size-3" />
          </Link>
        </div>
      </footer>

      <audio ref={previewRef} autoPlay muted className="hidden" />
    </div>
  );
}
