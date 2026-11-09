/**
 * Generated dog portraits. Breed sets the head, ears, muzzle and markings; the dog's
 * coat and collar are fixed for life, so the same dog is recognizable as a puppy,
 * an adult and a senior. Puppies have bigger heads, eyes and ears; seniors go grey
 * around the muzzle and brows. A dog that's close to the family looks happy.
 */
import { BREEDS, type DogBreed } from '../content/dogs';
import { dogStage, type DogStage } from '../engine/dogs';
import type { Dog } from '../engine/types';

const COLLARS = ['#d64545', '#3b6fd6', '#2f9e6a', '#8a4fd1', '#e08a1e', '#d6458f'];
const NOSE = '#1d1a19';
const EYE = '#2a1b12';
const PINK = '#e9a6a0';
const GREY = '#d9d6d0';

/** Perceived lightness (0–255) of a #rrggbb color. */
const light = (hex: string) => { const n = parseInt(hex.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
const hash = (s: string) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);

export interface DogLook {
  breed: DogBreed;
  coat: number;
  stage: DogStage;
  /** 0–100; above 60 the tongue comes out, below 30 the brows droop. */
  bond: number;
  /** Stable per-dog details (collar color, chest spot). */
  seed: string;
}

export const lookOf = (d: Dog, year: number): DogLook => ({ breed: d.breed, coat: d.coat, stage: dogStage(d, year), bond: d.bond, seed: d.id });

/** Mirror a left-side shape to the right side of the 120-wide canvas. */
const MIRROR = 'translate(120,0) scale(-1,1)';

function Ears({ breed, fur, dark, puppy, front }: { breed: DogBreed; fur: string; dark: string; puppy: boolean; front: boolean }) {
  const erect = breed === 'shepherd' || breed === 'frenchie';
  if (erect === front) return null; // erect ears sit behind the head, drop ears hang in front
  let outer = '';
  let inner = '';
  let color = dark;
  switch (breed) {
    case 'labrador':
      outer = puppy ? 'M39 33 C27 35 20 50 23 66 C25 73 35 72 37 63 C39 54 40 44 42 37 Z' : 'M39 34 C29 36 23 50 25 63 C27 69 34 69 37 61 C39 53 40 44 42 38 Z';
      break;
    case 'golden':
      outer = 'M39 34 C26 36 18 54 20 74 C22 80 27 78 28 83 C31 87 35 81 37 77 C40 64 41 48 42 38 Z';
      if (puppy) outer = 'M39 33 C25 35 18 52 21 70 C23 76 28 75 30 78 C33 81 36 76 37 72 C40 60 41 46 42 37 Z';
      color = dark;
      break;
    case 'beagle':
      outer = puppy ? 'M38 35 C22 39 15 62 20 86 C24 97 37 94 39 80 C41 64 41 50 42 40 Z' : 'M38 36 C24 40 18 60 22 82 C25 92 36 90 38 78 C40 64 41 50 42 40 Z';
      color = fur;
      break;
    case 'shepherd':
      // Shepherd puppies' ears haven't stood up yet: the tips fold over.
      outer = puppy ? 'M35 42 L31 16 Q35 10 44 20 L52 31 Z' : 'M35 41 L30 5 L52 29 Z';
      inner = puppy ? 'M37 37 L34 20 Q37 17 42 22 L47 31 Z' : 'M37 35 L33 14 L47 30 Z';
      color = dark;
      break;
    case 'frenchie':
      outer = puppy ? 'M33 40 C21 32 18 9 30 4 C42 0 51 19 50 32 Z' : 'M34 38 C24 30 20 10 30 4 C40 0 50 18 50 30 Z';
      inner = puppy ? 'M35 33 C27 27 25 12 32 9 C39 7 45 21 45 29 Z' : 'M35 32 C29 26 27 13 32 9 C38 7 44 20 45 28 Z';
      color = fur;
      break;
  }
  return (
    <g>
      {[undefined, MIRROR].map((t, i) => (
        <g key={i} transform={t}>
          <path d={outer} fill={color} />
          {inner && <path d={inner} fill={breed === 'shepherd' ? '#8a5a4a' : PINK} opacity={0.85} />}
        </g>
      ))}
    </g>
  );
}

export function DogFace({ look, size = 72, title }: { look: DogLook; size?: number; title?: string }) {
  const def = BREEDS[look.breed];
  const coat = def.coats[look.coat % def.coats.length];
  const { fur, dark, muzzle } = coat;
  const h = hash(look.seed);
  const puppy = look.stage === 'puppy';
  const senior = look.stage === 'senior';
  const b = look.breed;

  // Proportions: puppies have bigger heads and eyes, shorter muzzles, smaller bodies.
  const head = { cx: 60, cy: puppy ? 54 : 52, rx: b === 'frenchie' ? 33 : b === 'shepherd' ? 27 : 30, ry: b === 'frenchie' ? 27 : 28 };
  if (puppy) { head.rx += 3; head.ry += 3; }
  const mz = {
    cy: b === 'shepherd' ? 73 : b === 'frenchie' ? 69 : 71,
    rx: b === 'frenchie' ? 16 : b === 'shepherd' ? 12 : b === 'golden' ? 14 : 15,
    ry: b === 'frenchie' ? 8 : b === 'shepherd' ? 13 : 11,
  };
  if (puppy) { mz.rx *= 0.9; mz.ry *= 0.78; mz.cy -= 2; }
  const eyeR = puppy ? 5.4 : 4.3;
  const eyeY = puppy ? 53 : 50;
  const eyeDX = b === 'frenchie' ? 14 : 12;
  const noseY = mz.cy - mz.ry * 0.45;
  const happy = look.bond >= 60;
  const sad = look.bond < 30;
  const collar = COLLARS[h % COLLARS.length];
  const chestSpot = b === 'labrador' && h % 3 === 0;
  const bodyRx = puppy ? 28 : 36;
  // Grey shows up on dark coats as light grey, on light coats as a darker silver.
  const grey = light(muzzle) > 170 ? '#a8a29a' : GREY;
  const darkFace = light(fur) < 80;

  return (
    <svg className="dog-face" width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={title ?? `${def.label} (${look.stage})`}>
      {title && <title>{title}</title>}
      {/* Body / chest */}
      <ellipse cx="60" cy="118" rx={bodyRx} ry={puppy ? 22 : 28} fill={fur} />
      {b === 'shepherd' && <path d={`M${60 - bodyRx} 116 Q60 92 ${60 + bodyRx} 116 L${60 + bodyRx} 120 L${60 - bodyRx} 120 Z`} fill={dark} />}
      {b === 'beagle' && <ellipse cx="60" cy="116" rx={puppy ? 11 : 14} ry={puppy ? 16 : 20} fill={muzzle} />}
      {b === 'beagle' && look.coat === 0 && <path d={`M${60 - bodyRx} 112 Q${60 - bodyRx + 8} 98 ${60 - 16} 100 L${60 - 18} 120 L${60 - bodyRx} 120 Z M${60 + bodyRx} 112 Q${60 + bodyRx - 8} 98 ${60 + 16} 100 L${60 + 18} 120 L${60 + bodyRx} 120 Z`} fill={dark} />}
      {b === 'golden' && <path d="M44 100 q4 8 8 0 q4 8 8 0 q4 8 8 0 q4 8 8 0 L76 120 L44 120 Z" fill={muzzle} opacity={0.8} />}
      {chestSpot && <ellipse cx="60" cy="108" rx="5" ry="4" fill="#f4efe6" />}
      {/* Collar and tag */}
      <path d={`M${60 - bodyRx * 0.62} ${puppy ? 84 : 86} Q60 ${puppy ? 92 : 95} ${60 + bodyRx * 0.62} ${puppy ? 84 : 86}`} stroke={collar} strokeWidth={puppy ? 4 : 5} fill="none" strokeLinecap="round" />
      <circle cx="60" cy={puppy ? 92 : 96} r={puppy ? 3 : 3.6} fill="#e8c547" stroke="#b8952a" strokeWidth="0.8" />

      <Ears breed={b} fur={fur} dark={dark} puppy={puppy} front={false} />
      {/* Head */}
      <ellipse cx={head.cx} cy={head.cy} rx={head.rx} ry={head.ry} fill={fur} />
      {b === 'shepherd' && <path d="M43 31 Q60 21 77 31 Q71 41 60 43 Q49 41 43 31 Z" fill={dark} opacity={0.9} />}
      {b === 'beagle' && <path d={`M56 ${head.cy - head.ry + 4} Q60 ${head.cy - head.ry + 2} 64 ${head.cy - head.ry + 4} L67 ${mz.cy - 6} L53 ${mz.cy - 6} Z`} fill={muzzle} />}
      {b === 'frenchie' && look.coat === 1 && (
        <g stroke={dark} strokeWidth="1.6" opacity={0.45} fill="none">
          <path d="M38 40 q4 6 2 12" /><path d="M46 32 q3 6 1 12" /><path d="M82 40 q-4 6 -2 12" /><path d="M74 32 q-3 6 -1 12" />
        </g>
      )}
      {/* Muzzle */}
      <ellipse cx="60" cy={mz.cy} rx={mz.rx} ry={mz.ry} fill={muzzle} />
      {b === 'frenchie' && <path d="M50 60 q10 -5 20 0" stroke={dark} strokeWidth="1.4" fill="none" opacity={0.6} />}
      {senior && <ellipse cx="60" cy={mz.cy - 2} rx={mz.rx * 0.95} ry={mz.ry * 0.85} fill={grey} opacity={0.6} />}
      <Ears breed={b} fur={fur} dark={dark} puppy={puppy} front />

      {/* Eyes, with brows (tan "eyebrow dots" on shepherds) */}
      {[-1, 1].map((side) => (
        <g key={side}>
          {b === 'shepherd' && <circle cx={60 + side * eyeDX} cy={eyeY - 7} r="3" fill={fur} />}
          {darkFace && <circle cx={60 + side * eyeDX} cy={eyeY} r={eyeR + 1.3} fill="#7a6656" />}
          <circle cx={60 + side * eyeDX} cy={eyeY} r={eyeR} fill={EYE} />
          <circle cx={60 + side * eyeDX + 1.4} cy={eyeY - 1.6} r={eyeR * 0.32} fill="#fff" />
          {senior && <path d={`M${60 + side * eyeDX - 5} ${eyeY - 3.5} q5 -2.5 10 0`} stroke={grey} strokeWidth="2" fill="none" />}
          {sad && <path d={`M${60 + side * (eyeDX + 5)} ${eyeY - 8} L${60 + side * (eyeDX - 4)} ${eyeY - 5}`} stroke={dark} strokeWidth="1.6" strokeLinecap="round" />}
        </g>
      ))}

      {/* Nose and mouth */}
      <ellipse cx="60" cy={noseY} rx={b === 'frenchie' ? 5.5 : 6} ry={b === 'frenchie' ? 3.6 : 4.2} fill={NOSE} />
      <ellipse cx="58.3" cy={noseY - 1.3} rx="1.6" ry="0.9" fill="#fff" opacity={0.5} />
      <path d={`M60 ${noseY + 3} L60 ${noseY + 6} M60 ${noseY + 6} q-5 4 -9 0 M60 ${noseY + 6} q5 4 9 0`} stroke={NOSE} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {happy && <path d={`M56 ${noseY + 8} q4 ${puppy ? 8 : 10} 8 0 Z`} fill={PINK} stroke="#c97b74" strokeWidth="0.8" />}
    </svg>
  );
}

export function DogAvatar({ dog, year, size = 72 }: { dog: Dog; year: number; size?: number }) {
  return <DogFace look={lookOf(dog, year)} size={size} title={`${dog.name}, ${BREEDS[dog.breed].label}`} />;
}
