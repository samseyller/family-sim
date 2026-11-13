/**
 * Generated cat portraits. Breed sets the head shape, ears, fluff and markings (tabby stripes,
 * colorpoint masks, Maine Coon ear tufts, the flat Persian face); the coat and eye color are
 * fixed for life, so the same cat is recognizable as a kitten, an adult and a senior. Kittens
 * have big heads and eyes; seniors go grey around the face. A cat close to the family squints
 * contentedly (the "slow blink").
 */
import { CAT_BREEDS, type CatBreed } from '../content/cats';
import { catStage, type CatStage } from '../engine/cats';
import type { Cat } from '../engine/types';

const NOSE = '#d98c8c';
const PINK = '#eeb4b0';
const GREY = '#d9d6d0';
const EYES = ['#86b04a', '#d8a23a', '#a7c45a', '#c98b2e'];
const BLUE = '#5b8fd6';
const COLLARS = ['#d64545', '#3b6fd6', '#2f9e6a', '#8a4fd1'];
const hash = (s: string) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 11);

export interface CatLook {
  breed: CatBreed;
  coat: number;
  stage: CatStage;
  /** 0–100: content cats squint; unhappy cats flatten their ears a little. */
  bond: number;
  seed: string;
}

export const catLookOf = (c: Cat, year: number): CatLook => ({ breed: c.breed, coat: c.coat, stage: catStage(c, year), bond: c.bond, seed: c.id });

const MIRROR = 'translate(120,0) scale(-1,1)';

