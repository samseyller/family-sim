import type { GameState } from '../engine/types';
import { active, ageOf, alive, childrenOf, getBond, kidsAtHome, membersOf, money } from '../engine/util';
import { BASE_PARKING, HOMES } from './finance';
import { MAX_DOGS } from './dogs';
import { dogsOf } from '../engine/dogs';
import { friendsOf, friendshipsOf } from '../engine/friends';

const DATE_IDS = new Set(['date_night', 'picnic', 'concert_date', 'weekend_getaway']);

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
/** The mansion the player's household owns, if any. */
const mansionOf = (s: GameState) => household(s).assets.find((a) => a.kind === 'house' && a.name === HOMES.mansion.label);
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
    id: 'butterflies',
    title: 'Butterflies',
    desc: 'Start dating someone.',
    icon: '💘',
    test: (s) => (active(s).flags.dated ?? 0) >= 1,
  },
  {
    id: 'playing_the_field',
    title: 'Playing the Field',
    desc: 'Date five different people in one life.',
    icon: '🃏',
    test: (s) => (active(s).flags.dated ?? 0) >= 5,
  },
  {
    id: 'second_spark',
    title: 'Second Spark',
    desc: 'Get back together with an ex.',
    icon: '🔥',
    test: (s) => !!active(s).flags.rekindled,
  },
  {
    id: 'hopeless_romantic',
    title: 'Hopeless Romantic',
    desc: 'Go on 10 dates with a partner (date nights, picnics, concerts, getaways).',
    icon: '🌹',
    test: (s) => (s.activityLog ?? []).filter((x) => DATE_IDS.has(x.id)).length >= 10,
  },
  {
    id: 'surprise_baby',
    title: 'Surprise!',
    desc: 'Welcome a baby you didn’t plan for.',
    icon: '🍼',
    hidden: true,
    test: (s) => !!active(s).flags.surprise_baby,
  },
  {
    id: 'social_butterfly',
    title: 'Social Butterfly',
    desc: 'Have 8 friends at once (not counting ones you’ve drifted from).',
    icon: '🦋',
    test: (s) => friendsOf(s).filter((f) => getBond(s, active(s).id, f.id).affinity > 0).length >= 8,
  },
  {
    id: 'bff',
    title: 'Best Friends Forever',
    desc: 'Grow a friendship to 80 or more.',
    icon: '🤞',
    test: (s) => friendsOf(s).some((f) => getBond(s, active(s).id, f.id).affinity >= 80),
  },
  {
    id: 'like_old_times',
    title: 'Like Old Times',
    desc: 'Reconnect with a friend you had drifted apart from.',
    icon: '🔁',
    test: (s) => !!active(s).flags.reconnected,
  },
  {
    id: 'worth_the_trip',
    title: 'Worth the Trip',
    desc: 'Travel to see a friend who lives in another city.',
    icon: '✈️',
    test: (s) => (s.activityLog ?? []).some((x) => x.id === 'visit_friend'),
  },
  {
    id: 'lifelong_friends',
    title: 'Lifelong Friends',
    desc: 'Keep a friendship going for 40 years.',
    icon: '🫶',
    test: (s) => friendshipsOf(s).some((f) => s.year - f.since >= 40),
  },
  {
    id: 'fresh_start',
    title: 'Fresh Start',
    desc: 'Move to a new city.',
    icon: '🧳',
    test: (s) => (active(s).flags.cities_lived ?? 1) >= 2,
  },
  {
    id: 'city_hopper',
    title: 'City Hopper',
    desc: 'Live in four different cities in one life.',
    icon: '🗺️',
    test: (s) => (active(s).flags.cities_lived ?? 1) >= 4,
  },
  {
    id: 'best_friend',
    title: 'Best Friend',
    desc: 'Bring a dog into the family.',
    icon: '🐕',
    test: (s) => !!active(s).flags.adopted_dog || !!active(s).flags.rescued_dog,
  },
  {
    id: 'rescue_hero',
    title: 'Rescue Hero',
    desc: 'Adopt a dog from the shelter.',
    icon: '🏠',
    test: (s) => !!active(s).flags.rescued_dog,
  },
  {
    id: 'pack_leader',
    title: 'Pack Leader',
    desc: `Have ${MAX_DOGS} dogs at once.`,
    icon: '🐾',
    test: (s) => dogsOf(household(s)).length >= MAX_DOGS,
  },
  {
    id: 'daily_walks',
    title: 'Who’s a Good Walker?',
    desc: 'Walk the dog 20 times.',
    icon: '🦮',
    test: (s) => (s.activityLog ?? []).filter((x) => x.id === 'walk_dogs').length >= 20,
  },
  {
    id: 'good_old_dog',
    title: 'Good Old Dog',
    desc: 'Have a dog live to 14.',
    icon: '🦴',
    test: (s) => !!active(s).flags.old_dog,
  },
  {
    id: 'cannonball',
    title: 'Cannonball!',
    desc: 'Put a pool in your backyard.',
    icon: '🏊',
    test: (s) => household(s).assets.some((a) => a.kind === 'house' && (a.upgrades ?? []).includes('pool')),
  },
  {
    id: 'room_to_grow',
    title: 'Room to Grow',
    desc: 'Build an addition onto your home.',
    icon: '🧱',
    test: (s) => household(s).assets.some((a) => a.kind === 'house' && (a.upgrades ?? []).includes('expansion')),
  },
  {
    id: 'dream_wedding',
    title: 'Dream Wedding',
    desc: 'Throw the wedding of the century.',
    icon: '💒',
    test: (s) => !!active(s).flags.dream_wedding,
  },
  {
    id: 'covered',
    title: 'Glad We Had Insurance',
    desc: 'Get through a disaster with an insurance claim.',
    icon: '🛡️',
    test: (s) => !!active(s).flags.insured_claim,
  },
  {
    id: 'bank_of_mom_and_dad',
    title: 'The Bank of Mom and Dad',
    desc: 'Give $50,000 to family over a lifetime.',
    icon: '🏦',
    test: (s) => (active(s).flags.given_to_family ?? 0) >= 50000,
  },
  {
    id: 'mansion',
    title: 'Lap of Luxury',
    desc: `Buy a ${money(HOMES.mansion.price)} mansion.`,
    icon: HOMES.mansion.icon,
    test: (s) => !!mansionOf(s),
  },
  {
    id: 'full_mansion',
    title: 'Full House',
    desc: `Fill your mansion: ${HOMES.mansion.capacity} people under one roof.`,
    icon: '👨‍👩‍👧‍👦',
    test: (s) => !!mansionOf(s) && membersOf(s, household(s).id).length >= HOMES.mansion.capacity,
  },
  {
    id: 'car_collector',
    title: 'Car Collector',
    desc: `Fill every parking spot at your mansion: ${BASE_PARKING + HOMES.mansion.garage} cars.`,
    icon: '🏎️',
    test: (s) => !!mansionOf(s) && household(s).assets.filter((a) => a.kind === 'car').length >= BASE_PARKING + HOMES.mansion.garage,
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
