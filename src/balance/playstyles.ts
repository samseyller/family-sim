/**
 * Scripted play styles for the balance sims. The three core styles (career, family, balanced)
 * measure the economy and difficulty. The explorer styles chase specific parts of the game the
 * way a player with a goal would (sports, the military, hobby careers, romance and friends,
 * big spending, the guided first life) so every achievement and event gets exercised.
 *
 * A style plans each year (time blocks, job and school intents), may act during planning
 * (buy things, do activities, move), and may prefer some event choices; anything it has no
 * preference for is picked at random among the enabled choices.
 */
import { HOBBY_BY_ID } from '../content/actions';
import { CAREER_BY_ID, qualifies, requiredBlocks } from '../content/careers';
import { CITY_IDS, type CityId } from '../content/cities';
import { MAX_DOGS } from '../content/dogs';
import { HOMES, type HomeTier, type UpgradeId } from '../content/finance';
import { GEAR, type GearId } from '../content/gear';
import { SPORTS, SPORT_IDS, type SportId } from '../content/sports';
import { ACTIVITY_BY_ID, activityBlocker, candidatesFor, performActivity } from '../engine/activities';
import { dogAction, dogsOf } from '../engine/dogs';
import { catAction, catsOf } from '../engine/cats';
import { MAX_CATS } from '../content/cats';
import { capacityOf, carsOf, financeAction, homeOf, type FinanceAction } from '../engine/finance';
import { friendsOf } from '../engine/friends';
import { type StartKind } from '../engine/generate';
import { ownsGear, takeUpHobby } from '../engine/hobbies';
import { householdAction } from '../engine/household';
import { cityOfHousehold } from '../engine/location';
import { listings } from '../engine/jobMarket';
import { enlistNow } from '../engine/military';
import type { Rng } from '../engine/rng';
import { isPro, sportsAction } from '../engine/sports';
import { planApply, planEnroll, shiftBlocks, strategyPlan, type Strategy } from '../engine/strategies';
import type { GameState, Hobby, PendingEvent, Person, Plan, Program, Thread } from '../engine/types';
import { stableHash } from '../engine/relationships';
import { active, activePartnership, ageOf, alive, childrenOf, getBond, kidsAtHome, membersOf, parentsOf } from '../engine/util';

export interface StyleCtx {
  rng: Rng;
  seed: number;
  /** Per-life scratch memory (counters, chosen sport or hobby). */
  mem: Record<string, number | string>;
}

export interface PlayStyle {
  id: string;
  /** Core styles feed the economy and difficulty metrics; explorers feed content coverage. */
  core: boolean;
  start: StartKind;
  /** Lives in the standard balance run. */
  lives: number;
  plan(s: GameState, ctx: StyleCtx): Plan;
  act?(s: GameState, ctx: StyleCtx): GameState;
  /** Choice ids to prefer, best first (only enabled choices count). */
  prefer?(pe: PendingEvent, s: GameState, ctx: StyleCtx): string[];
}

// ── Shared moves ─────────────────────────────────────────────────────────────────────────────

const me = (s: GameState) => active(s);
const age = (s: GameState) => ageOf(active(s), s.year);
const hh = (s: GameState) => s.households[active(s).householdId];
const cash = (s: GameState) => hh(s).wallet;

/** Do an activity with whoever can come (up to its limit). Same state back if it can't happen. */
export function tryActivity(s: GameState, id: string, pick?: (pool: Person[]) => Person[]): GameState {
  const def = ACTIVITY_BY_ID[id];
  if (!def) return s;
  let people: Person[] = [];
  if (def.who !== 'solo') {
    const pool = candidatesFor(s, def);
    people = pick ? pick(pool) : pool.slice(0, def.max ?? pool.length);
    if (people.length < (def.min ?? 1)) return s;
  }
  const ids = people.map((p) => p.id);
  return activityBlocker(s, id, ids) ? s : performActivity(s, id, ids);
}

const doAll = (s: GameState, ids: string[]) => ids.reduce((st, id) => tryActivity(st, id), s);
const fin = (s: GameState, a: FinanceAction) => financeAction(s, a);

