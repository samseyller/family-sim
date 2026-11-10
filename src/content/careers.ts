import type { Hobby, Person } from '../engine/types';

export type JobSlot = 'full' | 'part';

/** Industries: each city's job market favors some (see `industries` in content/cities.ts). */
export type Sector =
  | 'retail' | 'service' | 'hospitality' | 'transport' | 'trades' | 'health' | 'tech' | 'finance' | 'business'
  | 'education' | 'government' | 'creative' | 'entertainment' | 'legal' | 'energy' | 'science';

export interface Career {
  id: string;
  name: string;
  icon: string;
  hours: JobSlot;
  sector: Sector;
  /** Pay per year when working the expected blocks (before the city's pay index). */
  salary: number;
  /** Time blocks the job expects per year (level 1 for full-time). */
  blocks: number;
  stress: number;
  minSmarts: number;
  requires?: 'degree' | 'trade_cert' | 'top_degree';
  skill?: Hobby;
  /** Employer pension (defined benefit) for years of service. */
  pension?: boolean;
  minSkill?: number;
}

/**
 * Every job in the game. To add one: give it a unique id, an industry (`sector`), base pay,
 * the time blocks it expects, stress, and any requirement (smarts, a degree / trade
 * certificate / top-university degree, or a hobby skill). Which jobs are hiring in each city
 * comes from `engine/jobMarket.ts`.
 */
