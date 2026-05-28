import universe from "./universe.json";

export type IndexName = "sp500" | "nasdaq100";

export interface UniverseFile {
  sp500: string[];
  nasdaq100: string[];
  etfs: string[];
}

const data = universe as unknown as UniverseFile;

const merged = Array.from(
  new Set<string>([...data.sp500, ...data.nasdaq100, ...data.etfs])
).sort();

export const UNIVERSE: readonly string[] = Object.freeze(merged);

const sp500Set = new Set(data.sp500.map((t) => t.toUpperCase()));
const nasdaq100Set = new Set(data.nasdaq100.map((t) => t.toUpperCase()));

export function getIndicesFor(ticker: string): IndexName[] {
  const t = ticker.toUpperCase();
  const indices: IndexName[] = [];
  if (sp500Set.has(t)) indices.push("sp500");
  if (nasdaq100Set.has(t)) indices.push("nasdaq100");
  return indices;
}

export function universeMinus(exclude: readonly string[]): string[] {
  if (exclude.length === 0) return [...UNIVERSE];
  const skip = new Set(exclude.map((t) => t.toUpperCase()));
  return UNIVERSE.filter((t) => !skip.has(t));
}