/** Buy (or move up to) a home of this tier once there's money for a 20% down payment. */
function buyHome(s: GameState, tier: HomeTier, spare = 50_000): GameState {
  const home = homeOf(hh(s));
  const order: HomeTier[] = ['condo', 'starter', 'townhouse', 'family', 'large', 'estate', 'mansion'];
  if (home && order.indexOf(tierOf(home.name)) >= order.indexOf(tier)) return s;
  const equity = home ? home.value * 0.9 - home.mortgage : 0;
  if (cash(s) + equity < HOMES[tier].price * 0.3 + spare) return s;
  // Trading up: sell the current home first (you can only own one).
  const sold = home ? fin(s, { kind: 'sellHome' }) : s;
  const bought = fin(sold, { kind: 'buyHome', tier, downPct: 0.2 });
  return homeOf(hh(bought)) ? bought : s;
}

const tierOf = (name: string) => (Object.keys(HOMES) as HomeTier[]).find((t) => HOMES[t].label === name) ?? 'family';

const upgrade = (s: GameState, u: UpgradeId, spare = 40_000) => (homeOf(hh(s)) && cash(s) > spare ? fin(s, { kind: 'upgradeHome', upgrade: u }) : s);

/** Put spare cash to work, keeping a cushion. */
function invest(s: GameState, keep: number): GameState {
  const spare = cash(s) - keep;
  return spare >= 10_000 ? fin(s, { kind: 'invest', amount: Math.floor(spare / 10_000) * 10_000 }) : s;
}

/** A city (other than here) where this career is hiring. */
function cityHiring(s: GameState, careerId: string, coastalOnly = false): CityId | undefined {
  const here = cityOfHousehold(hh(s));
  const slot = CAREER_BY_ID[careerId].hours;
  return CITY_IDS.find((c) => c !== here && (!coastalOnly || ['los_angeles', 'san_diego', 'miami', 'seattle', 'boston', 'new_york'].includes(c))
    && listings(s.seed, c, s.year, slot).some((x) => x.id === careerId));
}

const listedHere = (s: GameState, careerId: string) => listings(s.seed, cityOfHousehold(hh(s)), s.year, CAREER_BY_ID[careerId].hours).some((c) => c.id === careerId);

// ── Following up on strained relationships ──────────────────────────────────────────────────

/**
 * How readily each core style follows up when a relationship at home is strained (a story thread). For each strain,
 * a stable roll decides whether this player commits to mending it: if so, they give that person time every year
 * and reach out when it comes up; if not, the plan stays as it is and they answer at random. So some players mend,
 * some let things drift, at different rates by style.
 */
export const MEND_RATE: Record<Strategy, number> = { family: 0.85, balanced: 0.5, career: 0.2 };
const commits = (ctx: StyleCtx, t: Thread, rate: number) => stableHash(`${ctx.seed}:${t.subjectId}:${t.since}:mend`) / 4294967296 < rate;
/** Strains with someone at home (partner or child) this player has committed to mending. */
function mending(s: GameState, ctx: StyleCtx, rate: number): Person[] {
  const p = me(s);
  const home = new Set(membersOf(s, p.householdId).map((x) => x.id));
  return (s.threads ?? [])
    .filter((t) => t.kind === 'strain' && t.ownerId === p.id && t.closed === undefined && !!t.subjectId && home.has(t.subjectId) && commits(ctx, t, rate))
    .map((t) => s.people[t.subjectId!]);
}
function mendPlan(s: GameState, plan: Plan, ctx: StyleCtx, rate: number): Plan {
  const want: Record<string, number> = {};
  const partner = activePartnership(s, me(s).id);
  for (const q of mending(s, ctx, rate)) {
    const key = partner && (partner.a === q.id || partner.b === q.id) ? 'partner_time' : `child_time:${q.id}`;
    want[key] = Math.max(plan.alloc[key] ?? 0, q.flags.promised_time === s.year ? 2 : 1);
  }
  return Object.keys(want).length ? shiftBlocks(s, plan, want) : plan;
}
const mendPrefer = (pe: PendingEvent, s: GameState, ctx: StyleCtx, rate: number): string[] =>
  pe.eventId === 'growing_distance' && mending(s, ctx, rate).some((q) => q.id === pe.subjectId) ? ['reach_out'] : [];

