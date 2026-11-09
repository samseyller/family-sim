/**
 * Appearance genome. Each gene is a small integer; children inherit each gene
 * from one parent (with a small mutation rate), so families visibly resemble
 * each other across generations.
 */
import type { Rng } from './rng';
import type { Looks } from './types';

/** Gene → number of variants. Order matters only for documentation. */
export const GENES: Record<keyof Looks, number> = {
  skin: 6,
  hairColor: 6,
  hairStyle: 4,
  eyes: 4,
  face: 3, //       round, oval, square
  nose: 3, //       button, straight, broad
  facialHair: 3, // none, stubble/mustache, full beard (expressed in adult men)
  glasses: 3, //    never, from middle age, from childhood
  freckles: 2,
};

const KEYS = Object.keys(GENES) as (keyof Looks)[];
const MUTATION = 0.08;

export function randomLooks(rng: Rng): Looks {
  const out = {} as Looks;
  for (const k of KEYS) out[k] = rng.int(0, GENES[k] - 1);
  // Glasses and freckles are less common traits.
  out.glasses = rng.chance(0.65) ? 0 : rng.chance(0.75) ? 1 : 2;
  out.freckles = rng.chance(0.8) ? 0 : 1;
  return out;
}

export function inheritLooks(rng: Rng, a: Looks, b: Looks): Looks {
  const fresh = randomLooks(rng);
  const out = {} as Looks;
  for (const k of KEYS) out[k] = rng.chance(MUTATION) ? fresh[k] : rng.chance(0.5) ? a[k] : b[k];
  return out;
}

/** Deterministic hash, used to fill genes for people created before a gene existed. */
function hash(str: string, salt: string) {
  let h = 2166136261;
  for (const ch of salt + str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** Complete a partial genome (older saves) deterministically from a stable id. */
export function fillLooks(partial: Partial<Looks> | undefined, id: string): Looks {
  const out = {} as Looks;
  for (const k of KEYS) {
    const v = partial?.[k];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < GENES[k]) out[k] = v;
    else if (k === 'glasses') out[k] = hash(id, k) % 10 < 6 ? 0 : hash(id, k) % 10 < 9 ? 1 : 2;
    else if (k === 'freckles') out[k] = hash(id, k) % 5 === 0 ? 1 : 0;
    else out[k] = hash(id, k) % GENES[k];
  }
  return out;
}
