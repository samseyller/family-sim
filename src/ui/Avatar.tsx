import { memo } from 'react';
import type { Looks, Person } from '../engine/types';
import { ageOf, alive } from '../engine/util';

const SKIN = ['#f6d5bd', '#eabf9c', '#d39d74', '#b07650', '#8a5636', '#5c3824'];
const HAIR = ['#1e1a17', '#4a2f1f', '#7a4a28', '#b5783c', '#dcb56b', '#a3381f'];
const EYES = ['#3b2a20', '#2d5a7b', '#3f6b3a', '#6b4b2a'];
const SHIRT = ['#5b7fd6', '#d66b5b', '#4fa37f', '#c49a3c', '#8a63c9', '#3c9ac4'];

/** Everything the portrait needs. Archived family members render from this too. */
export interface AvatarSpec {
  id: string;
  name: string;
  sex: 'F' | 'M';
  looks: Looks;
  age: number;
  happiness: number;
  stress: number;
  dead: boolean;
}

export function specOf(p: Person, year: number): AvatarSpec {
  return {
    id: p.id,
    name: p.firstName,
    sex: p.sex,
    looks: p.looks,
    age: ageOf(p, year),
    happiness: p.stats.happiness,
    stress: p.stats.stress,
    dead: !alive(p),
  };
}