const corePlan = (kind: Strategy) => (s: GameState, ctx: StyleCtx) => mendPlan(s, strategyPlan(s, kind), ctx, MEND_RATE[kind]);
const corePrefer = (kind: Strategy) => (pe: PendingEvent, s: GameState, ctx: StyleCtx) => mendPrefer(pe, s, ctx, MEND_RATE[kind]);

// ── Sports ───────────────────────────────────────────────────────────────────────────────────

const SPORT_CYCLE: SportId[] = ['running', 'golf', 'tennis', 'swimming'];

/** Train hard in a sport from childhood; go as far as talent allows; coach the next generation. */
function athleteAct(s: GameState, ctx: StyleCtx, primary: SportId): GameState {
  const p = me(s);
  const a = age(s);
  // Later in life, pick up other sports (marathons, golf, tennis) once not playing pro.
  const later = a >= 34 && !isPro(p) ? SPORT_CYCLE[Math.min(SPORT_CYCLE.length - 1, Math.floor((a - 34) / 9))] : undefined;
  const target = later ?? primary;
  if ((p.sport !== target || p.hobby !== 'sports') && a >= SPORTS[target].minAge) s = sportsAction(s, { kind: 'take', sport: target });
  if (me(s).sport) {
    s = sportsAction(s, { kind: 'gear' });
    if (a >= 18 && cash(s) > 30_000) s = sportsAction(s, { kind: 'club', join: true });
    const home = SPORTS[me(s).sport!].home;
    if (home && cash(s) > 120_000) s = upgrade(s, home);
  }
  s = doAll(s, ['private_coach', 'private_coach', 'sports_camp', 'rec_league', 'sport_event', 'sport_event', 'sport_event', 'pickup_game', 'coach_kids', 'play_catch', 'watch_pro_game']);
  // Kids at home get a sport too (so they can be coached).
  for (const k of kidsAtHome(s, me(s))) if (!k.hobby && ageOf(k, s.year) >= 5) { k.hobby = 'sports'; ctx.mem.kidSports = (Number(ctx.mem.kidSports) || 0) + 1; }
  return s;
}

function athletePlan(s: GameState, kind: Strategy): Plan {
  const base = strategyPlan(s, kind);
  const p = me(s);
  if (!p.sport || p.hobby !== 'sports') return base;
  if (isPro(p)) return shiftBlocks(s, base, { practice: 2 });
  return shiftBlocks(s, base, { practice: age(s) < 18 ? 5 : 4 });
}

const athletePrefer = () => ['try', 'yes', 'athletic', 'sign', 'surgery', 'free', 'one_more', 'take'];

// ── Military ─────────────────────────────────────────────────────────────────────────────────

/** Serve: enlist (or ROTC) at 18; re-enlist toward a 20-year pension, or go reserve. */
function soldierPrefer(pe: PendingEvent, _s: GameState, ctx: StyleCtx): string[] {
  const track = ctx.seed % 3; // 0: career enlisted → officer, 1: ROTC officer, 2: reserve
  if (pe.eventId === 'own_coming_of_age') return track === 1 ? ['rotc', 'military'] : ['military'];
  if (pe.eventId === 'tour_end') return track === 2 ? ['reserve'] : ['retire', 'officer', 'reenlist'];
  if (pe.eventId === 'line_of_duty_injury') return ['recover'];
  if (pe.eventId === 'reserve_callup') return ['go'];
  if (pe.eventId === 'kid_coming_of_age') return ['military'];
  return [];
}

/** A career plan that never quits (or replaces) the part-time reserve. */
function soldierPlan(s: GameState): Plan {
  const plan = strategyPlan(s, 'career');
  if (me(s).partJobId !== 'reserve') return plan;
  const jobIntents = plan.jobIntents.filter((i) => (i.kind === 'quit' ? i.slot !== 'part' : CAREER_BY_ID[i.careerId].hours !== 'part'));
  return shiftBlocks(s, { ...plan, jobIntents }, { parttime: 2 });
}

