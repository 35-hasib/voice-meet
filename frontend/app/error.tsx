"use client";

import { BrandMark } from "@/components/brand-mark";

export default function RouteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-900/70 p-7 text-center">
        <div className="mx-auto mb-5 w-fit">
          <BrandMark />
        </div>
        <h1 className="text-2xl font-semibold text-white">Something went wrong</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          The page hit an unexpected error. Reloading the view usually resolves it.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-7 inline-flex h-11 items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-50"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
