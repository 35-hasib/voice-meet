"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AudioLines } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { MeetingControls } from "@/components/meeting-controls";
import { MeetingNotice } from "@/components/meeting-notice";
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
  Mic,
  MicOff,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  allowsInternalScrolling,
  centresParticipantGrid,
  participantCardSize,
  participantDensity,
  participantGridClass,
} from "@/lib/participant-layout";
import { buildMeetingLink, getInitials } from "@/lib/validation";

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
  const participants = meeting.participants;
  const participantCount = participants.length + 1;

  // Local playback only: no signalling and no change to the outgoing track.
  const [isOutputMuted, setIsOutputMuted] = useState(false);
  const [openSheet, setOpenSheet] = useState<"participants" | "more" | null>(null);

  useEffect(() => {
    void startMeeting();
  }, [startMeeting]);

  const handleLeave = useCallback((): void => {
    meeting.leave();
    onLeft();
    router.replace("/");
  }, [meeting, onLeft, router]);

  const closeSheet = useCallback((): void => {
    setOpenSheet(null);
  }, []);

  const copyInviteLink = useCallback((): void => {
    void copy(buildMeetingLink(window.location.origin, meetingCode));
  }, [copy, meetingCode]);

  const density = participantDensity(participantCount);
  const canScrollInternally = allowsInternalScrolling(participantCount);
  const centreGrid = centresParticipantGrid(participantCount);
  const cardSize = participantCardSize(participantCount);

  /*
   * One notice at a time, most urgent first, so the strip can never grow tall
   * enough to swallow the stage. Audio autoplay is first because it silently
   * stops other people being heard, which is worse than a warning banner.
   */
  const notice = meeting.audioBlocked ? (
    <MeetingNotice
      tone="audio"
      message="Your browser blocked remote audio playback."
      action={{ label: "Enable", onClick: meeting.unlockAudio }}
    />
  ) : meeting.error !== null ? (
    <MeetingNotice tone="error" message={meeting.error} />
  ) : meeting.iceWarning !== null ? (
    <MeetingNotice tone="warning" message={meeting.iceWarning} />
  ) : clipboardError !== null ? (
    <MeetingNotice tone="warning" message={clipboardError} />
  ) : null;

  return (
    <div className="app-shell relative bg-slate-950" data-testid="room-shell">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.10),transparent_30%),radial-gradient(circle_at_90%_10%,rgba(168,85,247,0.09),transparent_28%)]"
      />

      {/*
       * Screen-reader heading and live participant count. The visible header is
       * too compact to carry them, and this is what a screen-reader user actually
       * needs, so it must not be dropped just to save pixels.
       */}
      <h1 className="sr-only">
        Audio meeting {meetingCode}
      </h1>
      <p aria-live="polite" className="sr-only" data-testid="participant-count">
        {participantCount === 1
          ? "1 person here"
          : `${participantCount.toString()} people here`}
      </p>

      <header className="safe-top safe-gutter relative z-10 shrink-0 border-b border-white/8 bg-slate-950/80 backdrop-blur-xl">
        <div className="flex h-13 items-center gap-2 sm:h-14">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-cyan-300 text-slate-950 sm:size-8">
            <AudioLines aria-hidden="true" className="size-4" strokeWidth={2.4} />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
            AudioMeet
          </span>

          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-slate-200">
            <StatusPill status={meeting.status} compact />
            <Users aria-hidden="true" className="size-3.5 text-cyan-300" />
            {participantCount}
          </span>

          {/* Tapping the code copies the permanent link, per the compact pattern. */}
          <button
            type="button"
            onClick={copyInviteLink}
            data-testid="meeting-code-chip"
            aria-label={`Copy meeting link for ${meetingCode}`}
            title={copied ? "Link copied" : "Copy meeting link"}
            className="inline-flex h-8 max-w-[9.5rem] shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 font-mono text-[0.6875rem] text-slate-200 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
          >
            <span className="truncate">{meetingCode}</span>
            {copied ? (
              <Check aria-hidden="true" className="size-3.5 shrink-0 text-emerald-300" />
            ) : (
              <Copy aria-hidden="true" className="size-3.5 shrink-0" />
            )}
          </button>
        </div>
      </header>

      {/*
       * The stage takes the space left between header and controls. `min-h-0` on
       * this element is what allows it to shrink, and the grid inside fills it
       * with equal rows so cards shrink instead of overflowing.
       */}
      <main className="app-shell-body relative z-10 p-2 sm:p-3">
        <div
          data-testid="participant-grid"
          className={`grid h-full min-h-0 gap-1.5 sm:gap-2.5 ${
            centreGrid ? "content-center" : ""
          } ${participantGridClass(participantCount)} ${
            canScrollInternally ? "contained-scroll" : "overflow-hidden"
          }`}
        >
          <ParticipantCard
            name={displayName}
            muted={meeting.isMuted}
            isSelf
            stream={stream}
            connectionState="connected"
            density={density}
            size={cardSize}
          />
          {participants.map((participant) => {
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
                density={density}
                size={cardSize}
              />
            );
          })}
        </div>

        {notice}
      </main>

      <MeetingControls
        isMuted={meeting.isMuted}
        isOutputMuted={isOutputMuted}
        participantCount={participantCount}
        onToggleMute={meeting.toggleMute}
        onToggleOutput={() => {
          setIsOutputMuted((muted) => !muted);
        }}
        onOpenParticipants={() => {
          setOpenSheet("participants");
        }}
        onOpenMore={() => {
          setOpenSheet("more");
        }}
        onLeave={handleLeave}
      />

      <BottomSheet
        open={openSheet === "participants"}
        onClose={closeSheet}
        title={`${participantCount} ${participantCount === 1 ? "person" : "people"}`}
      >
        <ul className="space-y-1.5">
          <li className="flex items-center gap-3 rounded-2xl bg-white/[0.05] px-3 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-cyan-300/15 text-xs font-semibold text-cyan-100">
              {getInitials(displayName)}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
              {displayName}
              <span className="text-slate-500"> (you)</span>
            </span>
            {meeting.isMuted ? (
              <MicOff aria-label="Muted" className="size-4 shrink-0 text-rose-300" />
            ) : (
              <Mic aria-label="Microphone on" className="size-4 shrink-0 text-emerald-300" />
            )}
          </li>
          {participants.map((participant) => (
            <li
              key={participant.participantId}
              className="flex items-center gap-3 rounded-2xl bg-white/[0.05] px-3 py-2.5"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold text-slate-200">
                {getInitials(participant.displayName)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                {participant.displayName}
              </span>
              {participant.muted ? (
                <MicOff aria-label="Muted" className="size-4 shrink-0 text-rose-300" />
              ) : (
                <Mic aria-label="Microphone on" className="size-4 shrink-0 text-emerald-300" />
              )}
            </li>
          ))}
        </ul>
      </BottomSheet>

      <BottomSheet open={openSheet === "more"} onClose={closeSheet} title="Meeting">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.05] px-3 py-2.5">
            <span className="text-sm text-slate-300">Connection</span>
            <StatusPill status={meeting.status} />
          </div>

          <button
            type="button"
            onClick={copyInviteLink}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            {copied ? (
              <Check aria-hidden="true" className="size-4 text-emerald-300" />
            ) : (
              <Copy aria-hidden="true" className="size-4" />
            )}
            {copied ? "Link copied" : "Copy meeting link"}
          </button>

          <p className="flex items-start gap-2 rounded-2xl bg-white/[0.04] px-3 py-2.5 text-xs leading-5 text-slate-400">
            <Link2 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            This link keeps working after everyone leaves. Share it only with
            people you trust.
          </p>

          {meeting.audioBlocked ? (
            <button
              type="button"
              onClick={meeting.unlockAudio}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-amber-200 text-sm font-semibold text-slate-950 transition hover:bg-amber-100"
            >
              <Headphones aria-hidden="true" className="size-4" />
              Enable meeting audio
            </button>
          ) : (
            <p className="flex items-center justify-center gap-2 text-xs text-slate-500">
              <ShieldCheck aria-hidden="true" className="size-3.5" />
              Audio is never recorded or stored.
            </p>
          )}
        </div>
      </BottomSheet>

      {meeting.remotePeers.map(
        (peer) =>
          peer.stream !== null ? (
            <RemoteAudio
              key={peer.participantId}
              stream={peer.stream}
              playbackVersion={meeting.audioPlaybackVersion}
              onBlocked={meeting.reportAudioBlocked}
              onPlaying={meeting.reportAudioPlaying}
              muted={isOutputMuted}
            />
          ) : null,
      )}
    </div>
  );
}