function soldierAct(s: GameState): GameState {
  // Heirs who never served visit the recruiter (until 30).
  const p = me(s);
  if (age(s) >= 18 && age(s) <= 30 && !p.flags.tours && !p.jobId && !p.studyingUntil) s = enlistNow(s, !!p.flags.degree);
  if (age(s) < 18) return s;
  // A yearly check-up, a trip abroad when there's money for it, and a few lottery tickets (a jackpot is about 1 in
  // 2,000 tickets).
  s = tryActivity(s, 'checkup');
  if (hh(s).wallet > 30_000) s = tryActivity(s, 'world_trip');
  if (hh(s).wallet > 20_000) s = tryActivity(s, 'family_reunion');
  for (let i = 0; i < 5; i++) s = tryActivity(s, 'lottery');
  return s;
}

// ── Hobby careers ────────────────────────────────────────────────────────────────────────────

interface HobbyPath { hobby: Hobby; programs: Program[]; careers: string[]; gear?: GearId[]; upgrade?: UpgradeId; acts: string[]; coastal?: boolean }
const HOBBY_PATHS: HobbyPath[] = [
  { hobby: 'flying', programs: ['ppl', 'cpl'], careers: ['pilot'], gear: ['plane'], acts: ['scenic_flight', 'hobby_workshop'] },
  { hobby: 'woodworking', programs: ['carpentry_cert'], careers: ['carpenter', 'contractor'], upgrade: 'workshop', acts: ['sell_furniture', 'build_treehouse', 'hobby_workshop'] },
  { hobby: 'mechanics', programs: ['auto_cert'], careers: ['mechanic', 'shop_owner'], gear: ['project_car'], upgrade: 'garage_lift', acts: ['restore_car', 'fix_cars', 'car_show'] },
  { hobby: 'cooking', programs: ['culinary_cert'], careers: ['chef', 'restaurant_owner'], gear: ['food_truck'], upgrade: 'chef_kitchen', acts: ['cater_event', 'run_food_truck', 'cooking_class', 'dinner_party'] },
  { hobby: 'music', programs: [], careers: ['musician'], upgrade: 'studio', acts: ['play_gig', 'hobby_workshop'] },
  { hobby: 'fishing', programs: ['captains_license'], careers: ['fishing_guide', 'charter_captain'], gear: ['bass_boat', 'offshore_boat'], acts: ['fishing_trip', 'fishing_tournament'], coastal: true },
  { hobby: 'gardening', programs: [], careers: ['landscaper', 'nursery_owner'], upgrade: 'greenhouse', acts: ['garden_day', 'farmers_market', 'share_harvest', 'garden'] },
];

// Flying comes up twice as often: the airline-captain path (licenses, then two promotions) is the longest.
const PATH_ORDER = [0, 1, 2, 3, 4, 5, 6, 0];
// A style can pin one path (ctx.mem.path), e.g. the musician explorer.
const hobbyPath = (ctx: StyleCtx) => HOBBY_PATHS[ctx.mem.path !== undefined ? Number(ctx.mem.path) : PATH_ORDER[ctx.seed % PATH_ORDER.length]];
const MUSIC_PATH = HOBBY_PATHS.findIndex((x) => x.hobby === 'music');
const musicCtx = (ctx: StyleCtx) => { ctx.mem.path = MUSIC_PATH; return ctx; };

/** The next career on the path you aren't in yet (or the one you hold, to keep). */
function nextCareer(p: Person, path: HobbyPath): string | undefined {
  const at = path.careers.indexOf(p.jobId ?? p.partJobId ?? '');
  return path.careers[at + 1];
}

