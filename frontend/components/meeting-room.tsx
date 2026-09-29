"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/bottom-sheet";
import { BrandMark } from "@/components/brand-mark";
import { MeetingControls } from "@/components/meeting-controls";
import { MeetingNotice } from "@/components/meeting-notice";
import { ParticipantCard } from "@/components/participant-card";
import { RemoteAudio } from "@/components/remote-audio";
import { StatusPill } from "@/components/status-pill";
import { useAudioMeeting } from "@/hooks/useAudioMeeting";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useLayoutBreakpoint } from "@/hooks/useLayoutBreakpoint";
import { useRoomAudioLevels } from "@/hooks/useRoomAudioLevels";
import {
  AudioLines,
  Check,
  Copy,
  Headphones,
  Link2,
  Mic,
  MicOff,
  ShieldCheck,
  Users,
  UserPlus,
} from "lucide-react";
import {
  allowsInternalScrolling,
  centresParticipantGrid,
  participantCardSize,
  participantDensity,
  participantGridClass,
} from "@/lib/participant-layout";
import { buildMeetingLink, getInitials } from "@/lib/validation";

const SELF_KEY = "self";

export function MeetingRoom({
  meetingCode,
  displayName,
  stream,
  onLeft,
  onJoinRejected,
}: {
  meetingCode: string;
  displayName: string;
  stream: MediaStream;
  onLeft: () => void;
  /**
   * Rejections the server will accept on a later attempt are handed back to the
   * lobby instead of being shown here, so the user is returned to the join form
   * where the only useful action is available.
   */
  onJoinRejected?: (message: string) => void;
}): React.JSX.Element {
  const router = useRouter();
  const { copied, error: clipboardError, copy } = useCopyToClipboard();
  const meeting = useAudioMeeting({
    meetingCode,
    displayName,
    stream,
    ...(onJoinRejected === undefined ? {} : { onJoinRejected }),
  });
  const startMeeting = meeting.start;
  const participants = meeting.participants;
  const participantCount = participants.length + 1;
  const breakpoint = useLayoutBreakpoint();

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

  /**
   * Streams keyed for the room-level analysis.
   *
   * The local stream is under a fixed key rather than the participant id,
   * because the id is only known after the socket join is acknowledged and the
   * meter is useful immediately. Remote streams move in as their track arrives,
   * so a participant appears with a muted meter and starts reporting as soon as
   * audio lands.
   */
  const streams = useMemo(() => {
    const next = new Map<string, MediaStream | null>([[SELF_KEY, stream]]);

    for (const peer of meeting.remotePeers) {
      next.set(peer.participantId, peer.stream);
    }

    return next;
  }, [meeting.remotePeers, stream]);

  const mutedKeys = useMemo(() => {
    const next = new Set<string>();

    if (meeting.isMuted) {
      next.add(SELF_KEY);
    }

    for (const participant of participants) {
      if (participant.muted) {
        next.add(participant.participantId);
      }
    }

    return next;
  }, [meeting.isMuted, participants]);

  const { readings, loudestParticipantId } = useRoomAudioLevels(streams, mutedKeys);

  // Every derived measurement resolves against the breakpoint the grid is
  // actually laid out at. Deriving it from the phone columns made a four-person
  // desktop room use phone chrome in the middle of a wide stage.
  const density = participantDensity(participantCount, breakpoint);
  const canScrollInternally = allowsInternalScrolling(participantCount);
  const centreGrid = centresParticipantGrid(participantCount);
  const cardSize = participantCardSize(participantCount, breakpoint);
  const alone = participantCount === 1;

  /*
   * One notice at a time, most urgent first, so the strip can never grow tall
   * enough to swallow the stage.
   *
   * The TURN warning is dropped for a solo room. "Peers behind a strict firewall
   * may fail to connect" describes a risk that does not exist until there is
   * someone to fail, and while it was showing it suppressed the one screen that
   * matters most in an empty room: the invitation to join it.
   */
  const notice = buildNotice({
    audioBlocked: meeting.audioBlocked,
    error: meeting.error,
    iceWarning: meeting.iceWarning,
    clipboardError,
    alone,
    onEnableAudio: meeting.unlockAudio,
  });

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
      <h1 className="sr-only">Audio meeting {meetingCode}</h1>
      <p aria-live="polite" className="sr-only" data-testid="participant-count">
        {participantCount === 1
          ? "1 person here"
          : `${participantCount.toString()} people here`}
      </p>

      <header className="safe-top safe-gutter relative z-10 shrink-0 border-b border-white/8 bg-slate-950/80 backdrop-blur-xl">
        <div className="flex h-13 items-center gap-2 sm:h-14">
          {/*
            The wordmark is dropped below `sm`. On a 320px screen the logo, the
            name, the status, the count and the code cannot all fit, and both the
            name and the code were truncating. The code is the artefact people
            read aloud to each other, so it wins the space.
          */}
          <span className="hidden sm:block">
            <BrandMark compact />
          </span>
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-cyan-300 text-slate-950 sm:hidden">
            <AudioLines aria-hidden="true" className="size-4" strokeWidth={2.4} />
          </span>

          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white sm:hidden">
            AudioMeet
          </span>

          <span className="hidden min-w-0 flex-1 sm:block" />

          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-slate-200">
            <StatusPill status={meeting.status} compact />
            <Users aria-hidden="true" className="size-3.5 text-cyan-300" />
            {participantCount}
          </span>

          {/*
            Tapping the code copies the permanent link. The target is a full 44px
            even though the chip is shorter, and the code is never truncated: it
            is the thing people read out, so clipping it defeats the control.
          */}
          <button
            type="button"
            onClick={copyInviteLink}
            data-testid="meeting-code-chip"
            aria-label={`Copy meeting link for ${meetingCode}`}
            title={copied ? "Link copied" : "Copy meeting link"}
            className="inline-flex h-11 max-w-[11rem] shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 font-mono text-xs text-slate-200 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 sm:h-8 sm:max-w-none sm:px-2.5 sm:text-[0.6875rem]"
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
        *
        * When a notice is showing it takes the space it needs and the grid takes
        * the rest. It used to float over the top row, which covered the top of
        * every avatar behind it at the point where a full room is already
        * crowded.
      */}
      <main
        className={`app-shell-body relative z-10 flex flex-col p-2 sm:p-3 ${notice === null ? "" : "gap-2"}`}
      >
        {/*
         * Above the stage, in normal flow. It used to float over the grid, which
         * covered the top of every avatar at exactly the point where a room is
         * already crowded. Being in flow means it takes the space it needs and the
         * grid takes the rest, which is safe because the grid is a `min-h-0` flex
         * child that shrinks.
         *
         * Above rather than below: the pinned control bar is already the busiest
         * strip on the screen, and a message the user has to act on belongs where
         * the eye lands first, not tucked against the controls.
         */}
        {notice}

        <div
          data-testid="participant-grid"
          className={`grid min-h-0 flex-1 gap-1.5 sm:gap-2.5 ${
            centreGrid ? "content-center" : ""
          } ${participantGridClass(participantCount)} ${
            canScrollInternally ? "contained-scroll scroll-fade" : "overflow-hidden"
          }`}
        >
          <ParticipantCard
            name={displayName}
            muted={meeting.isMuted}
            isSelf
            speaking={readings.get(SELF_KEY)?.speaking ?? false}
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
                speaking={
                  readings.get(participant.participantId)?.speaking ?? false
                }
                promoted={loudestParticipantId === participant.participantId}
                connectionState={remotePeer?.connectionState}
                density={density}
                size={cardSize}
              />
            );
          })}
        </div>

        {/*
         * Being alone is the moment sharing matters most, and the only way to
         * invite anyone is the 32px chip in the header, which most people never
         * discover. An empty room should say so and offer the one useful action.
         */}
        {alone && notice === null && meeting.status === "connected" ? (
          <div
            data-testid="alone-notice"
            className="shrink-0 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center"
          >
            <p className="text-sm font-medium text-slate-200">
              You are the only one here
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              This link works for anyone you send it to, and it never expires.
            </p>
            <button
              type="button"
              onClick={copyInviteLink}
              className="mt-2.5 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
            >
              {copied ? (
                <Check aria-hidden="true" className="size-4" />
              ) : (
                <UserPlus aria-hidden="true" className="size-4" />
              )}
              {copied ? "Link copied" : "Copy invite link"}
            </button>
          </div>
        ) : null}
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
              <span className="text-slate-400"> (you)</span>
            </span>
            {meeting.isMuted ? (
              <MicOff
                role="img"
                aria-label="Muted"
                className="size-4 shrink-0 text-rose-300"
              />
            ) : (
              <Mic
                role="img"
                aria-label="Microphone on"
                className="size-4 shrink-0 text-emerald-300"
              />
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
                <MicOff
                  role="img"
                  aria-label="Muted"
                  className="size-4 shrink-0 text-rose-300"
                />
              ) : (
                <Mic
                  role="img"
                  aria-label="Microphone on"
                  className="size-4 shrink-0 text-emerald-300"
                />
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
            <p className="flex items-center justify-center gap-2 text-xs text-slate-400">
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

/**
 * Picks the single notice to show, or null for none.
 *
 * Ordered by what breaks the call rather than by what is most recent: blocked
 * playback silently stops other people being heard, a connection error explains
 * why, the TURN warning is a standing environmental risk, and a clipboard failure
 * only matters if the user was actually trying to copy the link.
 */
function buildNotice({
  audioBlocked,
  error,
  iceWarning,
  clipboardError,
  alone,
  onEnableAudio,
}: {
  audioBlocked: boolean;
  error: string | null;
  iceWarning: string | null;
  clipboardError: string | null;
  alone: boolean;
  onEnableAudio: () => void;
}): React.JSX.Element | null {
  if (audioBlocked) {
    return (
      <MeetingNotice
        tone="audio"
        message="Your browser blocked remote audio playback."
        action={{ label: "Enable", onClick: onEnableAudio }}
      />
    );
  }

  if (error !== null) {
    return <MeetingNotice tone="error" message={error} />;
  }

  if (iceWarning !== null && !alone) {
    return <MeetingNotice tone="warning" message={iceWarning} />;
  }

  if (clipboardError !== null) {
    return <MeetingNotice tone="warning" message={clipboardError} />;
  }

  return null;
}
