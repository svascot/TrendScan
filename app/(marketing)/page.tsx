import Link from "next/link";
import { GmmaDualChart, LONG_RIBBON, RibbonLegendRow, SHORT_RIBBON } from "@/components/gmma/GmmaDualChart";
import { EXAMPLE_GMMA } from "@/lib/gmma-example";

interface RuleCard {
  n: string;
  title: string;
  body: string;
}

// The four rules the GMMA + AO scanner checks — same language as the in-app
// "Algorithmic Verification" panel, written for a first-time visitor.
const RULES: RuleCard[] = [
  {
    n: "01",
    title: "Two-ribbon GMMA uptrend",
    body:
      "The short (trader) ribbon 3–15 rides entirely above the long (investor) ribbon 30–60, which is itself fanned upward — the canonical Guppy buy alignment.",
  },
  {
    n: "02",
    title: "Pullback to the short ribbon",
    body:
      "Price eases back into the trader ribbon (Close ≤ MA15) while staying above the whole investor ribbon — a low-risk continuation entry instead of chasing the top.",
  },
  {
    n: "03",
    title: "Awesome Oscillator confirms",
    body:
      "The AO confirms momentum with a bullish saucer or a zero-line cross up — a multi-bar signal, not a single green bar.",
  },
  {
    n: "04",
    title: "Stop at support · reachable 1:2 target",
    body:
      "The stop sits just below the prior swing low. The strict 1:2 take-profit is placed below the prior resistance — a price the stock has already traded — so the target is realistically reachable.",
  },
];

