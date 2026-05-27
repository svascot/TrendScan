export function etoroLink(ticker: string): string {
  return `https://www.etoro.com/markets/${ticker.toLowerCase()}`;
}

export function initialsFromEmail(email: string | undefined | null): string {
  if (!email) return "??";
  const local = email.split("@")[0] ?? "";
  if (!local) return "??";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

export function firstNameFromEmail(email: string | undefined | null): string {
  if (!email) return "Trader";
  const local = email.split("@")[0] ?? "";
  if (!local) return "Trader";
  const parts = local.split(/[._-]+/).filter(Boolean);
  const first = parts[0] ?? local;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function formatPrice(n: number): string {
  return n.toFixed(2);
}

export function formatPct(n: number, withSign = false): string {
  const v = (n * 100).toFixed(2);
  if (withSign && !v.startsWith("-")) return `+${v}%`;
  return `${v}%`;
}
