import { LoaderCircle } from "lucide-react";

export default function Loading(): React.JSX.Element {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <div className="flex flex-col items-center gap-4 text-slate-300">
        <LoaderCircle aria-hidden="true" className="size-8 animate-spin text-cyan-300" />
        <p className="text-sm">Loading AudioMeet…</p>
      </div>
    </main>
  );
}
