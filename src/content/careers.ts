import type { Hobby, Person, Program } from '../engine/types';
import { PRO_SKILL, SPORTS, SPORT_IDS } from './sports';

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
  requires?: 'degree' | 'trade_cert' | 'top_degree' | 'ppl' | 'cpl' | 'captains_license';
  /** Rank titles for levels 1–3 (instead of Junior/Senior/Lead). */
  titles?: [string, string, string];
  /** Pay at levels 1–3 (instead of +30% per level). */
  levelPay?: [number, number, number];
  /** Hobby skill needed to be promoted to levels 2 and 3. */
  promoSkill?: [number, number];
  /** Own business: cash needed to start it, and how much yearly income swings (0.5 = ±50%). */
  startup?: number;
  variance?: number;
  /** Only hires in coastal cities, and/or needs a piece of gear you own. */
  coastal?: boolean;
  needsGear?: import('./gear').GearId;
  /** Long stretches on the road at level 2+ (strains family bonds). */
  touring?: boolean;
  /** Military service: joined through a recruiter (or ROTC), never through job listings. */
  military?: 'enlisted' | 'officer' | 'reserve';
  /** A professional athlete in this sport: signed through the draft, never through job listings. */
  pro?: import('./sports').SportId;
  /** Only for someone who played professionally. */
  formerPro?: boolean;
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
  { id: 'carpenter', name: 'Carpenter', icon: '🪚', hours: 'full', sector: 'trades', salary: 46000, blocks: 4, stress: 5, minSmarts: 20, requires: 'trade_cert', skill: 'woodworking', minSkill: 15, titles: ['Apprentice Carpenter', 'Journeyman Carpenter', 'Master Carpenter'], levelPay: [46000, 64000, 88000], promoSkill: [40, 70] },
  { id: 'contractor', name: 'Contractor (own business)', icon: '🏗️', hours: 'full', sector: 'trades', salary: 125000, blocks: 6, stress: 8, minSmarts: 35, requires: 'trade_cert', skill: 'woodworking', minSkill: 75, startup: 40000, variance: 0.5, titles: ['Contractor', 'Contractor', 'Contractor'], levelPay: [125000, 125000, 125000] },
  { id: 'mechanic', name: 'Mechanic', icon: '🔧', hours: 'full', sector: 'trades', salary: 38000, blocks: 4, stress: 4, minSmarts: 20, requires: 'trade_cert', skill: 'mechanics', minSkill: 15, titles: ['Lube Tech', 'Mechanic', 'Master Technician'], levelPay: [38000, 56000, 82000], promoSkill: [35, 65] },
  { id: 'shop_owner', name: 'Auto Shop Owner', icon: '🏪', hours: 'full', sector: 'trades', salary: 115000, blocks: 6, stress: 8, minSmarts: 35, requires: 'trade_cert', skill: 'mechanics', minSkill: 75, startup: 60000, variance: 0.5, titles: ['Shop Owner', 'Shop Owner', 'Shop Owner'], levelPay: [115000, 115000, 115000] },
  { id: 'chef', name: 'Chef', icon: '👩‍🍳', hours: 'full', sector: 'hospitality', salary: 36000, blocks: 5, stress: 7, minSmarts: 0, skill: 'cooking', minSkill: 15, titles: ['Line Cook', 'Sous Chef', 'Head Chef'], levelPay: [36000, 54000, 85000], promoSkill: [40, 65] },
  { id: 'restaurant_owner', name: 'Restaurant Owner', icon: '🍽️', hours: 'full', sector: 'hospitality', salary: 140000, blocks: 6, stress: 9, minSmarts: 30, skill: 'cooking', minSkill: 70, startup: 250000, variance: 0.7, titles: ['Restaurant Owner', 'Restaurant Owner', 'Restaurant Owner'], levelPay: [140000, 140000, 140000] },
  { id: 'landscaper', name: 'Landscaper', icon: '🌳', hours: 'full', sector: 'service', salary: 34000, blocks: 5, stress: 4, minSmarts: 0, skill: 'gardening', minSkill: 30, titles: ['Landscaper', 'Crew Lead', 'Landscape Designer'], levelPay: [34000, 50000, 74000], promoSkill: [50, 70] },
  { id: 'nursery_owner', name: 'Garden Nursery Owner', icon: '🪴', hours: 'full', sector: 'retail', salary: 95000, blocks: 6, stress: 7, minSmarts: 25, skill: 'gardening', minSkill: 70, startup: 80000, variance: 0.5, titles: ['Nursery Owner', 'Nursery Owner', 'Nursery Owner'], levelPay: [95000, 95000, 95000] },
  { id: 'truck_driver', name: 'Truck Driver', icon: '🚛', hours: 'full', sector: 'transport', salary: 54000, blocks: 5, stress: 6, minSmarts: 0, requires: 'trade_cert' },
  { id: 'dental_hygienist', name: 'Dental Hygienist', icon: '🦷', hours: 'full', sector: 'health', salary: 74000, blocks: 4, stress: 4, minSmarts: 45, requires: 'trade_cert' },
  { id: 'police', name: 'Police Officer', icon: '👮', hours: 'full', sector: 'government', salary: 64000, blocks: 5, stress: 8, minSmarts: 35, requires: 'trade_cert', pension: true },
  { id: 'firefighter', name: 'Firefighter', icon: '🚒', hours: 'full', sector: 'government', salary: 58000, blocks: 5, stress: 8, minSmarts: 30, requires: 'trade_cert', pension: true },
  { id: 'oil_rig', name: 'Oilfield Technician', icon: '🛢️', hours: 'full', sector: 'energy', salary: 72000, blocks: 5, stress: 7, minSmarts: 30, requires: 'trade_cert' },
  { id: 'pilot', name: 'Pilot', icon: '✈️', hours: 'full', sector: 'transport', salary: 78000, blocks: 5, stress: 7, minSmarts: 50, requires: 'cpl', skill: 'flying', minSkill: 55, pension: true, titles: ['Commercial Pilot', 'First Officer', 'Airline Captain'], levelPay: [78000, 125000, 210000], promoSkill: [70, 85] },
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
  { id: 'musician', name: 'Musician', icon: '🎸', hours: 'full', sector: 'entertainment', salary: 40000, blocks: 4, stress: 4, minSmarts: 0, skill: 'music', minSkill: 55, titles: ['Session Musician', 'Touring Musician', 'Headliner'], levelPay: [40000, 78000, 320000], promoSkill: [72, 90], touring: true },
  { id: 'music_director', name: 'School Music Director', icon: '🎼', hours: 'full', sector: 'education', salary: 60000, blocks: 4, stress: 5, minSmarts: 45, requires: 'degree', skill: 'music', minSkill: 50, pension: true },
  { id: 'charter_captain', name: 'Charter Captain', icon: '⛵', hours: 'full', sector: 'hospitality', salary: 90000, blocks: 5, stress: 6, minSmarts: 20, requires: 'captains_license', skill: 'fishing', minSkill: 60, needsGear: 'offshore_boat', coastal: true, variance: 0.6, titles: ['Charter Captain', 'Charter Captain', 'Charter Captain'], levelPay: [90000, 90000, 90000] },
  { id: 'coach', name: 'Sports Coach', icon: '🏅', hours: 'full', sector: 'education', salary: 45000, blocks: 4, stress: 4, minSmarts: 0, skill: 'sports', minSkill: 55, pension: true, titles: ['Assistant Coach', 'Head Coach', 'College Coach'], levelPay: [45000, 62000, 95000], promoSkill: [62, 75] },
  { id: 'pro_coach', name: 'Pro Coach', icon: '📋', hours: 'full', sector: 'entertainment', salary: 150000, blocks: 6, stress: 8, minSmarts: 40, skill: 'sports', minSkill: 70, formerPro: true, titles: ['Pro Assistant Coach', 'Pro Head Coach', 'Championship Coach'], levelPay: [150000, 450000, 1800000], promoSkill: [80, 90] },
  { id: 'designer', name: 'Graphic Designer', icon: '🎨', hours: 'full', sector: 'creative', salary: 61000, blocks: 4, stress: 5, minSmarts: 35, skill: 'art', minSkill: 50 },
  { id: 'film_editor', name: 'Film Editor', icon: '🎬', hours: 'full', sector: 'entertainment', salary: 70000, blocks: 5, stress: 6, minSmarts: 40, skill: 'art', minSkill: 55 },
  { id: 'actor', name: 'Actor', icon: '🎭', hours: 'full', sector: 'entertainment', salary: 45000, blocks: 4, stress: 6, minSmarts: 0, skill: 'art', minSkill: 60 },
  // ── Military (recruiter or ROTC only; see engine/military.ts) ──
  { id: 'enlisted', name: 'Soldier', icon: '🎖️', hours: 'full', sector: 'government', salary: 34000, blocks: 5, stress: 7, minSmarts: 0, pension: true, military: 'enlisted', titles: ['Private', 'Sergeant', 'Master Sergeant'], levelPay: [34000, 52000, 72000] },
  { id: 'officer', name: 'Military Officer', icon: '⭐', hours: 'full', sector: 'government', salary: 60000, blocks: 6, stress: 8, minSmarts: 45, requires: 'degree', pension: true, military: 'officer', titles: ['Lieutenant', 'Captain', 'Major'], levelPay: [60000, 90000, 125000] },
  // ── Part-time: lower pay, 1–4 blocks (2 expected) ──
  { id: 'reserve', name: 'Military Reserve', icon: '🪖', hours: 'part', sector: 'government', salary: 9000, blocks: 2, stress: 2, minSmarts: 0, military: 'reserve' },
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
  { id: 'gigging', name: 'Local Gigs', icon: '🎤', hours: 'part', sector: 'entertainment', salary: 14000, blocks: 2, stress: 2, minSmarts: 0, skill: 'music', minSkill: 30 },
  { id: 'flight_instructor', name: 'Flight Instructor', icon: '🛩️', hours: 'part', sector: 'education', salary: 26000, blocks: 2, stress: 3, minSmarts: 40, requires: 'cpl', skill: 'flying', minSkill: 55 },
  { id: 'fishing_guide', name: 'Fishing Guide', icon: '🎣', hours: 'part', sector: 'hospitality', salary: 17000, blocks: 2, stress: 1, minSmarts: 0, skill: 'fishing', minSkill: 40 },
  { id: 'line_cook_pt', name: 'Prep Cook', icon: '🔪', hours: 'part', sector: 'hospitality', salary: 15000, blocks: 2, stress: 3, minSmarts: 0, skill: 'cooking', minSkill: 5 },
  { id: 'referee', name: 'Youth Referee', icon: '🏟️', hours: 'part', sector: 'education', salary: 16000, blocks: 2, stress: 3, minSmarts: 0, skill: 'sports', minSkill: 30 },
  { id: 'youth_coach', name: 'Youth Coach', icon: '🧢', hours: 'part', sector: 'education', salary: 12000, blocks: 2, stress: 2, minSmarts: 0, skill: 'sports', minSkill: 30 },
  { id: 'personal_trainer', name: 'Personal Trainer', icon: '💪', hours: 'part', sector: 'service', salary: 20000, blocks: 2, stress: 2, minSmarts: 0, skill: 'sports', minSkill: 45 },
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
  c.hours === 'part' ? c.salary : c.levelPay ? c.levelPay[Math.min(3, Math.max(1, level)) - 1] : Math.round(c.salary * (1 + 0.3 * (level - 1)));

