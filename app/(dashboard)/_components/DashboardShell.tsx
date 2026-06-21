"use client";

import type { ComponentType, SVGProps } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { firstNameFromEmail, initialsFromEmail } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import {
  GmmaIcon,
  LogoutIcon,
  PortfolioIcon,
  ScannerIcon,
  SettingsIcon,
  WatchlistIcon,
} from "./nav-icons";

interface Props {
  email: string | null;
  children: React.ReactNode;
}

type NavItem = {
  href: string;
  label: string;
  short: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const NAV: readonly NavItem[] = [
  { href: "/gmma-scanner", label: "GMMA Scanner", short: "GMMA", icon: GmmaIcon },
  { href: "/scanner", label: "Scanner", short: "Scanner", icon: ScannerIcon },
  { href: "/watchlist", label: "Watchlist", short: "Watch", icon: WatchlistIcon },
  { href: "/portfolio", label: "Portfolio", short: "Portfolio", icon: PortfolioIcon },
  { href: "/settings", label: "Settings", short: "Settings", icon: SettingsIcon },
] as const;

export function DashboardShell({ email, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  async function logOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const initials = initialsFromEmail(email);
  const firstName = firstNameFromEmail(email);
  const pageTitle = NAV.find((n) => pathname?.startsWith(n.href))?.label ?? "Dashboard";

  return (
    <div className="flex min-h-screen flex-col bg-ink lg:flex-row">
      {/* ───────── Desktop sidebar (md+) ───────── */}
      <aside className="hidden border-r border-hairline/70 bg-panel/40 lg:flex lg:w-64 lg:shrink-0 lg:flex-col">
        <Link href="/" className="flex items-center gap-3 px-6 py-6 transition-opacity hover:opacity-80">
          <Image
            src="/logo.png"
            alt="TrendScan — go to home"
            width={36}
            height={36}
            priority
            className="h-9 w-9 rounded-lg"
          />
          <span className="font-mono text-lg font-semibold tracking-tight text-slate-100">
            TrendScan
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map((item) => {
            const active = pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm tracking-[0.01em] transition-colors ${
                  active
                    ? "bg-emerald-500/10 text-emerald-300"
                    : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-100"
                }`}
              >
                <Icon
                  className={`h-[18px] w-[18px] transition-colors ${
                    active ? "text-emerald-400" : "text-slate-500 group-hover:text-slate-300"
                  }`}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pb-4">
          <button
            type="button"
            onClick={logOut}
            className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm tracking-[0.01em] text-slate-500 transition-colors hover:bg-slate-800/40 hover:text-slate-200"
          >
            <LogoutIcon className="h-[18px] w-[18px] text-slate-600 transition-colors group-hover:text-slate-300" />
            Log Out
          </button>
        </div>
      </aside>

      {/* ───────── Main column ───────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-hairline/70 bg-ink/80 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            {/* Brand lockup — mobile only (sidebar carries it on desktop) */}
            <Link href="/" aria-label="TrendScan — go to home" className="lg:hidden">
              <Image
                src="/logo.png"
                alt="TrendScan"
                width={28}
                height={28}
                priority
                className="h-7 w-7 rounded-md"
              />
            </Link>
            <h1 className="truncate font-mono text-[11px] uppercase tracking-[0.3em] text-slate-400 sm:text-xs">
              {pageTitle}
            </h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/settings"
              aria-label="Account settings"
              className="flex items-center gap-2 rounded-full transition-opacity hover:opacity-80 sm:gap-3"
            >
              <span className="hidden text-sm text-slate-300 sm:inline">{firstName}</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 font-mono text-sm font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
                {initials}
              </span>
            </Link>
            {/* Logout lives in the sidebar on desktop; surface it here on mobile */}
            <button
              type="button"
              onClick={logOut}
              aria-label="Log out"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-emerald-300 lg:hidden"
            >
              <LogoutIcon className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Extra bottom padding on mobile clears the fixed bottom nav */}
        <main className="flex-1 px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:pb-6">{children}</main>

        <footer className="space-y-1 border-t border-hairline/70 bg-panel/30 px-4 py-3 pb-28 text-center text-xs text-slate-500 sm:px-6 lg:pb-3">
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

      {/* ───────── Mobile bottom navigation (below md) ───────── */}
      <nav
        aria-label="Primary"
        className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-hairline/70 bg-slate-950/80 backdrop-blur-md lg:hidden"
      >
        <ul className="mx-auto flex h-16 max-w-md items-stretch">
          {NAV.map((item) => {
            const active = pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="flex h-full min-h-[44px] flex-col items-center justify-center gap-1 px-1 transition-colors"
                >
                  <Icon
                    className={`h-[22px] w-[22px] transition-colors ${
                      active ? "text-emerald-400" : "text-slate-500"
                    }`}
                  />
                  <span
                    className={`text-[10px] tracking-wide transition-colors ${
                      active ? "text-emerald-300" : "text-slate-500"
                    }`}
                  >
                    {item.short}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
