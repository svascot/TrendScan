import Link from "next/link";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-900">
      <header className="border-b border-slate-800/80 bg-slate-900/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500 font-mono text-sm font-bold text-slate-950">
              T
            </span>
            <span className="font-mono text-lg font-semibold tracking-tight text-slate-100">
              TrendScan
            </span>
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-1.5 text-sm font-medium text-emerald-300 transition hover:border-emerald-400 hover:bg-emerald-500/20"
          >
            Log In
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
