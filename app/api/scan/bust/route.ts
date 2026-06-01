import { NextResponse } from "next/server";
import { clearScanCache } from "@/lib/scan-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const cleared = clearScanCache();
  return NextResponse.json({ cleared });
}
