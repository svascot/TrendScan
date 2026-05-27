import universe from "./universe.json";

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

export function universeMinus(exclude: readonly string[]): string[] {
  if (exclude.length === 0) return [...UNIVERSE];
  const skip = new Set(exclude.map((t) => t.toUpperCase()));
  return UNIVERSE.filter((t) => !skip.has(t));
}
