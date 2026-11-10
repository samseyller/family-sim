import type { ChildPlan, Hobby } from '../engine/types';

export const TIME_BUDGET = 12;

export interface ActionDef {
  id: string;
  label: string;
  icon: string;
  category: 'work' | 'self' | 'family';
  desc: string;
  target?: 'partner' | 'child';
  costPerBlock?: number;
}

export const ACTIONS: ActionDef[] = [
  { id: 'work', label: 'Full-time work', icon: '💼', category: 'work', desc: 'Below the required blocks hurts pay and standing; above is overtime (more pay, more stress).' },
  { id: 'parttime', label: 'Part-time work', icon: '⏱️', category: 'work', desc: '1–4 blocks; 2 keeps good standing.' },
  { id: 'exercise', label: 'Exercise', icon: '🏃', category: 'self', desc: 'Fitness and health up, stress down.' },
  { id: 'relax', label: 'Relax', icon: '🛋️', category: 'self', desc: 'Stress down, happiness up.' },
  { id: 'learn', label: 'Learn', icon: '📚', category: 'self', desc: 'Smarts up. Opens better careers.' },
  { id: 'socialize', label: 'Social life', icon: '🥂', category: 'self', desc: 'Happiness up, a little less stress. Single? You are more likely to meet someone.' },
  { id: 'study', label: 'Night school', icon: '🎓', category: 'self', desc: 'Progress toward your degree or certificate.' },
  { id: 'practice', label: 'Practice', icon: '🎯', category: 'self', desc: 'Hobby skill up.' },
  { id: 'partner_time', label: 'Time with partner', icon: '💞', category: 'family', target: 'partner', desc: 'Affinity and trust with your partner.' },
  { id: 'child_time', label: 'Time together', icon: '🧸', category: 'family', target: 'child', desc: 'Affinity and trust. Trust makes them listen to you.' },
  { id: 'homework', label: 'Homework help', icon: '✏️', category: 'family', target: 'child', desc: 'Their smarts up, a little trust.' },
  { id: 'family_outing', label: 'Family outing', icon: '🎡', category: 'family', costPerBlock: 1500, desc: 'Everyone at home bonds a little. Costs $1,500 per block.' },
];

export const ACTION_BY_ID: Record<string, ActionDef> = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));

export interface HobbyDef {
  id: Hobby;
  label: string;
  icon: string;
  /** What parents miss when they skip it (recital, big game...). */
  event: string;
  /** Cost per practice block (lessons, parts, ingredients, flight hours). */
  cost: number;
  /** Youngest age to take it up. */
  minAge: number;
  desc: string;
}

export const HOBBIES: HobbyDef[] = [
  { id: 'music', label: 'Music', icon: '🎵', event: 'recital', cost: 0, minAge: 5, desc: 'Gigs, session work, touring, or teaching' },
  { id: 'sports', label: 'Sports', icon: '⚽', event: 'big game', cost: 0, minAge: 5, desc: 'Fitness and coaching' },
  { id: 'art', label: 'Art', icon: '🖌️', event: 'art show', cost: 0, minAge: 5, desc: 'Design, illustration, film and acting' },
  { id: 'cooking', label: 'Cooking', icon: '🍳', event: 'cook-off', cost: 60, minAge: 10, desc: 'Line cook to head chef, or your own restaurant' },
  { id: 'woodworking', label: 'Woodworking', icon: '🪚', event: 'craft fair', cost: 120, minAge: 12, desc: 'Apprentice to master carpenter, or contractor' },
  { id: 'mechanics', label: 'Auto mechanics', icon: '🔧', event: 'car show', cost: 150, minAge: 14, desc: 'Fix cars, restore classics, run a shop' },
  { id: 'fishing', label: 'Fishing', icon: '🎣', event: 'fishing derby', cost: 30, minAge: 6, desc: 'Relaxing; guides and charter captains' },
  { id: 'gardening', label: 'Gardening', icon: '🌱', event: 'county fair', cost: 25, minAge: 6, desc: 'Stress relief and homegrown food' },
  { id: 'flying', label: 'Flying', icon: '✈️', event: 'air show', cost: 400, minAge: 16, desc: 'Expensive lessons; a path to the cockpit' },
];

export const HOBBY_BY_ID = Object.fromEntries(HOBBIES.map((h) => [h.id, h])) as Record<Hobby, (typeof HOBBIES)[number]>;

export const COSTS = {
  tutoring: 3000,
  lessons: 2000,
  advancedLessons: 5000,
  adult: 22000,
  child: 11000,
  rentBase: 18000,
  rentPerExtra: 3000,
  studentLiving: 10000,
  tuition: 8000,
  careHome: 35000,
  careSupport: 15000,
  studentWage: 9000,
};

export const FUND_OPTIONS = [0, 1000, 2000, 5000];

export const defaultChildPlan = (): ChildPlan => ({
  focus: 'free',
  tutoring: false,
  lessons: false,
  fundContribution: 0,
});