/** The title for a career at a level ("Senior Nurse", "Journeyman Carpenter", "Airline Captain"). */
export const titleOf = (c: Career, level: number) =>
  c.titles ? c.titles[Math.min(3, Math.max(1, level)) - 1] : `${level > 1 ? LEVEL_TITLES[level] + ' ' : ''}${c.name}`;

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
    main = titleOf(c, p.jobLevel);
  } else main = part ? '' : 'Unemployed';
  return [main, partTxt].filter(Boolean).join(' + ');
}

/** Night-school programs. Each "study" block adds 1 progress; tuition is charged each year enrolled. */

export interface ProgramDef {
  id: Program;
  name: string;
  short: string;
  icon: string;
  /** Study blocks needed in total. */
  required: number;
  /** Tuition per year while enrolled. */
  tuition: number;
  minSmarts: number;
  /** Hobby skill needed to start. */
  skill?: Hobby;
  minSkill?: number;
  /** An earlier credential that's needed first. */
  needs?: Program;
  minAge?: number;
  /** Also counts as a general trade certificate. */
  grantsTrade?: boolean;
  /** Skill gained on finishing. */
  skillBonus?: number;
  desc: string;
}

/** Credentials earned at night school (or a flight school/academy): each study block adds 1 progress. */
export const PROGRAMS: Record<Program, ProgramDef> = {
  degree: { id: 'degree', name: 'University degree (night school)', short: 'Degree', icon: '🎓', required: 12, tuition: 6000, minSmarts: 45, desc: 'Opens degree careers' },
  trade_cert: { id: 'trade_cert', name: 'Trade certificate (night school)', short: 'Trade certificate', icon: '🛠️', required: 6, tuition: 3000, minSmarts: 0, desc: 'Opens skilled trades' },
  carpentry_cert: { id: 'carpentry_cert', name: 'Carpentry certificate', short: 'Carpentry certificate', icon: '🪚', required: 6, tuition: 3000, minSmarts: 0, skill: 'woodworking', minSkill: 15, grantsTrade: true, skillBonus: 15, desc: 'Apprentice carpenter and up' },
  auto_cert: { id: 'auto_cert', name: 'Automotive technician certificate', short: 'Automotive certificate', icon: '🔧', required: 6, tuition: 3000, minSmarts: 0, skill: 'mechanics', minSkill: 15, grantsTrade: true, skillBonus: 15, desc: 'Lube tech to master technician' },
  culinary_cert: { id: 'culinary_cert', name: 'Culinary school', short: 'Culinary diploma', icon: '🍳', required: 6, tuition: 6000, minSmarts: 0, skill: 'cooking', minSkill: 15, grantsTrade: true, skillBonus: 20, desc: 'A big jump in cooking skill' },
  ppl: { id: 'ppl', name: 'Private Pilot License', short: 'Pilot license', icon: '🛩️', required: 4, tuition: 12000, minSmarts: 35, skill: 'flying', minSkill: 20, minAge: 17, skillBonus: 10, desc: 'Fly yourself and passengers' },
  cpl: { id: 'cpl', name: 'Commercial Pilot License', short: 'Commercial license', icon: '✈️', required: 8, tuition: 30000, minSmarts: 50, skill: 'flying', minSkill: 50, needs: 'ppl', minAge: 18, skillBonus: 10, desc: 'Fly for pay: instructor and airline jobs' },
  captains_license: { id: 'captains_license', name: "Captain's license", short: "Captain's license", icon: '⚓', required: 3, tuition: 2500, minSmarts: 20, skill: 'fishing', minSkill: 40, minAge: 18, desc: 'Take paying passengers out to sea' },
};

