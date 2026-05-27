import Link from "next/link";

interface StrategyCard {
  title: string;
  formula: string;
  body: string;
}

const STRATEGY_CARDS: StrategyCard[] = [
  {
    title: "200-day Trend Filter",
    formula: "Close > MA(200)",
    body:
      "Ensures we only pick assets locked in long-term bullish territory. No fighting the macro tide.",
  },
  {
    title: "50-day Momentum",
    formula: "Close > MA(50)  •  MA(50) > MA(200)",
    body:
      "Triggers entry when short-term velocity accelerates above structural support — the Golden Cross orientation.",
  },
  {
    title: "RSI Sweet Spot",
    formula: "55 ≤ RSI(14) ≤ 65",
    body:
      "Filters out overextended stocks. We buy setups with runway left to run, never near the saturation peak.",
  },
];

export default function MarketingPage() {
  return (
    <main>
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-16 sm:pt-28 sm:pb-24">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-emerald-400">
          Quantitative Swing Trading
        </p>
        <h1 className="mt-6 text-5xl font-bold leading-tight tracking-tight text-slate-50 sm:text-6xl">
          Catch the Wave.
          <br />
          <span className="text-emerald-400">Compound the Gains.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
          A quantitative momentum scanner engineered for short-term swing trading. No noise,
          no hype — just raw mathematical setups on the most liquid names in the market.
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

        <dl className="mt-14 grid grid-cols-2 gap-x-10 gap-y-6 border-t border-slate-800 pt-10 sm:grid-cols-4">
          <Stat label="Take Profit" value="+4.0%" tone="emerald" />
          <Stat label="Stop Loss" value="-2.0%" tone="red" />
          <Stat label="Hold Period" value="1–5 days" />
          <Stat label="Risk : Reward" value="1 : 2" />
        </dl>
      </section>

      <section className="border-t border-slate-800 bg-slate-950/40">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="font-mono text-sm uppercase tracking-[0.3em] text-slate-400">
            Our Core Engine Strategy
          </h2>
          <p className="mt-4 max-w-3xl text-lg text-slate-200">
            Three mathematical filters, applied post-market close every day, against the S&amp;P 500,
            the Nasdaq 100, and a curated set of premium ETFs.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {STRATEGY_CARDS.map((c) => (
              <article
                key={c.title}
                className="rounded-xl border border-slate-800 bg-slate-900/80 p-6 transition hover:border-emerald-500/40"
              >
                <h3 className="text-lg font-semibold text-slate-50">{c.title}</h3>
                <p className="mt-3 font-mono text-sm text-emerald-400">{c.formula}</p>
                <p className="mt-4 text-sm leading-relaxed text-slate-300">{c.body}</p>
              </article>
            ))}
          </div>

          <div className="mt-12 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6">
            <h3 className="font-mono text-sm uppercase tracking-widest text-emerald-400">
              Take the cash and walk away.
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-200">
              Hit your target, archive the trade, rotate capital into a different setup from the
              ranked list. No revenge trades, no chasing peaks, no emotional re-entries.
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "red" }) {
  const color = tone === "emerald" ? "text-emerald-400" : tone === "red" ? "text-red-400" : "text-slate-100";
  return (
    <div>
      <dt className="font-mono text-xs uppercase tracking-widest text-slate-500">{label}</dt>
      <dd className={`mt-1 font-mono text-2xl font-bold ${color}`}>{value}</dd>
    </div>
  );
}
