import type { SupabaseClient } from "@supabase/supabase-js";

export type TradeStatus = "OPEN" | "HIT_TP" | "HIT_SL" | "CLOSED";

export interface UserTradeRow {
  id: string;
  user_id: string;
  ticker: string;
  entry_price: number;
  target_tp: number;
  target_sl: number;
  status: TradeStatus;
  notes: string | null;
  created_at: string;
  closed_at: string | null;
}

export async function listTrades(
  supabase: SupabaseClient,
  userId: string
): Promise<UserTradeRow[]> {
  const { data, error } = await supabase
    .from("user_trades")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as UserTradeRow[];
}
