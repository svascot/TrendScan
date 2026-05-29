import { NextResponse } from "next/server";
import { AlpacaConfigError, AlpacaHttpError, fetchActiveEquities } from "@/lib/alpaca";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RESULTS = 8;

interface Suggestion {
  symbol: string;
  name: string;
  exchange: string;
}

export async function GET(req: Request) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 1) {
    return NextResponse.json({ results: [] });
  }

  let assets;
  try {
    assets = await fetchActiveEquities();
  } catch (e) {
    if (e instanceof AlpacaConfigError) {
      console.error("[symbols/search] config error:", e.message);
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
    if (e instanceof AlpacaHttpError) {
      console.error("[symbols/search] upstream error:", e.message);
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    console.error("[symbols/search] unexpected error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const qUpper = q.toUpperCase();
  const qLower = q.toLowerCase();

  const exact: Suggestion[] = [];
  const symbolPrefix: Suggestion[] = [];
  const namePrefix: Suggestion[] = [];
  const nameContains: Suggestion[] = [];

  for (const a of assets) {
    const sym = a.symbol.toUpperCase();
    const nameLower = a.name.toLowerCase();
    const entry: Suggestion = { symbol: a.symbol, name: a.name, exchange: a.exchange };
    if (sym === qUpper) exact.push(entry);
    else if (sym.startsWith(qUpper)) symbolPrefix.push(entry);
    else if (nameLower.startsWith(qLower)) namePrefix.push(entry);
    else if (nameLower.includes(qLower)) nameContains.push(entry);
  }

  const results = [...exact, ...symbolPrefix, ...namePrefix, ...nameContains].slice(0, MAX_RESULTS);
  return NextResponse.json({ results });
}
