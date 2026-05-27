import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listTrades } from "@/lib/db/trades";
import { PortfolioView } from "./PortfolioView";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const trades = await listTrades(supabase, user.id);
  const open = trades.filter((t) => t.status === "OPEN");
  const archived = trades.filter((t) => t.status !== "OPEN");

  return <PortfolioView open={open} archived={archived} />;
}
