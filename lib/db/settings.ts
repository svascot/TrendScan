import {
  STRATEGY_DEFAULTS,
  settingsFromRow,
  settingsToRow,
  type DbSettingsRow,
  type StrategySettings,
} from "@/lib/strategy";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getOrCreateSettings(
  supabase: SupabaseClient,
  userId: string
): Promise<StrategySettings> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  if (data) return settingsFromRow(data as DbSettingsRow);

  // First read for this user — write defaults.
  const row = settingsToRow(userId, STRATEGY_DEFAULTS);
  const { error: upsertErr } = await supabase
    .from("user_settings")
    .upsert(row, { onConflict: "user_id" });
  if (upsertErr) throw upsertErr;
  return { ...STRATEGY_DEFAULTS };
}

export async function saveSettings(
  supabase: SupabaseClient,
  userId: string,
  s: StrategySettings
): Promise<void> {
  const row = settingsToRow(userId, s);
  const { error } = await supabase
    .from("user_settings")
    .upsert(row, { onConflict: "user_id" });
  if (error) throw error;
}