function hobbyistPlan(s: GameState, ctx: StyleCtx): Plan {
  const path = hobbyPath(ctx);
  let plan = strategyPlan(s, 'balanced');
  const p = me(s);
  if (p.hobby !== path.hobby) return plan;
  if (age(s) < 18) return shiftBlocks(s, plan, { practice: 4 }); // a kid with a passion
  for (const prog of path.programs) plan = planEnroll(s, plan, prog);
  // In a career on the path: stay put (no hopping to better-paid work elsewhere).
  if (path.careers.includes(p.jobId ?? '')) plan = { ...plan, jobIntents: plan.jobIntents.filter((i) => i.kind !== 'apply' || CAREER_BY_ID[i.careerId].hours !== 'full') };
  const next = nextCareer(p, path);
  const want: Record<string, number> = { practice: 3, ...(p.education || plan.eduIntent ? { study: 3 } : {}) };
  if (next && age(s) < 60 && qualifies(p, CAREER_BY_ID[next]) && listedHere(s, next) && (!CAREER_BY_ID[next].startup || cash(s) > CAREER_BY_ID[next].startup! + 30_000)) {
    plan = planApply(plan, next);
    if (CAREER_BY_ID[next].hours === 'full') want.work = requiredBlocks(CAREER_BY_ID[next], 1) + 1;
  } else if (p.jobId && path.careers.includes(p.jobId)) {
    // Go the extra mile in the dream job (that earns promotions) without burning out.
    want.work = requiredBlocks(CAREER_BY_ID[p.jobId], p.jobLevel) + 1;
    if (p.stats.stress >= 60) want.relax = 3;
  }
  return shiftBlocks(s, plan, want);
}

function hobbyistAct(s: GameState, ctx: StyleCtx): GameState {
  const path = hobbyPath(ctx);
  if (me(s).hobby !== path.hobby) s = takeUpHobby(s, path.hobby);
  if (age(s) < 18) return s;
  s = buyHome(s, 'family');
  // A finished classic gets sold once a child is old enough to help with the next one.
  const done = hh(s).assets.find((x) => x.gear === 'project_car' && (x.restore ?? 0) >= 100);
  if (done && kidsAtHome(s, me(s)).some((k) => ageOf(k, s.year) >= 8)) s = fin(s, { kind: 'sellGear', assetId: done.id });
  for (const g of path.gear ?? []) {
    if (ownsGear(hh(s), g)) continue;
    if (GEAR[g].coastal && !['los_angeles', 'san_diego', 'miami', 'seattle', 'boston', 'new_york'].includes(cityOfHousehold(hh(s)))) continue;
    if (cash(s) > GEAR[g].price + 60_000) s = fin(s, { kind: 'buyGear', gear: g });
  }
  if (path.upgrade) s = upgrade(s, path.upgrade, 60_000);
  // With a child old enough to help, leave the project car for a moment together (the restore_with_kid event).
  const helper = kidsAtHome(s, me(s)).some((k) => ageOf(k, s.year) >= 8);
  s = doAll(s, path.acts.filter((id) => !(helper && id === 'restore_car')));
  // Chase the next job on the path: move where it's hiring once qualified (a few times a life).
  const p = me(s);
  const next = nextCareer(p, path);
  const moves = Number(ctx.mem.moves) || 0;
  const wantCoast = path.coastal && (p.skills.fishing ?? 0) >= 40 && cash(s) > 320_000 && !ownsGear(hh(s), 'offshore_boat');
  if (moves < 4 && ((next && qualifies(p, CAREER_BY_ID[next]) && !listedHere(s, next)) || wantCoast)) {
    const city = next ? cityHiring(s, next, path.coastal) : cityHiring(s, 'charter_captain', true);
    if (city) { s = fin(s, { kind: 'moveCity', city }); ctx.mem.moves = moves + 1; }
  }
  return s;
}

// ── Romance, friends, dogs, moving ───────────────────────────────────────────────────────────

const DATE_ACTS = ['date_night', 'picnic', 'concert_date', 'weekend_getaway', 'spend_the_night'];