export function CatFace({ look, size = 72, title }: { look: CatLook; size?: number; title?: string }) {
  const def = CAT_BREEDS[look.breed];
  const { fur, dark, light } = def.coats[look.coat % def.coats.length];
  const h = hash(look.seed);
  const b = look.breed;
  const kitten = look.stage === 'kitten';
  const senior = look.stage === 'senior';
  const content = look.bond >= 60;
  const grumpy = look.bond < 25;
  const point = b === 'siamese' || b === 'ragdoll';
  const striped = (b === 'tabby' && look.coat <= 1) || b === 'maine_coon';
  const tuxedo = b === 'tabby' && look.coat === 3;
  const flat = b === 'persian';
  const long = def.longHair;

  const head = { cy: kitten ? 62 : 60, rx: flat ? 31 : b === 'maine_coon' ? 30 : 28, ry: flat ? 27 : 26 };
  if (kitten) { head.rx += 3; head.ry += 3; }
  const eyeY = head.cy - 3;
  const eyeDX = flat ? 12 : 11;
  const eyeR = kitten ? 6 : 5;
  const eye = def.blueEyes ? BLUE : EYES[h % EYES.length];
  const noseY = head.cy + (flat ? 6 : 9);
  // Ears: tall and pointed (Siamese tallest), small and rounded on Persians; flatter when grumpy.
  const earTop = (flat ? 25 : b === 'siamese' ? 14 : 20) + (kitten ? 4 : 0) + (grumpy ? 5 : 0);
  const earOut = flat ? 34 : b === 'siamese' ? 30 : 32;
  const ear = `M${earOut} ${head.cy - 10} L${earOut + 4} ${earTop} L${earOut + 20} ${head.cy - head.ry + 4} Z`;
  const earIn = `M${earOut + 4} ${head.cy - 12} L${earOut + 6} ${earTop + 7} L${earOut + 16} ${head.cy - head.ry + 6} Z`;
  const bodyRx = kitten ? 26 : long ? 38 : 33;

  return (
    <svg className="dog-face" width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={title ?? `${def.label} (${look.stage})`}>
      {title && <title>{title}</title>}
      {/* Body / chest (long hair: a fluffy bib) */}
      <ellipse cx="60" cy="118" rx={bodyRx} ry={kitten ? 20 : 26} fill={fur} />
      {(tuxedo || long || point) && <ellipse cx="60" cy="114" rx={kitten ? 11 : 15} ry={kitten ? 14 : 18} fill={light} />}
      {h % 3 === 0 && !kitten && <g>
        <path d={`M${60 - bodyRx * 0.55} 92 Q60 99 ${60 + bodyRx * 0.55} 92`} stroke={COLLARS[h % COLLARS.length]} strokeWidth="4" fill="none" strokeLinecap="round" />
        <circle cx="60" cy="99" r="3.2" fill="#e8c547" stroke="#b8952a" strokeWidth="0.8" />
      </g>}

      {/* Ears (behind the head) */}
      {[undefined, MIRROR].map((t, i) => (
        <g key={i} transform={t}>
          <path d={ear} fill={point ? dark : fur} />
          <path d={earIn} fill={PINK} opacity={0.8} />
          {b === 'maine_coon' && <path d={`M${earOut + 4} ${earTop} l-2 -7 M${earOut + 4} ${earTop} l1 -8 M${earOut + 4} ${earTop} l4 -6`} stroke={dark} strokeWidth="1.4" strokeLinecap="round" />}
        </g>
      ))}

      {/* Cheek ruff for long-haired cats */}
      {long && (
        <path d={`M${60 - head.rx - 4} ${head.cy} q-2 10 4 16 q2 8 10 9 q6 6 14 4 q6 4 12 0 q8 2 14 -4 q8 -1 10 -9 q6 -6 4 -16 Z`} fill={fur} />
      )}
      {/* Head */}
      <ellipse cx="60" cy={head.cy} rx={head.rx} ry={head.ry} fill={fur} />
      {striped && (
        <g stroke={dark} strokeWidth="2.2" strokeLinecap="round" fill="none" opacity={0.8}>
          {/* The tabby "M" on the forehead, and cheek stripes */}
          <path d={`M51 ${head.cy - 13} l3 -8 l3 6 l3 -6 l3 6 l3 -6 l3 8`} />
          <path d={`M${60 - head.rx + 3} ${head.cy + 2} l8 1 M${60 - head.rx + 4} ${head.cy + 7} l7 0`} />
          <path d={`M${60 + head.rx - 3} ${head.cy + 2} l-8 1 M${60 + head.rx - 4} ${head.cy + 7} l-7 0`} />
        </g>
      )}
      {/* Muzzle: light fur; colorpoint breeds get a dark mask */}
      <ellipse cx="60" cy={noseY + 3} rx={flat ? 13 : 12} ry={flat ? 8 : 9} fill={tuxedo || long ? light : fur} />
      {point && <ellipse cx="60" cy={noseY} rx={flat ? 15 : 14} ry={13} fill={dark} opacity={0.75} />}
      {senior && <ellipse cx="60" cy={noseY + 2} rx="13" ry="8" fill={GREY} opacity={0.55} />}

      {/* Eyes: almond shapes with slit pupils; content cats squint */}
      {[-1, 1].map((side) => {
        const x = 60 + side * eyeDX;
        return content ? (
          <g key={side}>
            <path d={`M${x - eyeR} ${eyeY} Q${x} ${eyeY - eyeR * 0.9} ${x + eyeR} ${eyeY} Q${x} ${eyeY + eyeR * 0.35} ${x - eyeR} ${eyeY} Z`} fill={eye} />
            <path d={`M${x - eyeR} ${eyeY} Q${x} ${eyeY - eyeR * 0.9} ${x + eyeR} ${eyeY}`} stroke="#2a1b12" strokeWidth="1.4" fill="none" />
          </g>
        ) : (
          <g key={side}>
            <ellipse cx={x} cy={eyeY} rx={eyeR} ry={eyeR * 0.85} fill={eye} stroke="#2a1b12" strokeWidth="0.8" />
            <ellipse cx={x} cy={eyeY} rx={kitten ? 2.2 : 1.4} ry={eyeR * 0.75} fill="#14100e" />
            <circle cx={x + 1.6} cy={eyeY - 1.8} r="1.2" fill="#fff" />
            {senior && <path d={`M${x - 5} ${eyeY - eyeR - 2} q5 -2 10 0`} stroke={GREY} strokeWidth="1.8" fill="none" />}
          </g>
        );
      })}

      {/* Nose, mouth and whiskers */}
      <path d={`M56 ${noseY - 1.5} L64 ${noseY - 1.5} L60 ${noseY + 2.5} Z`} fill={NOSE} />
      <path d={`M60 ${noseY + 2.5} L60 ${noseY + 5} M60 ${noseY + 5} q-3 3 -6 1 M60 ${noseY + 5} q3 3 6 1`} stroke="#5a3a34" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <g stroke={senior ? '#fff' : '#f4f1ec'} strokeWidth="0.9" opacity={0.9} strokeLinecap="round">
        {[-1, 1].map((side) => (
          <g key={side}>
            <path d={`M${60 + side * 9} ${noseY + 2} l${side * 20} -4`} />
            <path d={`M${60 + side * 9} ${noseY + 4} l${side * 21} 1`} />
            <path d={`M${60 + side * 9} ${noseY + 6} l${side * 19} 5`} />
          </g>
        ))}
      </g>
    </svg>
  );
}

export function CatAvatar({ cat, year, size = 72 }: { cat: Cat; year: number; size?: number }) {
  return <CatFace look={catLookOf(cat, year)} size={size} title={`${cat.name}, ${CAT_BREEDS[cat.breed].label}`} />;
}
