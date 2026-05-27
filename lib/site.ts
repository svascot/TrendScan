/**
 * Canonical public origin for the app.
 *
 * Used for things that must survive across environments — most importantly the
 * `emailRedirectTo` value baked into Supabase confirmation emails, which is
 * permanent once an email is sent. Falling back to `window.location.origin`
 * means anyone who signs up from localhost gets an unusable confirmation link
 * in their inbox.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL  — explicit override (recommended, set in Vercel)
 *   2. NEXT_PUBLIC_VERCEL_URL — Vercel auto-injects the deployment hostname
 *   3. window.location.origin — browser fallback for local dev
 *   4. http://localhost:3000  — server-side last-resort default
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return stripTrailingSlash(explicit);

  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  if (typeof window !== "undefined") return window.location.origin;

  return "http://localhost:3000";
}

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}
