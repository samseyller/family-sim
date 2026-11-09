import type { Hobby, Person } from '../engine/types';

export type JobSlot = 'full' | 'part';

export interface Career {
  id: string;
  name: string;
  icon: string;
  hours: JobSlot;
  /** Pay per year when working the expected blocks. */
  salary: number;
  /** Time blocks the job expects per year (level 1 for full-time). */
  blocks: number;
  stress: number;
  minSmarts: number;
  requires?: 'degree' | 'trade_cert';
  skill?: Hobby;
  minSkill?: number;
}

export const CAREERS: Career[] = [
  // Full-time
  { id: 'retail', name: 'Retail Associate', icon: '🛒', hours: 'full', salary: 32000, blocks: 4, stress: 4, minSmarts: 0 },
  { id: 'electrician', name: 'Electrician', icon: '🔌', hours: 'full', salary: 58000, blocks: 4, stress: 5, minSmarts: 30, requires: 'trade_cert' },
  { id: 'nurse', name: 'Nurse', icon: '🩺', hours: 'full', salary: 66000, blocks: 5, stress: 8, minSmarts: 50, requires: 'degree' },
  { id: 'developer', name: 'Software Developer', icon: '💻', hours: 'full', salary: 92000, blocks: 5, stress: 6, minSmarts: 62, requires: 'degree' },
  { id: 'musician', name: 'Musician', icon: '🎸', hours: 'full', salary: 34000, blocks: 4, stress: 3, minSmarts: 0, skill: 'music', minSkill: 55 },
  { id: 'coach', name: 'Sports Coach', icon: '🏅', hours: 'full', salary: 47000, blocks: 4, stress: 4, minSmarts: 0, skill: 'sports', minSkill: 55 },
  { id: 'designer', name: 'Graphic Designer', icon: '🎨', hours: 'full', salary: 61000, blocks: 4, stress: 5, minSmarts: 35, skill: 'art', minSkill: 50 },
  // Part-time: no degree/cert requirements, lower pay, 1–4 blocks (2 expected)
  { id: 'barista', name: 'Barista', icon: '☕', hours: 'part', salary: 15000, blocks: 2, stress: 3, minSmarts: 0 },
  { id: 'delivery', name: 'Delivery Driver', icon: '🚚', hours: 'part', salary: 17000, blocks: 2, stress: 4, minSmarts: 0 },
  { id: 'tutor', name: 'Tutor', icon: '📝', hours: 'part', salary: 21000, blocks: 2, stress: 2, minSmarts: 55 },
  { id: 'music_teacher', name: 'Music Teacher', icon: '🎹', hours: 'part', salary: 19000, blocks: 2, stress: 2, minSmarts: 0, skill: 'music', minSkill: 35 },
  { id: 'referee', name: 'Youth Referee', icon: '🏟️', hours: 'part', salary: 16000, blocks: 2, stress: 3, minSmarts: 0, skill: 'sports', minSkill: 30 },
  { id: 'illustrator', name: 'Freelance Illustrator', icon: '🖍️', hours: 'part', salary: 20000, blocks: 2, stress: 2, minSmarts: 0, skill: 'art', minSkill: 35 },
];

export const CAREER_BY_ID: Record<string, Career> = Object.fromEntries(CAREERS.map((c) => [c.id, c]));

export const LEVEL_TITLES = ['', 'Junior', 'Senior', 'Lead'];

/** Part-time work is capped at this many blocks per year. */
export const PART_TIME_MAX = 4;
/** Extra stress per year for holding a full-time and a part-time job at once. */
export const TWO_JOB_STRESS = 8;

export function qualifies(p: Person, c: Career) {
  if (p.stats.smarts < c.minSmarts) return false;
  if (c.requires && !p.flags[c.requires]) return false;
  if (c.skill && (p.skills[c.skill] ?? 0) < (c.minSkill ?? 0)) return false;
  return true;
}

export const salaryOf = (c: Career, level: number) =>
  c.hours === 'part' ? c.salary : Math.round(c.salary * (1 + 0.3 * (level - 1)));

/** Higher full-time levels pay more but demand more time. Part-time always expects 2. */
export const requiredBlocks = (c: Career, level: number) => (c.hours === 'part' ? c.blocks : c.blocks + (level - 1));

export function jobTitle(p: Person) {
  const part = p.partJobId ? CAREER_BY_ID[p.partJobId] : undefined;
  const partTxt = part ? `${part.name} (part-time)` : '';
  let main: string;
  if (p.retired) main = 'Retired';
  else if (p.studyingUntil) main = p.studyKind === 'university' ? 'University student' : 'Trade school student';
  else if (p.jobId) {
    const c = CAREER_BY_ID[p.jobId];
    main = `${p.jobLevel > 1 ? LEVEL_TITLES[p.jobLevel] + ' ' : ''}${c.name}`;
  } else main = part ? '' : 'Unemployed';
  return [main, partTxt].filter(Boolean).join(' + ');
}
