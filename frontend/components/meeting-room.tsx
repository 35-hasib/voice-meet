"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertBanner } from "@/components/alert-banner";
import { BrandMark } from "@/components/brand-mark";
import { ParticipantCard } from "@/components/participant-card";
import { RemoteAudio } from "@/components/remote-audio";
import { StatusPill } from "@/components/status-pill";
import { useAudioMeeting } from "@/hooks/useAudioMeeting";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import {
  Check,
  Copy,
  Headphones,
  Link2,
  LogOut,
  Mic,
  MicOff,
  Users,
  Volume2,
} from "lucide-react";
import { buildMeetingLink } from "@/lib/validation";

export function MeetingRoom({
  meetingCode,
  displayName,
  stream,
  onLeft,
}: {
  meetingCode: string;
  displayName: string;
  stream: MediaStream;
  onLeft: () => void;
}): React.JSX.Element {
  const router = useRouter();
  const { copied, error: clipboardError, copy } = useCopyToClipboard();
  const meeting = useAudioMeeting({ meetingCode, displayName, stream });
  const startMeeting = meeting.start;
  const participantCount = meeting.participants.length + 1;

  useEffect(() => {
    void startMeeting();
  }, [startMeeting]);

  const handleLeave = (): void => {
    meeting.leave();
    onLeft();
    router.replace("/");
  };

  return (
    <main className="flex min-h-dvh flex-col bg-slate-950">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.11),transparent_32%),radial-gradient(circle_at_90%_10%,rgba(168,85,247,0.1),transparent_30%)]"
      />

      <header className="relative z-10 border-b border-white/8 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark />
            <span className="hidden h-6 w-px bg-white/10 sm:block" />
            <span className="hidden font-mono text-xs text-slate-400 sm:inline">
              {meetingCode}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <StatusPill status={meeting.status} />
            <button
              type="button"
              onClick={() => {
                void copy(
                  buildMeetingLink(window.location.origin, meetingCode),
                );
              }}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-medium text-slate-200 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
            >
              {copied ? (
                <Check aria-hidden="true" className="size-3.5 text-emerald-300" />
              ) : (
                <Copy aria-hidden="true" className="size-3.5" />
              )}
              {copied ? "Link copied!" : "Invite"}
            </button>
          </div>
        </div>
      </header>

      <section className="relative z-10 mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_18rem] lg:py-8">
        <div className="min-w-0">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                Audio room
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">
                {participantCount} {participantCount === 1 ? "person" : "people"} here
              </h1>
            </div>
            <p className="max-w-md text-xs leading-5 text-slate-500 sm:text-right">
              Audio is sent directly between browsers. Nothing is recorded or
              saved.
            </p>
          </div>

          <div className="space-y-3">
            {meeting.error !== null ? (
              <AlertBanner tone={meeting.status === "failed" ? "error" : "warning"}>
                {meeting.error}
              </AlertBanner>
            ) : null}
            {meeting.iceWarning !== null ? (
              <AlertBanner tone="warning">{meeting.iceWarning}</AlertBanner>
            ) : null}
            {meeting.audioBlocked ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-50 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-2">
                  <Headphones aria-hidden="true" className="size-4" />
                  Your browser blocked remote audio playback.
                </p>
                <button
                  type="button"
                  onClick={meeting.unlockAudio}
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-200 px-3 text-xs font-semibold text-slate-950 transition hover:bg-amber-100"
                >
                  <Volume2 aria-hidden="true" className="size-3.5" />
                  Enable meeting audio
                </button>
              </div>
            ) : null}
            {clipboardError !== null ? (
              <AlertBanner tone="warning">{clipboardError}</AlertBanner>
            ) : null}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ParticipantCard
              name={displayName}
              muted={meeting.isMuted}
              isSelf
              stream={stream}
              connectionState="connected"
            />
            {meeting.participants.map((participant) => {
              const remotePeer = meeting.remotePeers.find(
                (peer) => peer.participantId === participant.participantId,
              );

              return (
                <ParticipantCard
                  key={participant.participantId}
                  name={participant.displayName}
                  muted={participant.muted}
                  isSelf={false}
                  stream={remotePeer?.stream ?? null}
                  connectionState={remotePeer?.connectionState}
                />
              );
            })}
          </div>
        </div>

        <aside className="hidden self-start rounded-3xl border border-white/10 bg-white/[0.04] p-5 lg:block">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <Users aria-hidden="true" className="size-4 text-cyan-300" />
            Participants
          </div>
          <ul className="mt-4 space-y-2">
            <li className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-3 py-2.5">
              <span className="truncate text-sm text-slate-200">
                {displayName} <span className="text-slate-500">(you)</span>
              </span>
              {meeting.isMuted ? (
                <MicOff aria-label="Muted" className="size-4 shrink-0 text-rose-300" />
              ) : (
                <Mic aria-label="Microphone on" className="size-4 shrink-0 text-emerald-300" />
              )}
            </li>
            {meeting.participants.map((participant) => (
              <li
                key={participant.participantId}
                className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-3 py-2.5"
              >
                <span className="truncate text-sm text-slate-200">
                  {participant.displayName}
                </span>
                {participant.muted ? (
                  <MicOff aria-label="Muted" className="size-4 shrink-0 text-rose-300" />
                ) : (
                  <Mic
                    aria-label="Microphone on"
                    className="size-4 shrink-0 text-emerald-300"
                  />
                )}
              </li>
            ))}
          </ul>
          <div className="mt-5 border-t border-white/8 pt-4">
            <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
              <Link2 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              This link stays valid after everyone leaves.
            </p>
          </div>
        </aside>
      </section>

      <footer className="sticky bottom-0 z-20 border-t border-white/8 bg-slate-950/90 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-center gap-3 px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={meeting.toggleMute}
            aria-pressed={meeting.isMuted}
            className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 ${
              meeting.isMuted
                ? "bg-amber-200 text-slate-950 hover:bg-amber-100"
                : "border border-white/10 bg-white/10 text-white hover:bg-white/15"
            }`}
          >
            {meeting.isMuted ? (
              <MicOff aria-hidden="true" className="size-4" />
            ) : (
              <Mic aria-hidden="true" className="size-4" />
            )}
            {meeting.isMuted ? "Unmute" : "Mute"}
          </button>
          <button
            type="button"
            onClick={handleLeave}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-rose-500 px-5 text-sm font-semibold text-white transition hover:bg-rose-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-200"
          >
            <LogOut aria-hidden="true" className="size-4" />
            Leave
          </button>
        </div>
      </footer>

      {meeting.remotePeers.map(
        (peer) =>
          peer.stream !== null ? (
            <RemoteAudio
              key={peer.participantId}
              stream={peer.stream}
              playbackVersion={meeting.audioPlaybackVersion}
              onBlocked={meeting.reportAudioBlocked}
              onPlaying={meeting.reportAudioPlaying}
            />
          ) : null,
      )}
    </main>
  );
}
