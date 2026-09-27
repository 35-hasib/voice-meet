"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertBanner } from "@/components/alert-banner";
import { BrandMark } from "@/components/brand-mark";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import {
  ArrowRight,
  Check,
  Copy,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Radio,
  Sparkles,
} from "lucide-react";
import { createMeeting } from "@/lib/meeting-api";
import { buildMeetingLink, extractMeetingCode } from "@/lib/validation";
import type { Meeting } from "@/types/meeting";

const features = [
  { icon: Radio, label: "Real peer-to-peer audio" },
  { icon: Link2, label: "Permanent meeting links" },
  { icon: LockKeyhole, label: "No account required" },
] as const;

export function HomePage(): React.JSX.Element {
  const router = useRouter();
  const { copied, error: clipboardError, copy } = useCopyToClipboard();
  const [meetingCode, setMeetingCode] = useState("");
  const [createdMeeting, setCreatedMeeting] = useState<Meeting | null>(null);
  const [meetingLink, setMeetingLink] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (): Promise<void> => {
    setIsCreating(true);
    setError(null);

    try {
      const meeting = await createMeeting();
      setCreatedMeeting(meeting);
      setMeetingLink(
        buildMeetingLink(window.location.origin, meeting.meetingCode),
      );
    } catch (creationError: unknown) {
      setError(
        creationError instanceof Error
          ? creationError.message
          : "Unable to create a meeting. Please try again.",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoin = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const code = extractMeetingCode(meetingCode);

    if (code === null) {
      setError("Enter a valid 12-character meeting code or paste a meeting link.");
      return;
    }

    router.push(`/meet/${code}`);
  };

  return (
    <main className="relative isolate flex min-h-dvh flex-col px-4 py-4 sm:px-8 sm:py-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_10%,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(168,85,247,0.14),transparent_32%),radial-gradient(circle_at_50%_100%,rgba(56,189,248,0.1),transparent_42%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)]"
      />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between">
        <BrandMark />
        <span className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 sm:inline-flex">
          <Sparkles aria-hidden="true" className="size-3.5 text-cyan-300" />
          Audio-first MVP
        </span>
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center py-6 sm:py-12 lg:py-16">
        <div className="grid w-full items-center gap-8 sm:gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-cyan-100">
              <span className="size-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.9)]" />
              Built for clear conversations
            </div>
            <h1 className="max-w-2xl text-[2rem] font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-5xl sm:leading-[0.98] lg:text-6xl">
              Simple audio rooms with a link that
              <span className="bg-gradient-to-r from-cyan-200 via-sky-300 to-violet-300 bg-clip-text text-transparent">
                {" "}
                never expires
              </span>
              .
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300 sm:mt-6 sm:text-base sm:leading-8 lg:text-lg">
              Create a room in one click, share the permanent URL, and talk. No
              sign-in, no downloads, and your microphone audio travels directly
              between browsers.
            </p>

            <div className="mt-6 flex flex-col gap-2.5 sm:mt-8 sm:flex-row sm:gap-3">
              <button
                type="button"
                onClick={() => {
                  void handleCreate();
                }}
                disabled={isCreating}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-6 text-sm font-semibold text-slate-950 shadow-[0_18px_60px_-20px_rgba(34,211,238,0.9)] transition hover:bg-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {isCreating ? (
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Radio aria-hidden="true" className="size-4" />
                )}
                {isCreating ? "Creating room…" : "Create meeting"}
              </button>
              <span className="hidden h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-6 text-sm text-slate-300 sm:inline-flex">
                Permanent link included
              </span>
            </div>

            <ul className="mt-7 grid gap-2.5 sm:mt-10 sm:grid-cols-3 sm:gap-3">
              {features.map((feature) => (
                <li
                  key={feature.label}
                  className="flex items-center gap-2.5 text-sm text-slate-400"
                >
                  <span className="grid size-8 place-items-center rounded-xl border border-white/10 bg-white/5">
                    <feature.icon
                      aria-hidden="true"
                      className="size-3.5 text-cyan-200"
                    />
                  </span>
                  {feature.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-6">
            {createdMeeting !== null ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                    Meeting created
                  </p>
                  <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-white">
                    Your room is ready
                  </h2>
                  <p className="mt-1.5 text-sm leading-6 text-slate-400">
                    Share this link. It keeps working after everyone leaves.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <label
                    htmlFor="meeting-link"
                    className="text-xs font-medium text-slate-400"
                  >
                    Permanent meeting link
                  </label>
                  <input
                    id="meeting-link"
                    readOnly
                    value={meetingLink}
                    onFocus={(event) => {
                      event.currentTarget.select();
                    }}
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 font-mono text-xs text-cyan-100 outline-none sm:py-3 sm:text-sm"
                  />
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      void copy(meetingLink);
                    }}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 text-sm font-medium text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
                  >
                    {copied ? (
                      <Check aria-hidden="true" className="size-4 text-emerald-300" />
                    ) : (
                      <Copy aria-hidden="true" className="size-4" />
                    )}
                    {copied ? "Link copied!" : "Copy link"}
                  </button>
                  <Link
                    href={`/meet/${createdMeeting.meetingCode}`}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-300 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
                  >
                    Join meeting
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                </div>
                {clipboardError !== null ? (
                  <p className="text-xs text-amber-200" role="alert">
                    {clipboardError}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setCreatedMeeting(null);
                    setError(null);
                  }}
                  className="w-full text-center text-xs text-slate-500 transition hover:text-slate-300"
                >
                  Create another meeting
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                    Start or resume
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                    Enter a meeting code
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Paste the 12-character code or the full meeting link.
                  </p>
                </div>

                <form onSubmit={handleJoin} className="space-y-3">
                  <div>
                    <label
                      htmlFor="meeting-code"
                      className="text-sm font-medium text-slate-300"
                    >
                      Meeting code or link
                    </label>
                    <input
                      id="meeting-code"
                      value={meetingCode}
                      onChange={(event) => {
                        setMeetingCode(event.target.value);
                        setError(null);
                      }}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="7kF9xP2mQa12"
                      className="mt-1.5 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 font-mono text-base text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-300/10"
                    />
                  </div>
                  <button
                    type="submit"
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-semibold text-slate-950 transition hover:bg-cyan-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
                  >
                    Join meeting
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </button>
                </form>

                {error !== null ? <AlertBanner>{error}</AlertBanner> : null}

                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3.5">
                  <p className="text-sm font-medium text-slate-200">
                    How access works
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-slate-400">
                    The meeting link is the access key. Anyone who has it can
                    join, so only share it with people you trust.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-6xl flex-col gap-1.5 px-1 text-[0.6875rem] text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:text-xs">
        <span>Audio only. No recording. No storage of microphone audio.</span>
        <span>WebRTC mesh · Socket.IO signaling · PostgreSQL meeting registry</span>
      </footer>
    </main>
  );
}
