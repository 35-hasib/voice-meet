import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

export default function NotFound(): React.JSX.Element {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-900/70 p-7 text-center">
        <div className="mx-auto mb-5 w-fit">
          <BrandMark />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
          404
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          The page you requested does not exist.
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex h-11 items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-50"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
