"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  STRATEGY_DEFAULTS,
  strategySchema,
  type StrategySettings,
} from "@/lib/strategy";

interface Props {
  initial: StrategySettings;
}

interface FormState {
  tpPct: string;
  slPct: string;
  rsiLow: string;
  rsiHigh: string;
  maShort: string;
  maLong: string;
  scannerLimit: string;
}

function toForm(s: StrategySettings): FormState {
  return {
    tpPct: (s.tpPct * 100).toFixed(2),
    slPct: (s.slPct * 100).toFixed(2),
    rsiLow: s.rsiLow.toString(),
    rsiHigh: s.rsiHigh.toString(),
    maShort: s.maShort.toString(),
    maLong: s.maLong.toString(),
    scannerLimit: s.scannerLimit.toString(),
  };
}

export function SettingsView({ initial }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(toForm(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function update<K extends keyof FormState>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function resetDefaults() {
    setForm(toForm(STRATEGY_DEFAULTS));
    setInfo(null);
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const parsed = strategySchema.safeParse({
      tpPct: parseFloat(form.tpPct) / 100,
      slPct: parseFloat(form.slPct) / 100,
      rsiLow: parseInt(form.rsiLow, 10),
      rsiHigh: parseInt(form.rsiHigh, 10),
      maShort: parseInt(form.maShort, 10),
      maLong: parseInt(form.maLong, 10),
      scannerLimit: parseInt(form.scannerLimit, 10),
    });

    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" · "));
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in.");
      const row = {
        user_id: userData.user.id,
        tp_pct: parsed.data.tpPct,
        sl_pct: parsed.data.slPct,
        rsi_low: parsed.data.rsiLow,
        rsi_high: parsed.data.rsiHigh,
        ma_short: parsed.data.maShort,
        ma_long: parsed.data.maLong,
        scanner_limit: parsed.data.scannerLimit,
      };
      const { error } = await supabase
        .from("user_settings")
        .upsert(row, { onConflict: "user_id" });
      if (error) throw error;
      setInfo("Settings saved. New rules apply on your next scan.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="border-b border-slate-800 pb-4">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-emerald-400">
          Your Strategy
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-50">Trade Parameters</h1>
        <p className="mt-1 text-sm text-slate-400">
          These values control your TP/SL targets, scanner filters, and result count. Suggested
          defaults are pre-filled from the system blueprint.
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-8 rounded-xl border border-slate-800 bg-slate-900/40 p-6">
        <Section title="Trade Targets" hint="Symmetric 1:2 risk:reward is the system default. Lower TP = easier to hit, lower per-trade payoff.">
          <Field label="Take Profit %" suffix="%" value={form.tpPct} onChange={(v) => update("tpPct", v)} step="0.1" />
          <Field label="Stop Loss %" suffix="%" value={form.slPct} onChange={(v) => update("slPct", v)} step="0.1" />
        </Section>

        <Section title="RSI Band" hint="Buy strength, not exhaustion. Default 55–65 keeps you out of overbought territory.">
          <Field label="RSI Low" value={form.rsiLow} onChange={(v) => update("rsiLow", v)} step="1" />
          <Field label="RSI High" value={form.rsiHigh} onChange={(v) => update("rsiHigh", v)} step="1" />
        </Section>

        <Section title="Moving Averages" hint="50 & 200 are the canonical short / long structural anchors.">
          <Field label="MA Short" value={form.maShort} onChange={(v) => update("maShort", v)} step="1" />
          <Field label="MA Long" value={form.maLong} onChange={(v) => update("maLong", v)} step="1" />
        </Section>

        <Section title="Scanner Display" hint="How many ranked setups to show by default.">
          <Field label="Top N" value={form.scannerLimit} onChange={(v) => update("scannerLimit", v)} step="1" />
        </Section>

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
        {info && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            {info}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save Settings"}
          </button>
          <button
            type="button"
            onClick={resetDefaults}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-emerald-400 hover:text-emerald-300"
          >
            Reset to suggested defaults
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({
  title, hint, children,
}: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-mono text-xs uppercase tracking-widest text-slate-400">{title}</h2>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label, value, onChange, suffix, step,
}: { label: string; value: string; onChange: (v: string) => void; suffix?: string; step?: string }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-slate-400">{label}</span>
      <span className="mt-1 flex items-center rounded-md border border-slate-700 bg-slate-950 focus-within:border-emerald-400">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent px-3 py-2 text-slate-100 outline-none"
        />
        {suffix && <span className="px-3 text-sm text-slate-500">{suffix}</span>}
      </span>
    </label>
  );
}
