// When the running code was last updated, for the "Last updated …" footer line.
//
// `NEXT_PUBLIC_BUILD_DATE` is inlined at build time by next.config.mjs from the
// HEAD commit's date (see resolveBuildDate there), so this is a constant in the
// bundle — no request-time work, and the server and client always agree.

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export interface BuildInfo {
  /** Full ISO timestamp — for the <time dateTime> attribute and tooltip. */
  iso: string;
  /** Short human date, e.g. "14 Aug 2026". */
  label: string;
}

/**
 * Returns null when the stamp is missing or unparseable, so callers can simply
 * omit the line rather than render "Invalid Date".
 *
 * The date is formatted by hand rather than with toLocaleDateString: the output
 * must be byte-identical on the server and in the browser or React reports a
 * hydration mismatch, and locale data is not guaranteed to match across the two.
 *
 * The label is read off the leading YYYY-MM-DD of the stamp rather than derived
 * from a Date, so it shows the calendar day the commit was actually made in the
 * committer's own timezone. Converting to UTC first would roll an evening commit
 * (say 20:00 at UTC−5) onto the following day — "pushed today" must not display
 * as tomorrow.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

export function getBuildInfo(): BuildInfo | null {
  const raw = process.env.NEXT_PUBLIC_BUILD_DATE;
  if (!raw) return null;

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;

  const m = ISO_DATE.exec(raw);
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return null;

  return { iso: d.toISOString(), label: `${Number(m[3])} ${month} ${m[1]}` };
}
