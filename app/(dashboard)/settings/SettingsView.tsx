"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  STRATEGY_DEFAULTS,
  strategySchema,
  type StrategySettings,
} from "@/lib/strategy";
import {
  fireSetupNotification,
  notificationPermission,
  requestNotificationPermission,
  type NotificationPermissionState,
} from "@/lib/notifications";
import { SettingHelp } from "@/components/ui/setting-help";
import type { SettingHelpId } from "@/lib/constants/settings-education";

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
  refreshIntervalMinutes: string;
  atrMinPct: string;
  totalCapital: string;
  riskPerTradePct: string;
  brokerFeeUsd: string;
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
    refreshIntervalMinutes: s.refreshIntervalMinutes.toString(),
    atrMinPct: (s.atrMinPct * 100).toFixed(2),
    totalCapital: s.totalCapital.toFixed(2),
    riskPerTradePct: s.riskPerTradePct.toFixed(2),
    brokerFeeUsd: s.brokerFeeUsd.toFixed(2),
  };
}

export function SettingsView({ initial }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(toForm(initial));
  const [notificationsEnabled, setNotificationsEnabled] = useState(initial.notificationsEnabled);
  const [permission, setPermission] = useState<NotificationPermissionState>("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Notification permission can only be read on the client.
  useEffect(() => {
    setPermission(notificationPermission());
  }, []);

  function update<K extends keyof FormState>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function resetDefaults() {
    setForm(toForm(STRATEGY_DEFAULTS));
    setNotificationsEnabled(STRATEGY_DEFAULTS.notificationsEnabled);
    setInfo(null);
    setError(null);
  }

  // Fire a sample notification and report back, so a silent failure (e.g. macOS
  // blocking Chrome at the system level) is visible instead of "nothing happens".
  function onSendTest() {
    setError(null);
    setInfo(null);
    const perm = notificationPermission();
    setPermission(perm);
    if (perm !== "granted") {
      setError("Notification permission isn't granted in this browser.");
      return;
    }
    const ok = fireSetupNotification({
      ticker: "AAPL",
      close: 192.34,
      target: 200.18,
      stop: 188.42,
      shares: 32,
    });
    if (ok) {
      setInfo(
        "Test sent. If you didn't see it, macOS is likely hiding it: open System Settings → " +
          "Notifications → Google Chrome, turn it on, and make sure Do Not Disturb / Focus is off.",
      );
    } else {
      setError(
        "The browser couldn't show the notification. On macOS, enable it in System Settings → " +
          "Notifications → Google Chrome.",
      );
    }
  }

  // Turning the toggle on prompts for browser permission. If the user blocks it
  // (or the browser can't), keep the toggle off and explain why.
  async function onToggleNotifications(next: boolean) {
    setError(null);
    setInfo(null);
    if (!next) {
      setNotificationsEnabled(false);
      return;
    }
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === "granted") {
      setNotificationsEnabled(true);
    } else {
      setNotificationsEnabled(false);
      setError(
        result === "denied"
          ? "Chrome is blocking notifications for this site. Enable them in the address-bar site settings (🔒 icon), then try again."
          : result === "unsupported"
            ? "This browser doesn't support notifications."
            : "Notification permission was not granted.",
      );
    }
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
      refreshIntervalMinutes: parseInt(form.refreshIntervalMinutes, 10),
      atrMinPct: parseFloat(form.atrMinPct) / 100,
      totalCapital: parseFloat(form.totalCapital),
      riskPerTradePct: parseFloat(form.riskPerTradePct),
      brokerFeeUsd: parseFloat(form.brokerFeeUsd),
      notificationsEnabled,
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
        refresh_interval_minutes: parsed.data.refreshIntervalMinutes,
        atr_min_pct: parsed.data.atrMinPct,
        total_capital: parsed.data.totalCapital,
        risk_per_trade_pct: parsed.data.riskPerTradePct,
        broker_fee_usd: parsed.data.brokerFeeUsd,
        notifications_enabled: parsed.data.notificationsEnabled,
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
    <div className="space-y-6">
      <header className="border-b border-slate-800 pb-4">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-emerald-400">
          Your Strategy
        </p>
        <h1 className="mt-2 text-xl font-semibold text-slate-50 sm:text-2xl">Trade Parameters</h1>
        <p className="mt-1 text-sm text-slate-400">
          These values control your TP/SL targets, scanner filters, and result count. Suggested
          defaults are pre-filled from the system blueprint.
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-8 rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:p-6">
        <Section
          title="Trade Targets"
          helpId="tradeTargets"
          hint="Symmetric 1:2 risk:reward is the system default. Lower TP = easier to hit, lower per-trade payoff."
        >
          <Field label="Take Profit %" suffix="%" value={form.tpPct} onChange={(v) => update("tpPct", v)} step="0.1" />
          <Field label="Stop Loss %" suffix="%" value={form.slPct} onChange={(v) => update("slPct", v)} step="0.1" min="0" />
        </Section>

        <Section
          title="RSI Band"
          helpId="rsiBand"
          hint="Buy strength, not exhaustion. Default 55–65 keeps you out of overbought territory."
        >
          <Field label="RSI Low" value={form.rsiLow} onChange={(v) => update("rsiLow", v)} step="1" />
          <Field label="RSI High" value={form.rsiHigh} onChange={(v) => update("rsiHigh", v)} step="1" />
        </Section>

        <Section
          title="Volatility Floor (ATR)"
          helpId="volatilityFloor"
          hint="Minimum daily range (ATR14 / Close) so the asset can realistically reach TP inside 1–5 days. Default 1.5%."
        >
          <Field
            label="ATR Min %"
            suffix="%"
            value={form.atrMinPct}
            onChange={(v) => update("atrMinPct", v)}
            step="0.1"
          />
        </Section>

        <Section
          title="Money Management"
          helpId="moneyManagement"
          hint="Used by the GMMA scanner to size each position so a stop-out costs exactly the configured % of capital. The broker fee (round trip) is added on top of the take-profit so wins still net 2:1 after commissions."
        >
          <Field
            label="Total Capital"
            suffix="$"
            value={form.totalCapital}
            onChange={(v) => update("totalCapital", v)}
            step="100"
          />
          <Field
            label="Risk per Trade"
            suffix="%"
            value={form.riskPerTradePct}
            onChange={(v) => update("riskPerTradePct", v)}
            step="0.1"
          />
          <Field
            label="Broker Fee per Trade"
            suffix="$"
            value={form.brokerFeeUsd}
            onChange={(v) => update("brokerFeeUsd", v)}
            step="0.5"
            min="0"
          />
        </Section>

        <Section
          title="Moving Averages"
          helpId="movingAverages"
          hint="50 & 200 are the canonical short / long structural anchors."
        >
          <Field label="MA Short" value={form.maShort} onChange={(v) => update("maShort", v)} step="1" />
          <Field label="MA Long" value={form.maLong} onChange={(v) => update("maLong", v)} step="1" />
        </Section>

        <Section title="Scanner Display" hint="How many ranked setups to show by default.">
          <Field label="Top N" value={form.scannerLimit} onChange={(v) => update("scannerLimit", v)} step="1" />
        </Section>

        <Section title="Auto-Refresh" hint="How often the scanner re-runs automatically while the dashboard is open. Minimum 1 minute.">
          <Field
            label="Interval"
            suffix="min"
            value={form.refreshIntervalMinutes}
            onChange={(v) => update("refreshIntervalMinutes", v)}
            step="1"
          />
        </Section>

        <section>
          <div className="flex items-center gap-1.5">
            <h2 className="font-mono text-xs uppercase tracking-widest text-slate-400">
              Notifications
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Get a Chrome notification for each new GMMA setup that appears while the dashboard is
            open (even in a background tab). Chrome must stay open for these to arrive.
          </p>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <div className="min-w-0">
              <p className="text-sm text-slate-200">Browser notifications</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {permission === "denied"
                  ? "Blocked by the browser — enable in site settings (🔒)."
                  : permission === "unsupported"
                    ? "Not supported in this browser."
                    : notificationsEnabled
                      ? "On — alerts for new setups."
                      : "Off."}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {notificationsEnabled && permission === "granted" && (
                <button
                  type="button"
                  onClick={onSendTest}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:border-emerald-400 hover:text-emerald-300"
                >
                  Send test
                </button>
              )}
              <button
                type="button"
                role="switch"
                aria-checked={notificationsEnabled}
                aria-label="Toggle browser notifications"
                onClick={() => onToggleNotifications(!notificationsEnabled)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                  notificationsEnabled ? "bg-emerald-500" : "bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    notificationsEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

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
  title, hint, helpId, children,
}: { title: string; hint?: string; helpId?: SettingHelpId; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-1.5">
        <h2 className="font-mono text-xs uppercase tracking-widest text-slate-400">{title}</h2>
        {helpId && <SettingHelp id={helpId} />}
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label, value, onChange, suffix, step, min,
}: { label: string; value: string; onChange: (v: string) => void; suffix?: string; step?: string; min?: string }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-slate-400">{label}</span>
      <span className="mt-1 flex items-center rounded-md border border-slate-700 bg-slate-950 focus-within:border-emerald-400">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent px-3 py-2 text-slate-100 outline-none"
        />
        {suffix && <span className="px-3 text-sm text-slate-500">{suffix}</span>}
      </span>
    </label>
  );
}
