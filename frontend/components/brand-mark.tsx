import { AudioLines } from "lucide-react";

/**
 * `compact` exists for the fixed-height app shell: the room header and the join
 * screen both have a hard vertical budget, so the mark has to shrink rather than
 * force the header taller.
 */
export function BrandMark({
  compact = false,
}: {
  compact?: boolean;
}): React.JSX.Element {
  if (compact) {
    return (
      <span className="inline-flex min-w-0 items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-cyan-300 text-slate-950 sm:size-8">
          <AudioLines aria-hidden="true" className="size-4" strokeWidth={2.4} />
        </span>
        <span className="truncate text-sm font-semibold tracking-tight text-white sm:text-base">
          AudioMeet
        </span>
      </span>
    );
  }

  return (
    <div className="inline-flex items-center gap-2.5">
      <span className="grid size-10 place-items-center rounded-2xl bg-cyan-300 text-slate-950 shadow-[0_0_32px_-8px_rgba(103,232,249,0.85)]">
        <AudioLines aria-hidden="true" className="size-5" strokeWidth={2.4} />
      </span>
      <span className="text-lg font-semibold tracking-tight text-white">
        AudioMeet
      </span>
    </div>
  );
}
