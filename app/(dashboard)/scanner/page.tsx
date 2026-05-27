import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateSettings } from "@/lib/db/settings";
import { ScannerView } from "./ScannerView";

export const dynamic = "force-dynamic";

export default async function ScannerPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const settings = await getOrCreateSettings(supabase, user.id);

  return <ScannerView settings={settings} />;
}
