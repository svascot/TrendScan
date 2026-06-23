import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listTrades } from "@/lib/db/trades";
import snapshot from "@/lib/backtest-snapshot.json";
import { EdgeView } from "./EdgeView";

export const dynamic = "force-dynamic";

export default async function EdgePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const trades = await listTrades(supabase, user.id);

  // Realized stats from decided trades. A trade that hit its target is +R,
  // one that hit its stop is −1R (by construction). Manually-closed trades have
  // no recorded exit, so they don't count toward win-rate / R.
  let wins = 0;
  let losses = 0;
  let rSum = 0;
  for (const t of trades) {
    if (t.status !== "HIT_TP" && t.status !== "HIT_SL") continue;
    const risk = t.entry_price - t.target_sl;
    if (risk <= 0) continue;
    const exit = t.status === "HIT_TP" ? t.target_tp : t.target_sl;
    rSum += (exit - t.entry_price) / risk;
    if (t.status === "HIT_TP") wins++;
    else losses++;
  }
  const decided = wins + losses;

  const userStats = {
    decided,
    wins,
    losses,
    open: trades.filter((t) => t.status === "OPEN").length,
    winRate: decided > 0 ? wins / decided : 0,
    avgR: decided > 0 ? rSum / decided : 0,
    totalR: rSum,
  };

  return <EdgeView snapshot={snapshot} userStats={userStats} />;
}
