import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listTrades } from "@/lib/db/trades";
import { fetchDailyBars } from "@/lib/alpaca";
import type { ChartBar } from "@/lib/scanner";
import { PortfolioView, type ChartSnapshot } from "./PortfolioView";

export const dynamic = "force-dynamic";

const CHART_BARS_LOOKBACK = 90;

export default async function PortfolioPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const trades = await listTrades(supabase, user.id);
  // Open trades keep listTrades' created_at-desc order ("Opened" column). History
  // is ordered by when each trade was actually archived (closed_at), so the most
  // recently closed trade lands at the top — a trade opened days ago but closed
  // just now would otherwise sort by its old creation date and look "missing".
  const open = trades.filter((t) => t.status === "OPEN");
  const archived = trades
    .filter((t) => t.status !== "OPEN")
    .sort(
      (a, b) =>
        new Date(b.closed_at ?? b.created_at).getTime() -
        new Date(a.closed_at ?? a.created_at).getTime(),
    );

  const openTickers = Array.from(new Set(open.map((t) => t.ticker)));
  const charts: Record<string, ChartSnapshot> = {};

  if (openTickers.length > 0) {
    try {
      const bars = await fetchDailyBars(openTickers);
      for (const ticker of openTickers) {
        const series = bars[ticker];
        if (!series || series.length === 0) continue;
        const slice = series.slice(-CHART_BARS_LOOKBACK);
        const chartBars: ChartBar[] = slice.map((b) => ({
          date: b.t.slice(0, 10),
          close: Math.round(b.c * 100) / 100,
        }));
        charts[ticker] = {
          chartBars,
          currentPrice: chartBars[chartBars.length - 1].close,
        };
      }
    } catch {
      // Degrade silently — UI falls back to a chart-less expand state.
    }
  }

  return <PortfolioView open={open} archived={archived} charts={charts} />;
}
