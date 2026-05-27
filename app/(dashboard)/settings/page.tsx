import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateSettings } from "@/lib/db/settings";
import { SettingsView } from "./SettingsView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const settings = await getOrCreateSettings(supabase, user.id);
  return <SettingsView initial={settings} />;
}
