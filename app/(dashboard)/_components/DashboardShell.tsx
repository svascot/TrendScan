"use client";

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
  { href: "/portfolio", label: "Portfolio", icon: "▣" },
  { href: "/settings", label: "Settings", icon: "⚙" },
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
    <div className="flex min-h-screen flex-col bg-slate-900 lg:flex-row">
      <aside className="border-b border-slate-800 bg-slate-950/40 lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 px-6 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500 font-mono text-sm font-bold text-slate-950">
            T
          </span>
          <span className="font-mono text-lg font-semibold tracking-tight text-slate-100">
            TrendScan
          </span>
        </div>
        <nav className="flex gap-1 px-3 pb-4 lg:flex-col lg:gap-0.5 lg:px-3 lg:pb-3">
          {NAV.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm transition lg:flex-none ${
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
            onClick={logOut}
            className="flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-100 lg:flex-none lg:mt-4"
          >
            <span className="font-mono text-base text-slate-500">↗</span>
            Log Out
          </button>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/70 px-6 py-4 backdrop-blur">
          <h1 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-400">
            {pageTitle}
          </h1>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-300 sm:inline">{firstName}</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/20 font-mono text-sm font-semibold text-emerald-300 ring-1 ring-emerald-500/40">
              {initials}
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-x-auto px-6 py-6">{children}</main>

        <footer className="border-t border-slate-800 bg-slate-950/40 px-6 py-3 text-center text-xs text-slate-500">
          Created by{" "}
          <a
            href="https://santiagovasco.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:underline"
          >
            santiagovasco.com
          </a>
        </footer>
      </div>
    </div>
  );
}
