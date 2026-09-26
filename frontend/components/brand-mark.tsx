import { AudioLines } from "lucide-react";

export function BrandMark(): React.JSX.Element {
  return (
    <div className="inline-flex items-center gap-2.5">
      <span className="grid size-10 place-items-center rounded-2xl bg-cyan-300 text-slate-950 shadow-[0_0_32px_-8px_rgba(103,232,249,0.85)]">
        <AudioLines aria-hidden="true" className="size-5" strokeWidth={2.4} />
      </span>
      <span className="text-lg font-semibold tracking-tight text-white">AudioMeet</span>
    </div>
  );
}