function socialiteAct(s: GameState, ctx: StyleCtx): GameState {
  const a = age(s);
  if (a < 18) return a >= 6 ? tryActivity(s, 'sleepover') : s;
  const ps = activePartnership(s, me(s).id);
  if (!ps) {
    // Single: catch up with the ex you're still fondest of (that's how sparks rekindle), then go meet people.
    const fondest = (pool: Person[]) => [...pool].sort((x, y) => getBond(s, me(s).id, y.id).affinity - getBond(s, me(s).id, x.id).affinity).slice(0, 1);
    s = tryActivity(tryActivity(s, 'coffee_ex', fondest), 'coffee_ex', fondest);
    if (!activePartnership(s, me(s).id)) s = doAll(s, ['text_ex', 'dating_app', 'speed_dating', 'blind_date', 'dance_class']);
  }
  else if (ps.status === 'dating') {
    s = doAll(s, DATE_ACTS);
    // Play the field in your twenties: break up after a year or two together.
    const since = s.year - ps.startYear;
    if (a < 30 && since >= 1 && ctx.rng.chance(0.6)) s = tryActivity(s, 'break_up');
    else if (a >= 30) s = tryActivity(s, 'move_in_together');
  } else {
    s = doAll(s, ['date_night', 'weekend_getaway', 'spend_the_night']);
    // Some lives stray (and sooner or later, get caught).
    if (ctx.seed % 4 === 0 && ctx.rng.chance(0.4)) s = tryActivity(s, 'dating_app');
  }
  // Friends: lots of them, and one best friend you see all the time.
  const friends = friendsOf(s);
  const best = [...friends].sort((x, y) => getBond(s, me(s).id, y.id).affinity - getBond(s, me(s).id, x.id).affinity)[0];
  s = doAll(s, ['join_club', 'volunteer', 'night_out', 'host_party', 'game_day', 'hike_friends', 'visit_friend']);
  s = tryActivity(s, 'coffee_friend', (pool) => (best && pool.includes(best) ? [best] : pool.slice(0, 1)));
  s = tryActivity(s, 'call_friend', (pool) => pool.slice(0, 3));
  s = tryActivity(s, 'help_friend_move', (pool) => pool.slice(0, 1));
  // Dogs: a full pack, walked every year.
  if (a >= 25 && dogsOf(hh(s)).length < MAX_DOGS && cash(s) > 15_000) {
    s = dogsOf(hh(s)).length % 2 ? dogAction(s, { kind: 'adoptShelter', name: 'Scout' }) : dogAction(s, { kind: 'adoptPuppy', breed: 'labrador', name: 'Biscuit' });
  }
  s = doAll(s, ['walk_dogs', 'play_fetch', 'dog_park']);
  // And cats: a full house of them, a cat tree, playtime, naps, and the odd café visit.
  if (a >= 22 && catsOf(hh(s)).length < MAX_CATS && cash(s) > 8_000) s = catAction(s, catsOf(hh(s)).length % 2 ? { kind: 'adoptShelterCat', name: '' } : { kind: 'adoptKitten', breed: (['tabby', 'maine_coon', 'siamese', 'persian', 'ragdoll'] as const)[(ctx.seed + catsOf(hh(s)).length) % 5], name: '' });
  s = catAction(s, { kind: 'catTree' });
  s = doAll(s, ['play_with_cats', 'cat_nap', 'cat_grooming', 'cat_vet', 'cat_cafe']);
  // A new city every few years (up to four).
  const moved = Number(ctx.mem.moves) || 0;
  if (a >= 24 && moved < 4 && s.year - (Number(ctx.mem.lastMove) || 0) >= 6 && cash(s) > 20_000) {
    const here = cityOfHousehold(hh(s));
    const city = CITY_IDS[(ctx.seed + moved * 5) % CITY_IDS.length];
    if (city !== here) { s = fin(s, { kind: 'moveCity', city }); ctx.mem.moves = moved + 1; ctx.mem.lastMove = s.year; }
  }
  return s;
}

const socialitePrefer = (pe: PendingEvent) => (pe.eventId === 'unplanned_pregnancy' ? ['keep', 'keep_together'] : []);

// ── Big spending ─────────────────────────────────────────────────────────────────────────────

