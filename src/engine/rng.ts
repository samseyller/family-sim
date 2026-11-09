/** Seedable mulberry32 RNG whose full state is a single 32-bit integer we can save. */
export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(arr: readonly T[]): T;
  weighted<T>(items: readonly (readonly [T, number])[]): T | undefined;
  state(): number;
}

export function makeRng(state: number): Rng {
  let s = state >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weighted: (items) => {
      const total = items.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
      if (total <= 0) return undefined;
      let r = next() * total;
      for (const [item, w] of items) {
        r -= Math.max(0, w);
        if (r < 0) return item;
      }
      return items[items.length - 1][0];
    },
    state: () => s,
  };
}