export const CAREERS: Career[] = [
  // ── Full-time: no qualifications ──
  { id: 'retail', name: 'Retail Associate', icon: '🛒', hours: 'full', sector: 'retail', salary: 32000, blocks: 4, stress: 4, minSmarts: 0 },
  { id: 'warehouse', name: 'Warehouse Worker', icon: '📦', hours: 'full', sector: 'transport', salary: 34000, blocks: 4, stress: 5, minSmarts: 0 },
  { id: 'hotel_staff', name: 'Hotel Front Desk', icon: '🛎️', hours: 'full', sector: 'hospitality', salary: 33000, blocks: 4, stress: 4, minSmarts: 0 },
  { id: 'store_manager', name: 'Store Manager', icon: '🏬', hours: 'full', sector: 'retail', salary: 52000, blocks: 5, stress: 6, minSmarts: 35 },
  { id: 'real_estate', name: 'Real Estate Agent', icon: '🏡', hours: 'full', sector: 'business', salary: 58000, blocks: 4, stress: 6, minSmarts: 35 },
  { id: 'hotel_manager', name: 'Hotel Manager', icon: '🏨', hours: 'full', sector: 'hospitality', salary: 62000, blocks: 5, stress: 6, minSmarts: 40 },
  // ── Trades (trade certificate) ──
  { id: 'electrician', name: 'Electrician', icon: '🔌', hours: 'full', sector: 'trades', salary: 58000, blocks: 4, stress: 5, minSmarts: 30, requires: 'trade_cert', pension: true },
  { id: 'plumber', name: 'Plumber', icon: '🪠', hours: 'full', sector: 'trades', salary: 62000, blocks: 4, stress: 5, minSmarts: 30, requires: 'trade_cert', pension: true },
  { id: 'carpenter', name: 'Carpenter', icon: '🪚', hours: 'full', sector: 'trades', salary: 54000, blocks: 4, stress: 5, minSmarts: 25, requires: 'trade_cert' },
  { id: 'mechanic', name: 'Mechanic', icon: '🔧', hours: 'full', sector: 'trades', salary: 50000, blocks: 4, stress: 4, minSmarts: 25, requires: 'trade_cert' },
  { id: 'chef', name: 'Chef', icon: '👩‍🍳', hours: 'full', sector: 'hospitality', salary: 44000, blocks: 5, stress: 7, minSmarts: 0, requires: 'trade_cert' },
  { id: 'truck_driver', name: 'Truck Driver', icon: '🚛', hours: 'full', sector: 'transport', salary: 54000, blocks: 5, stress: 6, minSmarts: 0, requires: 'trade_cert' },
  { id: 'dental_hygienist', name: 'Dental Hygienist', icon: '🦷', hours: 'full', sector: 'health', salary: 74000, blocks: 4, stress: 4, minSmarts: 45, requires: 'trade_cert' },
  { id: 'police', name: 'Police Officer', icon: '👮', hours: 'full', sector: 'government', salary: 64000, blocks: 5, stress: 8, minSmarts: 35, requires: 'trade_cert', pension: true },
  { id: 'firefighter', name: 'Firefighter', icon: '🚒', hours: 'full', sector: 'government', salary: 58000, blocks: 5, stress: 8, minSmarts: 30, requires: 'trade_cert', pension: true },
  { id: 'oil_rig', name: 'Oilfield Technician', icon: '🛢️', hours: 'full', sector: 'energy', salary: 72000, blocks: 5, stress: 7, minSmarts: 30, requires: 'trade_cert' },
  { id: 'pilot', name: 'Airline Pilot', icon: '✈️', hours: 'full', sector: 'transport', salary: 96000, blocks: 6, stress: 7, minSmarts: 65, requires: 'trade_cert', pension: true },
  // ── University degree ──
  { id: 'nurse', name: 'Nurse', icon: '🩺', hours: 'full', sector: 'health', salary: 66000, blocks: 5, stress: 8, minSmarts: 50, requires: 'degree', pension: true },
  { id: 'teacher', name: 'Teacher', icon: '🍎', hours: 'full', sector: 'education', salary: 52000, blocks: 4, stress: 6, minSmarts: 45, requires: 'degree', pension: true },
  { id: 'social_worker', name: 'Social Worker', icon: '🤲', hours: 'full', sector: 'government', salary: 50000, blocks: 4, stress: 7, minSmarts: 45, requires: 'degree', pension: true },
  { id: 'journalist', name: 'Journalist', icon: '📰', hours: 'full', sector: 'creative', salary: 55000, blocks: 5, stress: 6, minSmarts: 50, requires: 'degree' },
  { id: 'marketing', name: 'Marketing Manager', icon: '📣', hours: 'full', sector: 'business', salary: 78000, blocks: 5, stress: 6, minSmarts: 50, requires: 'degree' },
  { id: 'accountant', name: 'Accountant', icon: '📊', hours: 'full', sector: 'finance', salary: 71000, blocks: 5, stress: 5, minSmarts: 55, requires: 'degree' },
  { id: 'data_analyst', name: 'Data Analyst', icon: '📈', hours: 'full', sector: 'tech', salary: 82000, blocks: 5, stress: 5, minSmarts: 58, requires: 'degree' },
  { id: 'developer', name: 'Software Developer', icon: '💻', hours: 'full', sector: 'tech', salary: 92000, blocks: 5, stress: 6, minSmarts: 62, requires: 'degree' },
  { id: 'financial_analyst', name: 'Financial Analyst', icon: '💹', hours: 'full', sector: 'finance', salary: 95000, blocks: 5, stress: 7, minSmarts: 62, requires: 'degree' },
  { id: 'architect', name: 'Architect', icon: '📐', hours: 'full', sector: 'creative', salary: 88000, blocks: 5, stress: 6, minSmarts: 62, requires: 'degree' },
  { id: 'scientist', name: 'Research Scientist', icon: '🔬', hours: 'full', sector: 'science', salary: 90000, blocks: 5, stress: 5, minSmarts: 70, requires: 'degree' },
  { id: 'pharmacist', name: 'Pharmacist', icon: '💊', hours: 'full', sector: 'health', salary: 104000, blocks: 5, stress: 6, minSmarts: 72, requires: 'degree' },
  // ── Top university ──
  { id: 'doctor', name: 'Doctor', icon: '🩻', hours: 'full', sector: 'health', salary: 180000, blocks: 6, stress: 9, minSmarts: 78, requires: 'top_degree', pension: true },
  { id: 'lawyer', name: 'Lawyer', icon: '⚖️', hours: 'full', sector: 'legal', salary: 145000, blocks: 6, stress: 9, minSmarts: 72, requires: 'top_degree' },
  { id: 'engineer', name: 'Engineer', icon: '🏗️', hours: 'full', sector: 'tech', salary: 112000, blocks: 5, stress: 6, minSmarts: 70, requires: 'top_degree' },
  { id: 'petroleum_engineer', name: 'Petroleum Engineer', icon: '⛽', hours: 'full', sector: 'energy', salary: 125000, blocks: 6, stress: 7, minSmarts: 72, requires: 'top_degree' },
  // ── Talent (hobby skill) ──
  { id: 'musician', name: 'Musician', icon: '🎸', hours: 'full', sector: 'entertainment', salary: 34000, blocks: 4, stress: 3, minSmarts: 0, skill: 'music', minSkill: 55 },
  { id: 'coach', name: 'Sports Coach', icon: '🏅', hours: 'full', sector: 'education', salary: 47000, blocks: 4, stress: 4, minSmarts: 0, skill: 'sports', minSkill: 55, pension: true },
  { id: 'designer', name: 'Graphic Designer', icon: '🎨', hours: 'full', sector: 'creative', salary: 61000, blocks: 4, stress: 5, minSmarts: 35, skill: 'art', minSkill: 50 },
  { id: 'film_editor', name: 'Film Editor', icon: '🎬', hours: 'full', sector: 'entertainment', salary: 70000, blocks: 5, stress: 6, minSmarts: 40, skill: 'art', minSkill: 55 },
  { id: 'actor', name: 'Actor', icon: '🎭', hours: 'full', sector: 'entertainment', salary: 45000, blocks: 4, stress: 6, minSmarts: 0, skill: 'art', minSkill: 60 },
  // ── Part-time: lower pay, 1–4 blocks (2 expected) ──
  { id: 'barista', name: 'Barista', icon: '☕', hours: 'part', sector: 'service', salary: 15000, blocks: 2, stress: 3, minSmarts: 0 },
  { id: 'cashier', name: 'Cashier', icon: '🧾', hours: 'part', sector: 'retail', salary: 14000, blocks: 2, stress: 3, minSmarts: 0 },
  { id: 'server', name: 'Restaurant Server', icon: '🍽️', hours: 'part', sector: 'hospitality', salary: 18000, blocks: 2, stress: 4, minSmarts: 0 },
  { id: 'bartender', name: 'Bartender', icon: '🍸', hours: 'part', sector: 'hospitality', salary: 20000, blocks: 2, stress: 4, minSmarts: 0 },
  { id: 'delivery', name: 'Delivery Driver', icon: '🚚', hours: 'part', sector: 'transport', salary: 17000, blocks: 2, stress: 4, minSmarts: 0 },
  { id: 'rideshare', name: 'Rideshare Driver', icon: '🚗', hours: 'part', sector: 'transport', salary: 16000, blocks: 2, stress: 4, minSmarts: 0 },
  { id: 'dog_walker', name: 'Dog Walker', icon: '🦮', hours: 'part', sector: 'service', salary: 13000, blocks: 2, stress: 1, minSmarts: 0 },
  { id: 'tour_guide', name: 'Tour Guide', icon: '🗺️', hours: 'part', sector: 'hospitality', salary: 15000, blocks: 2, stress: 2, minSmarts: 20 },
  { id: 'library_aide', name: 'Library Aide', icon: '📚', hours: 'part', sector: 'education', salary: 15000, blocks: 2, stress: 1, minSmarts: 30 },
  { id: 'office_assistant', name: 'Office Assistant', icon: '🗂️', hours: 'part', sector: 'business', salary: 19000, blocks: 2, stress: 3, minSmarts: 35 },
  { id: 'help_desk', name: 'IT Help Desk', icon: '🖥️', hours: 'part', sector: 'tech', salary: 21000, blocks: 2, stress: 3, minSmarts: 45 },
  { id: 'pharmacy_tech', name: 'Pharmacy Technician', icon: '🧪', hours: 'part', sector: 'health', salary: 22000, blocks: 2, stress: 3, minSmarts: 45 },
  { id: 'tutor', name: 'Tutor', icon: '📝', hours: 'part', sector: 'education', salary: 21000, blocks: 2, stress: 2, minSmarts: 55 },
  { id: 'lifeguard', name: 'Lifeguard', icon: '🛟', hours: 'part', sector: 'service', salary: 14000, blocks: 2, stress: 2, minSmarts: 0, skill: 'sports', minSkill: 20 },
  { id: 'music_teacher', name: 'Music Teacher', icon: '🎹', hours: 'part', sector: 'education', salary: 19000, blocks: 2, stress: 2, minSmarts: 0, skill: 'music', minSkill: 35 },
  { id: 'referee', name: 'Youth Referee', icon: '🏟️', hours: 'part', sector: 'education', salary: 16000, blocks: 2, stress: 3, minSmarts: 0, skill: 'sports', minSkill: 30 },
  { id: 'illustrator', name: 'Freelance Illustrator', icon: '🖍️', hours: 'part', sector: 'creative', salary: 20000, blocks: 2, stress: 2, minSmarts: 0, skill: 'art', minSkill: 35 },
  { id: 'photographer', name: 'Event Photographer', icon: '📷', hours: 'part', sector: 'creative', salary: 21000, blocks: 2, stress: 2, minSmarts: 0, skill: 'art', minSkill: 30 },
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

/** Night-school programs. Each "study" block adds 1 progress; tuition is charged each year enrolled. */
export const PROGRAMS = {
  degree: { id: 'degree' as const, name: 'University degree (night school)', short: 'Degree', icon: '🎓', required: 12, tuition: 6000, minSmarts: 45 },
  trade_cert: { id: 'trade_cert' as const, name: 'Trade certificate (night school)', short: 'Trade certificate', icon: '🛠️', required: 6, tuition: 3000, minSmarts: 0 },
};