/** Spend like there's no tomorrow (when there's money): homes, upgrades, cars, a full mansion. */
function spenderAct(s: GameState, ctx: StyleCtx): GameState {
  if (age(s) < 22) return s;
  for (const t of ['family', 'large', 'estate'] as HomeTier[]) s = buyHome(s, t, 100_000);
  for (const u of ['pool', 'expansion', 'theater', 'hot_tub', 'home_gym'] as UpgradeId[]) s = upgrade(s, u, 150_000);
  // A mansion once there's real money (pro contracts can pay for one).
  const nw = cash(s) + (hh(s).investments ?? 0);
  if (nw > HOMES.mansion.price * 0.2 + 2_000_000) {
    if ((hh(s).investments ?? 0) > 0 && cash(s) < HOMES.mansion.price * 0.2 + 1_000_000) s = fin(s, { kind: 'withdraw', amount: Math.min(hh(s).investments ?? 0, HOMES.mansion.price * 0.2 + 1_000_000 - cash(s)) });
    s = buyHome(s, 'mansion', 1_000_000);
  }
  const home = homeOf(hh(s));
  // Keep the family close (invites need a real bond).
  s = doAll(s, ['world_trip', 'vacation', 'family_reunion', 'host_holiday', 'visit', 'game_night', 'heart_to_heart']);
  if (home && tierOf(home.name) === 'mansion') {
    // Fill it: everyone in the family is welcome.
    // Grown kids come home once their own family is complete (nobody living with you has babies).
    const fam = [...childrenOf(s, me(s).id).filter((k) => childrenOf(s, k.id).length >= 2 || ageOf(k, s.year) >= 43), ...parentsOf(s, me(s))];
    for (const p of fam) if (alive(p) && p.householdId !== hh(s).id && membersOf(s, hh(s).id).length < capacityOf(hh(s))) s = householdAction(s, { kind: 'invite', personId: p.id });
    // And the garage.
    for (let i = 0; i < 30 && cash(s) > 50_000; i++) {
      const before = carsOf(hh(s)).length;
      s = fin(s, { kind: 'buyCar', car: 'beater', financed: false });
      if (carsOf(hh(s)).length === before) break;
    }
  } else s = invest(s, 250_000);
  void ctx;
  return s;
}

const familyPrefer = (pe: PendingEvent) => (/baby|pregnan/.test(pe.eventId) ? ['yes', 'try', 'keep', 'keep_together'] : []);

/**
 * Find someone, marry, and raise a big family (adopting when there's money) that stays close.
 * Grown kids move out and start their own families (people living with you don't marry), then
 * everyone is invited back to the mansion.
 */
/**
 * Keep a few family traditions: each family takes to some of these activities (a stable pick per seed) and keeps
 * them in most years, at a rate that differs by family, so traditions form, lapse, come back and pass on.
 */
function keepTraditions(s: GameState, ctx: StyleCtx, ids: string[], rate: number): GameState {
  if (age(s) < 25) return s;
  for (const id of ids) {
    if (stableHash(`${ctx.seed}:${id}:likes`) % 100 >= 60) continue;
    if (stableHash(`${ctx.seed}:${s.year}:${id}:keep`) / 4294967296 >= rate) continue;
    s = tryActivity(s, id);
  }
  return s;
}
const familyRate = (ctx: StyleCtx, lo: number) => lo + (ctx.seed % 4) * 0.1;

function bigFamilyAct(s: GameState): GameState {
  if (age(s) < 22) return s;
  const ps = activePartnership(s, me(s).id);
  if (!ps) return doAll(s, ['dating_app', 'blind_date', 'speed_dating']);
  if (ps.status === 'dating') return doAll(s, ['date_night', 'weekend_getaway', 'move_in_together']);
  return doAll(s, ['date_night', ...(age(s) <= 44 ? ['spend_the_night', 'spend_the_night', 'spend_the_night', 'spend_the_night'] : [])]);
}

