import { memo } from 'react';
import type { Person } from '../engine/types';
import { ageOf, alive } from '../engine/util';

const SKIN = ['#f6d5bd', '#eabf9c', '#d39d74', '#b07650', '#8a5636', '#5c3824'];
const HAIR = ['#1e1a17', '#4a2f1f', '#7a4a28', '#b5783c', '#dcb56b', '#a3381f'];
const EYES = ['#3b2a20', '#2d5a7b', '#3f6b3a', '#6b4b2a'];
const SHIRT = ['#5b7fd6', '#d66b5b', '#4fa37f', '#c49a3c', '#8a63c9', '#3c9ac4'];

function mix(hex: string, toward: string, t: number) {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(toward.slice(1), 16);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

const hash = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

interface Props {
  person: Person;
  year: number;
  size?: number;
}

/** Generated portrait. Proportions, hair color and lines change with age. */
export const Avatar = memo(function Avatar({ person, year, size = 56 }: Props) {
  const age = ageOf(person, year);
  const L = person.looks;
  const skin = SKIN[L.skin % SKIN.length];
  const gray = Math.max(0, Math.min(1, (age - 45) / 30));
  const hair = mix(HAIR[L.hairColor % HAIR.length], '#d8d8d8', gray);
  const happy = person.stats.happiness;
  const smile = (happy - 50) / 6; // mouth curvature
  const isKid = age < 13;
  const isBaby = age < 3;
  const headR = isBaby ? 20 : isKid ? 21 : 19;
  const headY = isBaby ? 52 : isKid ? 47 : 42;
  const shirt = SHIRT[hash(person.id) % SHIRT.length];
  const bald = L.hairStyle === 3 && person.sex === 'M' && age > 40;
  const style = isBaby ? -1 : bald ? 3 : L.hairStyle % 3;
  const dead = !alive(person);

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={`${person.firstName}, age ${age}`}
      style={{ filter: dead ? 'grayscale(1) opacity(0.7)' : undefined, flexShrink: 0 }}
    >
      <circle cx="50" cy="50" r="50" fill="var(--avatar-bg)" />
      {/* long hair behind the head */}
      {style === 1 && <path d={`M${50 - headR - 3} ${headY} Q50 ${headY - headR - 14} ${50 + headR + 3} ${headY} L${50 + headR + 1} ${headY + 26} L${50 - headR - 1} ${headY + 26} Z`} fill={hair} />}
      {/* shoulders */}
      <path d={`M${isKid ? 24 : 18} 100 Q${isKid ? 26 : 20} ${headY + headR + 6} 50 ${headY + headR + 4} Q${isKid ? 74 : 80} ${headY + headR + 6} ${isKid ? 76 : 82} 100 Z`} fill={shirt} />
      <rect x="45" y={headY + headR - 4} width="10" height="9" fill={skin} />
      <circle cx="50" cy={headY} r={headR} fill={skin} />
      {/* hair on top */}
      {style === 0 && <path d={`M${50 - headR} ${headY - 2} Q50 ${headY - headR - 10} ${50 + headR} ${headY - 2} Q50 ${headY - headR + 2} ${50 - headR} ${headY - 2} Z`} fill={hair} />}
      {style === 1 && <path d={`M${50 - headR} ${headY} Q50 ${headY - headR - 10} ${50 + headR} ${headY} Q${50 + 4} ${headY - headR + 6} ${50 - headR} ${headY} Z`} fill={hair} />}
      {style === 2 && (
        <g fill={hair}>
          {[-14, -7, 0, 7, 14].map((dx) => (
            <circle key={dx} cx={50 + dx} cy={headY - headR + 4 + Math.abs(dx) / 3} r="7" />
          ))}
        </g>
      )}
      {style === 3 && <path d={`M${50 - headR} ${headY + 2} Q${50 - headR} ${headY - 8} ${50 - headR + 5} ${headY - 8} M${50 + headR} ${headY + 2} Q${50 + headR} ${headY - 8} ${50 + headR - 5} ${headY - 8}`} stroke={hair} strokeWidth="4" fill="none" />}
      {isBaby && <path d={`M47 ${headY - headR + 2} q3 -6 6 0`} stroke={hair} strokeWidth="2" fill="none" />}
      {/* eyes */}
      <circle cx={50 - 7} cy={headY + 1} r={isKid ? 2.6 : 2.2} fill={EYES[L.eyes % EYES.length]} />
      <circle cx={50 + 7} cy={headY + 1} r={isKid ? 2.6 : 2.2} fill={EYES[L.eyes % EYES.length]} />
      {/* brows */}
      {!isBaby && (
        <g stroke={hair} strokeWidth="1.6" strokeLinecap="round">
          <line x1={50 - 10} y1={headY - 5} x2={50 - 4} y2={headY - 5.5} />
          <line x1={50 + 4} y1={headY - 5.5} x2={50 + 10} y2={headY - 5} />
        </g>
      )}
      {/* mouth */}
      <path d={`M${50 - 6} ${headY + 9} Q50 ${headY + 9 + smile} ${50 + 6} ${headY + 9}`} stroke="#7a3b2e" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {/* age lines */}
      {age >= 55 && (
        <g stroke="rgba(0,0,0,0.25)" strokeWidth="0.9" fill="none">
          <path d={`M${50 - 13} ${headY + 2} l-2 2`} />
          <path d={`M${50 + 13} ${headY + 2} l2 2`} />
          {age >= 68 && <path d={`M${50 - 8} ${headY - 9} q8 -2 16 0`} />}
        </g>
      )}
    </svg>
  );
});