export default function MarketingPage() {
  const ex = EXAMPLE_GMMA;
  return (
    <main>
      {/* ───────── Hero ───────── */}
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-12 sm:pt-28 sm:pb-16">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-emerald-400">
          GMMA + Awesome Oscillator
        </p>
        <h1 className="mt-6 text-5xl font-bold leading-tight tracking-tight text-slate-50 sm:text-6xl">
          Read the Ribbons.
          <br />
          <span className="text-emerald-400">Time the Pullback.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
          TrendScan&rsquo;s headline scanner watches the{" "}
          <span className="text-slate-100">Guppy Multiple Moving Average</span> — two ribbons of
          EMAs — and the <span className="text-slate-100">Awesome Oscillator</span> together. It
          surfaces stocks in a clean uptrend that have just pulled back to the short ribbon, with
          momentum confirming and a mechanical 1:2 trade plan attached.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link
            href="/login"
            className="rounded-md bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Get Started Now
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-300"
          >
            Sign In
          </Link>
        </div>
      </section>

      {/* ───────── Live-style worked example (fictional STOCK) ───────── */}
      <section className="border-t border-slate-800 bg-slate-950/40">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-mono text-sm uppercase tracking-[0.3em] text-slate-400">
                What a setup looks like
              </h2>
              <p className="mt-3 max-w-2xl text-lg text-slate-200">
                Here is exactly what the GMMA + AO dashboard shows for a qualifying name — the price
                with both Guppy ribbons on top, the Awesome Oscillator below, and the trade plan.
              </p>
            </div>
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-amber-300">
              Illustrative example · fictional data · not a real ticker
            </span>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
            {/* Chart card */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="flex items-baseline justify-between">
                <h3 className="font-mono text-xl font-bold text-slate-50">{ex.ticker}</h3>
                <span className="font-mono text-sm tabular-nums text-slate-300">
                  ${ex.entry.toFixed(2)}
                </span>
              </div>
              <div className="mt-4">
                <GmmaDualChart bars={ex.chartBars} />
              </div>
              <div className="mt-4 space-y-1.5">
                <RibbonLegendRow title="Short (trader) 3–15" lines={SHORT_RIBBON} />
                <RibbonLegendRow title="Long (investor) 30–60" lines={LONG_RIBBON} />
              </div>
            </div>

            {/* Trade-plan card */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <h3 className="font-mono text-xs uppercase tracking-widest text-slate-400">
                Example trade plan
              </h3>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                <PlanStat label="Entry" value={`$${ex.entry.toFixed(2)}`} />
                <PlanStat label="Risk : Reward" value={`1 : ${ex.rrRatio}`} />
                <PlanStat label="Take Profit" value={`$${ex.targetTp.toFixed(2)}`} tone="emerald" />
                <PlanStat label="Stop Loss" value={`$${ex.targetSl.toFixed(2)}`} tone="red" />
              </dl>
              <p className="mt-5 text-[13px] leading-relaxed text-slate-400">
                Stop anchored just below the prior swing low{" "}
                <span className="font-mono text-slate-300">${ex.supportLow.toFixed(2)}</span>. The
                strict 1:2 target{" "}
                <span className="font-mono text-slate-300">${ex.targetTp.toFixed(2)}</span> sits below
                the prior resistance{" "}
                <span className="font-mono text-slate-300">${ex.resistanceHigh.toFixed(2)}</span>, so
                it&rsquo;s a price the stock has already traded — reachable, not beyond a wall.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-800 pt-5 font-mono text-xs tabular-nums">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-slate-500">Risk / share</p>
                  <p className="mt-1 text-red-300">${ex.riskPerShare.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-slate-500">Reward / share</p>
                  <p className="mt-1 text-emerald-300">
                    ${(ex.targetTp - ex.entry).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── How to read the setup — the four rules ───────── */}
      <section className="border-t border-slate-800">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="font-mono text-sm uppercase tracking-[0.3em] text-slate-400">
            How the scanner reads it
          </h2>
          <p className="mt-4 max-w-3xl text-lg text-slate-200">
            Every name on the dashboard has cleared the same four mechanical checks. Nothing
            discretionary — just the math, applied after the close.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
            {RULES.map((r) => (
              <article
                key={r.n}
                className="rounded-xl border border-slate-800 bg-slate-900/80 p-6 transition hover:border-emerald-500/40"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-sm text-emerald-400">{r.n}</span>
                  <h3 className="text-lg font-semibold text-slate-50">{r.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">{r.body}</p>
              </article>
            ))}
          </div>

          {/* Secondary mention of the classic scanner */}
          <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
            <h3 className="font-mono text-xs uppercase tracking-widest text-slate-400">
              Also included
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Alongside GMMA + AO, TrendScan ships a classic momentum scanner — a 200-day trend
              filter, 50-day momentum, and an RSI sweet spot (55–65) — for a second, independent
              read on the same liquid universe.
            </p>
          </div>
        </div>
      </section>

      {/* ───────── Educational disclaimer ───────── */}
      <section className="border-t border-slate-800 bg-slate-950/40">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
            <h3 className="font-mono text-sm uppercase tracking-widest text-amber-300">
              Educational use only
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-200">
              TrendScan is an <span className="font-medium text-slate-100">educational and
              informational</span> tool. It does not execute trades and is{" "}
              <span className="font-medium text-slate-100">in no way a recommendation to invest</span>.
              Every example shown — including &ldquo;{EXAMPLE_GMMA.ticker}&rdquo; — is fictional and
              for illustration only. How you manage your portfolio is entirely your own
              responsibility. Markets carry risk; do your own research and consider professional
              advice before trading.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800 bg-slate-900">
        <div className="mx-auto max-w-6xl space-y-2 px-6 py-8 text-center text-xs text-slate-500">
          <p>TrendScan is an informational tool. It does not execute trades and is not financial advice.</p>
          <p>
            Created by{" "}
            <a
              href="https://santiagovasco.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:underline"
            >
              santiagovasco.com
            </a>
          </p>
        </div>
      </footer>
    </main>
  );
}

function PlanStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "red";
}) {
  const color =
    tone === "emerald" ? "text-emerald-300" : tone === "red" ? "text-red-300" : "text-slate-100";
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</dt>
      <dd className={`mt-1 font-mono text-base tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}