function bigFamilyPrefer(pe: PendingEvent, s: GameState): string[] {
  if (pe.eventId === 'baby') return cash(s) > 200_000 && age(s) >= 40 ? ['adopt', 'yes'] : ['yes', 'adopt'];
  if (pe.eventId === 'proposal') return ['propose_ring', 'propose'];
  if (pe.eventId === 'kid_moves_back' || pe.eventId === 'parent_needs_care') return ['home', 'move_in'];
  if (pe.eventId === 'crowded_home') return ['expand', 'move_up', 'squeeze'];
  return familyPrefer(pe);
}

// ── The styles ───────────────────────────────────────────────────────────────────────────────

const sportFor = (ctx: StyleCtx, pool: SportId[] = SPORT_IDS) => pool[ctx.seed % pool.length];

export const PLAY_STYLES: PlayStyle[] = [
  { id: 'career', core: true, start: 'adult', lives: 60, plan: corePlan('career'), prefer: corePrefer('career') },
  { id: 'family', core: true, start: 'adult', lives: 60, plan: corePlan('family'), prefer: corePrefer('family') },
  { id: 'balanced', core: true, start: 'adult', lives: 60, plan: corePlan('balanced'), prefer: corePrefer('balanced') },
  {
    id: 'athlete', core: false, start: 'child', lives: 30,
    plan: (s) => athletePlan(s, 'balanced'),
    act: (s, ctx) => athleteAct(s, ctx, sportFor(ctx)),
    prefer: athletePrefer,
  },
  {
    id: 'soldier', core: false, start: 'child', lives: 180,
    plan: soldierPlan,
    act: (s, ctx) => soldierAct(keepTraditions(s, ctx, ['host_holiday', 'grandparents_dinner', 'holiday_lights'], familyRate(ctx, 0.45))),
    prefer: soldierPrefer,
  },
  {
    id: 'hobbyist', core: false, start: 'child', lives: 56,
    plan: hobbyistPlan,
    prefer: (pe) => (pe.eventId === 'promotion_offer' ? ['accept'] : []),
    act: hobbyistAct,
  },
  {
    // Musicians only: a big break (a hit song or a headline audition) is rare, so it needs its own sample.
    id: 'musician', core: false, start: 'child', lives: 30,
    plan: (s, ctx) => hobbyistPlan(s, musicCtx(ctx)),
    prefer: (pe) => (pe.eventId === 'promotion_offer' ? ['accept'] : []),
    act: (s, ctx) => hobbyistAct(s, musicCtx(ctx)),
  },
  {
    id: 'socialite', core: false, start: 'child', lives: 24,
    plan: corePlan('balanced'),
    act: (s, ctx) => socialiteAct(keepTraditions(s, ctx, ['road_trip', 'game_night', 'concert'], familyRate(ctx, 0.5)), ctx),
    prefer: (pe) => [...socialitePrefer(pe), ...familyPrefer(pe)],
  },
  {
    // A pro-sports family with expensive tastes: the money that buys (and fills) a mansion.
    id: 'tycoon', core: false, start: 'child', lives: 20,
    plan: (s) => athletePlan(s, 'family'),
    // Traditions first each year (before energy goes to everything else).
    act: (s, ctx) => spenderAct(bigFamilyAct(athleteAct(keepTraditions(s, ctx, ['host_holiday', 'game_night', 'holiday_lights', 'birthday_camping', 'grandparents_dinner'], familyRate(ctx, 0.55)), ctx, sportFor(ctx, ['basketball', 'baseball', 'football']))), ctx),
    prefer: (pe, s) => [...bigFamilyPrefer(pe, s), ...athletePrefer()],
  },
  {
    // The guided first life, putting off kids (so its "a child arrives by 30" safety net is tested).
    id: 'guided', core: false, start: 'guided', lives: 4, plan: corePlan('balanced'),
    prefer: (pe, s) => (/baby|pregnan|proposal/.test(pe.eventId) && age(s) < 30 ? ['no', 'wait', 'later'] : []),
  },
];

export const STYLE_BY_ID: Record<string, PlayStyle> = Object.fromEntries(PLAY_STYLES.map((p) => [p.id, p]));
export const CORE_STYLES = PLAY_STYLES.filter((p) => p.core);
void HOBBY_BY_ID;