/** Why `p` can't start a program, or null. */
export function programBlocker(p: Person, prog: ProgramDef, age: number): string | null {
  if (p.flags[prog.id]) return 'Already earned.';
  if (prog.minAge && age < prog.minAge) return `From age ${prog.minAge}.`;
  if (p.stats.smarts < prog.minSmarts) return `Needs smarts ${prog.minSmarts}+`;
  if (prog.needs && !p.flags[prog.needs]) return `Needs your ${PROGRAMS[prog.needs].short.toLowerCase()} first`;
  if (prog.skill && (p.skills[prog.skill] ?? 0) < (prog.minSkill ?? 0)) return `Needs ${prog.skill} skill ${prog.minSkill}+`;
  return null;
}

/** Pro athlete careers, one per sport (signed through the draft; see engine/sports.ts). */
export const PRO_CAREERS: Career[] = SPORT_IDS.map((id) => {
  const sp = SPORTS[id];
  return {
    id: `pro_${id}`, name: `Pro ${sp.label} Player`, icon: sp.icon, hours: 'full', sector: 'entertainment', salary: sp.proPay[0], blocks: 6, stress: 7,
    minSmarts: 0, skill: 'sports', minSkill: PRO_SKILL, pro: id, titles: ['Rookie', 'Starter', 'All-Star'], levelPay: sp.proPay,
  } satisfies Career;
});
CAREERS.push(...PRO_CAREERS);
for (const c of PRO_CAREERS) CAREER_BY_ID[c.id] = c;