function mix(hex: string, toward: string, t: number) {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(toward.slice(1), 16);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

const hash = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Generated portrait. Proportions, hair, lines, glasses and expression change with age and mood. */
export const AvatarFace = memo(function AvatarFace({ spec, size = 56 }: { spec: AvatarSpec; size?: number }) {
  const { age, looks: L, sex } = spec;
  const skin = SKIN[L.skin % SKIN.length];
  const skinShade = mix(SKIN[L.skin % SKIN.length], '#000000', 0.12);
  const gray = Math.max(0, Math.min(1, (age - 45) / 30));
  const hair = mix(HAIR[L.hairColor % HAIR.length], '#d8d8d8', gray);
  const isBaby = age < 3;
  const isKid = age < 13;
  const isSenior = age >= 65;
  const r = isBaby ? 20 : isKid ? 20.5 : 18.5; // head radius
  const cx = 50;
  const cy = isBaby ? 52 : isKid ? 47 : 42;
  const shirt = SHIRT[hash(spec.id) % SHIRT.length];

  // Head shape from the face gene.
  const rx = L.face === 1 ? r * 0.9 : r;
  const ry = L.face === 1 ? r * 1.08 : r;
  const head = L.face === 2
    ? <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2.02} rx={r * 0.55} fill={skin} />
    : <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={skin} />;

  // Hair style: 0 short, 1 long, 2 curly, 3 bald pattern (men 40+) or bun (others).
  const receding = sex === 'M' && age > 55 && L.hairStyle !== 1;
  let style = isBaby ? -1 : L.hairStyle % 4;
  if (style === 3 && !(sex === 'M' && age > 40)) style = sex === 'F' ? 4 : 0; // 4 = bun
  const top = cy - ry;

  /**
   * Hair cap over the crown, `pad` px outside the head, ending at `baseY` on both sides,
   * with a curved hairline through (innerX, innerY). It follows the head's outline:
   * square faces are rounded rectangles, so the cap traces their corners; round and oval
   * heads use a quadratic whose peak (halfway to the control point) clears the crown.
   */
  const capPath = (pad: number, baseY: number, innerX: number, innerY: number) => {
    const hairline = `Q${innerX} ${innerY} ${cx - rx - pad} ${baseY} Z`;
    if (L.face === 2) {
      const k = r * 0.55; // matches the head rect's corner radius
      const t = cy - r - pad;
      return `M${cx - r - pad} ${baseY} L${cx - r - pad} ${cy - r + k} Q${cx - r - pad} ${t} ${cx - r + k} ${t} `
        + `L${cx + r - k} ${t} Q${cx + r + pad} ${t} ${cx + r + pad} ${cy - r + k} L${cx + r + pad} ${baseY} ${hairline}`;
    }
    return `M${cx - rx - pad} ${baseY} Q${cx} ${cy - 2 * ry - 4 - pad} ${cx + rx + pad} ${baseY} ${hairline}`;
  };

  const happy = spec.dead ? 50 : spec.happiness;
  const smile = (happy - 50) / 6;
  const worried = !spec.dead && spec.stress > 70;
  const eyeY = cy + 1;
  const eyeR = isKid ? 2.6 : 2.2;
  const glasses = !isBaby && (L.glasses === 2 ? age >= 8 : L.glasses === 1 ? age >= 45 : false);
  const beard = sex === 'M' && age >= 18 ? L.facialHair : 0;
  const freckles = L.freckles === 1 && age >= 4 && age < 50;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={`${spec.name}, age ${age}${spec.dead ? ', deceased' : ''}`}
      style={{ filter: spec.dead ? 'grayscale(1) opacity(0.75)' : undefined, flexShrink: 0 }}
    >
      <circle cx="50" cy="50" r="50" fill="var(--avatar-bg)" />

      {/* long hair and bun sit behind the head */}
      {style === 1 && (
        <path d={`M${cx - r - 3} ${cy} Q${cx} ${top - 14} ${cx + r + 3} ${cy} L${cx + r + 1} ${cy + (age > 60 ? 18 : 26)} L${cx - r - 1} ${cy + (age > 60 ? 18 : 26)} Z`} fill={hair} />
      )}
      {style === 4 && <circle cx={cx} cy={top - 1} r="7" fill={hair} />}

      {/* body: tee for kids, collar for adults, cardigan for seniors */}
      <path d={`M${isKid ? 24 : 18} 100 Q${isKid ? 26 : 20} ${cy + r + 6} 50 ${cy + r + 4} Q${isKid ? 74 : 80} ${cy + r + 6} ${isKid ? 76 : 82} 100 Z`} fill={isSenior ? mix(shirt, '#8a7f72', 0.55) : shirt} />
      {!isKid && !isSenior && <path d={`M44 ${cy + r + 4} L50 ${cy + r + 12} L56 ${cy + r + 4}`} stroke="rgba(255,255,255,0.75)" strokeWidth="2" fill="none" />}
      {isSenior && <path d={`M47 ${cy + r + 4} L47 100 M53 ${cy + r + 4} L53 100`} stroke={shirt} strokeWidth="3" />}
      <rect x="45" y={cy + r - 4} width="10" height="9" fill={skin} />

      {/* ears, head */}
      {!isBaby && <circle cx={cx - rx} cy={cy + 2} r="3.2" fill={skinShade} />}
      {!isBaby && <circle cx={cx + rx} cy={cy + 2} r="3.2" fill={skinShade} />}
      {head}

      {/* hair on top */}
      {(style === 0 || style === 4) && !receding && <path d={capPath(0.5, cy - 1, cx, cy - ry * 0.95)} fill={hair} />}
      {style === 1 && <path d={capPath(1, cy + 1, cx + 5, cy - ry * 0.85)} fill={hair} />}
      {style === 2 && (
        <g fill={hair}>
          {[-14, -7, 0, 7, 14].map((dx) => <circle key={dx} cx={cx + dx} cy={top + 4 + Math.abs(dx) / 3} r={age > 60 ? 6 : 7} />)}
        </g>
      )}
      {(style === 3 || receding) && (
        <path d={`M${cx - r} ${cy + 2} Q${cx - r} ${cy - 8} ${cx - r + 6} ${cy - 9} M${cx + r} ${cy + 2} Q${cx + r} ${cy - 8} ${cx + r - 6} ${cy - 9}`} stroke={hair} strokeWidth="4" fill="none" strokeLinecap="round" />
      )}
      {isBaby && <path d={`M47 ${top + 2} q3 -6 6 0`} stroke={hair} strokeWidth="2" fill="none" />}

      {/* freckles */}
      {freckles && (
        <g fill={mix(skin, '#7a3b1e', 0.45)}>
          {[[-10, 6], [-7, 8], [-12, 9], [10, 6], [7, 8], [12, 9]].map(([dx, dy]) => <circle key={`${dx}${dy}`} cx={cx + dx} cy={cy + dy} r="0.9" />)}
        </g>
      )}

      {/* eyes and brows (brows tilt when stressed) */}
      <circle cx={cx - 7} cy={eyeY} r={eyeR} fill={EYES[L.eyes % EYES.length]} />
      <circle cx={cx + 7} cy={eyeY} r={eyeR} fill={EYES[L.eyes % EYES.length]} />
      {!isBaby && (
        <g stroke={hair} strokeWidth={sex === 'M' ? 2 : 1.5} strokeLinecap="round">
          <line x1={cx - 10} y1={cy - (worried ? 6 : 5)} x2={cx - 4} y2={cy - (worried ? 4 : 5.5)} />
          <line x1={cx + 4} y1={cy - (worried ? 4 : 5.5)} x2={cx + 10} y2={cy - (worried ? 6 : 5)} />
        </g>
      )}

      {/* nose: button, straight, broad */}
      {!isBaby && L.nose === 0 && <path d={`M${cx - 1.5} ${cy + 5} q1.5 1.5 3 0`} stroke={skinShade} strokeWidth="1.4" fill="none" strokeLinecap="round" />}
      {!isBaby && L.nose === 1 && <path d={`M${cx} ${cy + 1} L${cx - 1.5} ${cy + 5.5} L${cx + 1} ${cy + 5.5}`} stroke={skinShade} strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      {!isBaby && L.nose === 2 && <path d={`M${cx - 3} ${cy + 5} q3 2.5 6 0`} stroke={skinShade} strokeWidth="1.6" fill="none" strokeLinecap="round" />}

      {/* facial hair */}
      {beard === 2 && (
        <path d={`M${cx - r + 2} ${cy + 3} Q${cx - r + 3} ${cy + r + 2} ${cx} ${cy + r + 3} Q${cx + r - 3} ${cy + r + 2} ${cx + r - 2} ${cy + 3} Q${cx + 6} ${cy + 14} ${cx} ${cy + 13} Q${cx - 6} ${cy + 14} ${cx - r + 2} ${cy + 3} Z`} fill={hair} />
      )}
      {beard >= 1 && <path d={`M${cx - 6} ${cy + 8} Q${cx} ${cy + 6} ${cx + 6} ${cy + 8}`} stroke={hair} strokeWidth="2.4" fill="none" strokeLinecap="round" />}

      {/* mouth */}
      <path d={`M${cx - 6} ${cy + 10} Q${cx} ${cy + 10 + smile} ${cx + 6} ${cy + 10}`} stroke={beard === 2 ? '#f3e6dc' : '#7a3b2e'} strokeWidth="1.8" fill="none" strokeLinecap="round" />

      {/* glasses */}
      {glasses && (
        <g stroke="#2b2b2b" strokeWidth="1.3" fill="rgba(255,255,255,0.15)">
          <circle cx={cx - 7} cy={eyeY} r="4.6" />
          <circle cx={cx + 7} cy={eyeY} r="4.6" />
          <line x1={cx - 2.4} y1={eyeY} x2={cx + 2.4} y2={eyeY} />
        </g>
      )}

      {/* age lines */}
      {age >= 55 && (
        <g stroke="rgba(0,0,0,0.25)" strokeWidth="0.9" fill="none" strokeLinecap="round">
          <path d={`M${cx - 13} ${eyeY + 1} l-2.5 2`} />
          <path d={`M${cx + 13} ${eyeY + 1} l2.5 2`} />
          {age >= 68 && <path d={`M${cx - 8} ${cy - 10} q8 -2 16 0`} />}
          {age >= 80 && <path d={`M${cx - 10} ${cy + 8} q-1 3 1 5 M${cx + 10} ${cy + 8} q1 3 -1 5`} />}
        </g>
      )}
    </svg>
  );
});

/** Portrait for a living-or-dead person at a given year. */
export function Avatar({ person, year, size = 56 }: { person: Person; year: number; size?: number }) {
  return <AvatarFace spec={specOf(person, year)} size={size} />;
}
