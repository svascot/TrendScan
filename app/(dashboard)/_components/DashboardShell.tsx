"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { firstNameFromEmail, initialsFromEmail } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

interface Props {
  email: string | null;
  children: React.ReactNode;
}

const NAV = [
  { href: "/scanner", label: "Scanner", icon: "◎" },
  { href: "/watchlist", label: "Watchlist", icon: "★" },
  { href: "/portfolio", label: "Portfolio", icon: "▣" },
  { href: "/settings", label: "Settings", icon: "⚙" },
] as const;

export function DashboardShell({ email, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reloading, setReloading] = useState(false);

  async function hardReload() {
    if (reloading) return;
    setReloading(true);
    try {
      await fetch("/api/scan/bust", { method: "POST", cache: "no-store" });
    } catch {
      // ignore — still proceed with reload
    }
    window.location.reload();
  }

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  async function logOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const initials = initialsFromEmail(email);
  const firstName = firstNameFromEmail(email);
  const pageTitle = NAV.find((n) => pathname?.startsWith(n.href))?.label ?? "Dashboard";

  const navItems = (onItemClick?: () => void) => (
    <>
      {NAV.map((item) => {
        const active = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onItemClick}
            className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition ${
              active
                ? "bg-emerald-500/10 text-emerald-300"
                : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"
            }`}
          >
            <span className={`font-mono text-base ${active ? "text-emerald-400" : "text-slate-500"}`}>
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => {
          onItemClick?.();
          logOut();
        }}
        className="mt-2 flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-100"
      >
        <span className="font-mono text-base text-slate-500">↗</span>
        Log Out
      </button>
    </>
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden border-slate-800 bg-slate-950/40 lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:border-r">
        <div className="flex items-center gap-3 px-6 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500 font-mono text-sm font-bold text-slate-950">
            T
          </span>
          <span className="font-mono text-lg font-semibold tracking-tight text-slate-100">
            TrendScan
          </span>
        </div>
        <nav className="flex flex-col gap-0.5 px-3 pb-3">{navItems()}</nav>
      </aside>

      {/* Mobile drawer + backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm transition-opacity lg:hidden ${
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!drawerOpen}
        onClick={() => setDrawerOpen(false)}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80vw] flex-col border-r border-slate-800 bg-slate-950 shadow-2xl transition-transform duration-200 lg:hidden ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!drawerOpen}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500 font-mono text-sm font-bold text-slate-950">
              T
            </span>
            <span className="font-mono text-lg font-semibold tracking-tight text-slate-100">
              TrendScan
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition hover:border-slate-700 hover:text-slate-200"
          >
            <span className="font-mono text-base">×</span>
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4">
          {navItems(() => setDrawerOpen(false))}
        </nav>
        <div className="border-t border-slate-800 px-5 py-3 text-xs text-slate-500">
          Signed in as <span className="text-slate-300">{firstName}</span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/70 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-800 text-slate-300 transition hover:border-emerald-500/40 hover:text-emerald-300 lg:hidden"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <h1 className="truncate font-mono text-[11px] uppercase tracking-[0.3em] text-slate-400 sm:text-xs">
              {pageTitle}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={hardReload}
              disabled={reloading}
              aria-label="Hard reload (bypass cache)"
              title="Hard reload (bypass cache)"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-800 text-slate-300 transition hover:border-emerald-500/40 hover:text-emerald-300 disabled:opacity-60"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`h-4 w-4 ${reloading ? "animate-spin" : ""}`}
                aria-hidden
              >
                <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
            </button>
            <span className="hidden text-sm text-slate-300 sm:inline">{firstName}</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/20 font-mono text-sm font-semibold text-emerald-300 ring-1 ring-emerald-500/40">
              {initials}
            </span>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</main>

        <footer className="space-y-1 border-t border-slate-800 bg-slate-950/40 px-4 py-3 text-center text-xs text-slate-500 sm:px-6">
          <p>TrendScan is an informational tool. It does not execute trades and is not financial advice.</p>
          <p>
            Created by{" "}
            <a
              href="https://santiagovasco.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:underline"
            >
              santiagovasco.com
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
