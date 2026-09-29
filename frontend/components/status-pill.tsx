"use client";

import {
  MeetingConnectionStatus,
} from "@/hooks/useAudioMeeting";
import {
  LoaderCircle,
  Radio,
  TriangleAlert,
  WifiOff,
} from "lucide-react";

const statusContent: Record<
  MeetingConnectionStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  idle: {
    label: "Idle",
    className: "border-white/10 bg-white/5 text-slate-300",
    icon: <Radio aria-hidden="true" className="size-3.5" />,
  },
  connecting: {
    label: "Connecting",
    className: "border-amber-300/25 bg-amber-300/10 text-amber-100",
    icon: <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />,
  },
  connected: {
    label: "Connected",
    className: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
    icon: <Radio aria-hidden="true" className="size-3.5" />,
  },
  reconnecting: {
    label: "Reconnecting",
    className: "border-amber-300/25 bg-amber-300/10 text-amber-100",
    icon: <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />,
  },
  degraded: {
    label: "Weak connection",
    className: "border-orange-300/25 bg-orange-300/10 text-orange-100",
    icon: <TriangleAlert aria-hidden="true" className="size-3.5" />,
  },
  failed: {
    label: "Disconnected",
    className: "border-rose-300/25 bg-rose-300/10 text-rose-100",
    icon: <WifiOff aria-hidden="true" className="size-3.5" />,
  },
  left: {
    label: "Left meeting",
    className: "border-white/10 bg-white/5 text-slate-300",
    icon: <Radio aria-hidden="true" className="size-3.5" />,
  },
};

export function StatusPill({
  status,
  compact = false,
}: {
  status: MeetingConnectionStatus;
  /**
   * Dot only, for the fixed-height meeting header. The label still reaches
   * assistive technology via the accessible name.
   */
  compact?: boolean;
}): React.JSX.Element {
  const content = statusContent[status];

  if (compact) {
    return (
      <span
        className={`inline-flex size-2 shrink-0 rounded-full border ${content.className}`}
        title={content.label}
      >
        {/*
          * A live region needs its label in the text content, not in
          * `aria-label`: announcements are driven by content changes, so a
          * connected dot whose label later changes to "Reconnecting" in place
          * said nothing at all. The visible pill is only a dot, so the text is
          * visually hidden instead of removed.
        */}
        <span role="status" aria-live="polite" className="sr-only">
          {content.label}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${content.className}`}
      aria-live="polite"
    >
      {content.icon}
      {content.label}
    </span>
  );
}
