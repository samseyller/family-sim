import type { GameState } from '../engine/types';
import { active, ageOf, alive, childrenOf, getBond, kidsAtHome } from '../engine/util';

export interface AchievementDef {
  id: string;
  title: string;
  desc: string;
  icon: string;
  /** Hidden achievements show as "???" until unlocked. */
  hidden?: boolean;
  /** Pure predicate on the state after a transition. */
  test: (s: GameState) => boolean;
}

const household = (s: GameState) => s.households[active(s).householdId];
const lineagePeople = (s: GameState) => s.lineage.map((id) => s.people[id]);

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_year',
    title: 'First Steps',
    desc: 'Live through your first year.',
    icon: '👣',
    test: (s) => s.journal.length > 0 && s.year > s.journal[0].year,
  },
  {
    id: 'homeowner',
    title: 'Home Sweet Home',
    desc: 'Buy a family home.',
    icon: '🏡',
    test: (s) => household(s).assets.some((a) => a.kind === 'house'),
  },
  {
    id: 'mortgage_free',
    title: 'Keys and Deed',
    desc: 'Pay off a mortgage completely.',
    icon: '🗝️',
    test: (s) => household(s).assets.some((a) => a.kind === 'house' && a.mortgage === 0),
  },
  {
    id: 'two_jobs',
    title: 'Burning the Candle',
    desc: 'Hold a full-time and a part-time job at the same time.',
    icon: '🕯️',
    test: (s) => !!active(s).jobId && !!active(s).partJobId,
  },
  {
    id: 'lead_role',
    title: 'Corner Office',
    desc: 'Reach the top level of a career.',
    icon: '🏆',
    test: (s) => active(s).jobLevel >= 3 && !!active(s).jobId,
  },
  {
    id: 'devoted_parent',
    title: 'Devoted Parent',
    desc: 'Have an affinity of 80+ with every child living at home.',
    icon: '💛',
    test: (s) => {
      const kids = kidsAtHome(s, active(s));
      return kids.length > 0 && kids.every((k) => getBond(s, s.activeId, k.id).affinity >= 80);
    },
  },
  {
    id: 'empty_nest',
    title: 'Empty Nest',
    desc: 'See every one of your children grow up and move out.',
    icon: '🪺',
    test: (s) => {
      const me = active(s);
      const kids = childrenOf(s, me.id).filter(alive);
      return kids.length > 0 && kids.every((k) => k.householdId !== me.householdId && ageOf(k, s.year) >= 18);
    },
  },
  {
    id: 'grandparent',
    title: 'Grand',
    desc: 'Become a grandparent.',
    icon: '👵',
    test: (s) => childrenOf(s, s.activeId).some((c) => childrenOf(s, c.id).length > 0),
  },
  {
    id: 'second_chance',
    title: 'Second Chance',
    desc: 'Turn your life around after a health scare.',
    icon: '❤️‍🩹',
    hidden: true,
    test: (s) => !!active(s).flags.health_vow,
  },
  {
    id: 'millionaire',
    title: 'Seven Figures',
    desc: 'Have $1,000,000 in the household wallet.',
    icon: '💰',
    test: (s) => household(s).wallet >= 1_000_000,
  },
  {
    id: 'centenarian',
    title: 'Centenarian',
    desc: 'Live to 100.',
    icon: '🎂',
    hidden: true,
    test: (s) => ageOf(active(s), s.year) >= 100,
  },
  {
    id: 'next_generation',
    title: 'Passing the Torch',
    desc: 'Continue the story as the next generation.',
    icon: '🔥',
    test: (s) => new Set(lineagePeople(s).map((p) => p.generation)).size >= 2,
  },
  {
    id: 'full_circle',
    title: 'Full Circle',
    desc: 'Continue the story as a grandchild.',
    icon: '🔄',
    test: (s) => s.lineage.some((id, i) => i > 0 && s.people[id].generation - s.people[s.lineage[i - 1]].generation >= 2),
  },
  {
    id: 'four_generations',
    title: 'Dynasty',
    desc: 'Play as four generations of one family.',
    icon: '🌳',
    test: (s) => new Set(lineagePeople(s).map((p) => p.generation)).size >= 4,
  },
  {
    id: 'legacy',
    title: 'In Memoriam',
    desc: "End a family's story and see its memorial.",
    icon: '🕊️',
    test: (s) => s.phase === 'GAME_OVER',
  },
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
