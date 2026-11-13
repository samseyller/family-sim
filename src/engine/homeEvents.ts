/**
 * Home pressure: a house that's too full (people marry and have babies under your roof), and
 * debt that's about to spiral (often retirees in a house they can no longer afford). Both offer
 * real ways out: expand, move, downsize, or tighten the belt.
 */
import { DEBT_RATE } from '../content/economy';
import { HOMES, HOME_UPGRADES, RENTALS, SELL_COSTS, type HomeTier, type RentTier } from '../content/finance';
import { estimateYear } from './budget';
import type { Ctx, EventDef } from './events';
import { moveOut } from './family';
import { headOf } from './household';
import { applyFinance, capacityOf, homeOf, homeUpfront, homeUpgradeCost, rentTierOf, upgradeCount } from './finance';
import { cityOfHousehold } from './location';
import type { Household, Person } from './types';
import { adjustBond, ageOf, childrenOf, membersOf, money, partnerOf, stat } from './util';

/** Debt deeper than this, with interest outrunning any surplus, prompts the downsizing talk. */
export const DEBT_WARNING = 25_000;

const TIERS = Object.keys(HOMES) as HomeTier[];
const hh = (c: Ctx) => c.s.households[c.me.householdId];
const runsHome = (c: Ctx) => headOf(c.s, hh(c).id)?.id === c.me.id;
const equity = (h: Household) => { const home = homeOf(h); return home ? Math.round(home.value * (1 - SELL_COSTS) - home.mortgage) : 0; };
const tierOf = (name: string) => TIERS.find((t) => HOMES[t].label === name);

/** The smallest home that fits `n` people. */
const fitsTier = (n: number) => TIERS.find((t) => HOMES[t].capacity >= n) ?? 'mansion';
/** The cheapest rental that fits `n` people, if any does. */
const fitsRental = (n: number) => (Object.keys(RENTALS) as RentTier[]).find((t) => RENTALS[t].capacity >= n);

/** Grown children at home who could set up on their own (families first). */
function couldMoveOut(c: Ctx): Person[] {
  const me = c.me;
  const partner = partnerOf(c.s, me.id);
  return membersOf(c.s, hh(c).id)
    .filter((p) => p.id !== me.id && p.id !== partner?.id && ageOf(p, c.s.year) >= 18 && (p.biologicalParents.includes(me.id) || p.adoptiveParents.includes(me.id)))
    .sort((a, b) => (partnerOf(c.s, b.id) ? 1 : 0) + childrenOf(c.s, b.id).length - ((partnerOf(c.s, a.id) ? 1 : 0) + childrenOf(c.s, a.id).length));
}

/** Sell up (if you own) and buy `tier` with 20% down; false if the money isn't there. */
function moveTo(c: Ctx, tier: HomeTier): boolean {
  const h = hh(c);
  const need = homeUpfront(tier, 0.2, cityOfHousehold(h));
  if (h.wallet + equity(h) < need) return false;
  if (homeOf(h)) applyFinance(c.s, { kind: 'sellHome' });
  applyFinance(c.s, { kind: 'buyHome', tier, downPct: 0.2 });
  return true;
}

export const HOME_EVENTS: EventDef[] = [
  {
    id: 'crowded_home',
    major: true,
    cooldown: 3,
    candidates: (c) => {
      if (!runsHome(c)) return [];
      const crowd = membersOf(c.s, hh(c).id).length - capacityOf(hh(c));
      return crowd > 0 ? [{ weight: 3 + crowd, urgent: crowd >= 2 }] : [];
    },
    build: (c) => {
      const h = hh(c);
      const n = membersOf(c.s, h.id).length;
      const home = homeOf(h);
      const city = cityOfHousehold(h);
      const addCost = homeUpgradeCost(c.s, h, 'expansion');
      const canAdd = !!home && upgradeCount(home, 'expansion') < HOME_UPGRADES.expansion.max;
      const tier = fitsTier(n);
      const bigger = home ? tier !== tierOf(home.name) && HOMES[tier].capacity > capacityOf(h) : false;
      const rental = !home ? fitsRental(n) : undefined;
      const upfront = homeUpfront(tier, 0.2, city);
      const leaver = couldMoveOut(c)[0];
      return {
        title: 'A full house',
        text: `${n} people live under one roof built for ${capacityOf(h)}. Lines for the bathroom, bunk beds in the den, and tempers running short.`,
        choices: [
          ...(canAdd ? [{ id: 'expand', label: `Build an addition (${money(addCost)})`, hint: 'One more bedroom', disabled: h.wallet < addCost }] : []),
          ...(rental && rental !== rentTierOf(h) ? [{ id: 'rent_bigger', label: `Rent a bigger place (${RENTALS[rental].label.toLowerCase()})`, hint: `Room for ${RENTALS[rental].capacity}` }] : []),
          ...(bigger || (!home && !rental) ? [{ id: 'move_up', label: `Move everyone to a ${HOMES[tier].label.toLowerCase()}`, hint: `${money(upfront)} up front${home ? ' after selling this one' : ''}; room for ${HOMES[tier].capacity}`, disabled: h.wallet + equity(h) < upfront }] : []),
          ...(leaver ? [{ id: 'move_out', label: `Help ${leaver.firstName}${partnerOf(c.s, leaver.id) ? ' and their family' : ''} find their own place`, hint: 'They may feel pushed out' }] : []),
          { id: 'squeeze', label: 'Make it work', hint: 'Crowded and stressful, but together' },
        ],
      };
    },
    resolve: (c, ch) => {
      const h = hh(c);
      if (ch === 'expand') {
        applyFinance(c.s, { kind: 'upgradeHome', upgrade: 'expansion' });
        return 'Months of sawdust and noise, and then a whole new room.';
      }
      if (ch === 'rent_bigger') {
        applyFinance(c.s, { kind: 'rent', tier: fitsRental(membersOf(c.s, h.id).length)! });
        return 'Moving day for everyone. Nobody has to share a bunk bed anymore.';
      }
      if (ch === 'move_up') {
        const tier = fitsTier(membersOf(c.s, h.id).length);
        return moveTo(c, tier) ? `A ${HOMES[tier].label.toLowerCase()} with room for everyone.` : 'The numbers fell through at the last minute. Still crowded.';
      }
      if (ch === 'move_out') {
        const k = couldMoveOut(c)[0];
        if (!k) return 'In the end, nobody was ready to go.';
        moveOut(c.s, k, Math.min(10_000, Math.max(0, Math.round(h.wallet * 0.05))));
        adjustBond(c.s, c.me.id, k.id, -6, -2);
        return `${k.firstName} found a place nearby. The house is quieter, and a little emptier.`;
      }
      for (const p of membersOf(c.s, h.id)) stat(p, 'stress', 4);
      return 'Everyone squeezed a little tighter. It is loud, but it is home.';
    },
  },
  {
    id: 'debt_spiral',
    major: true,
    cooldown: 4,
    candidates: (c) => {
      const h = hh(c);
      if (!runsHome(c) || h.wallet > -DEBT_WARNING) return [];
      // The debt grows on its own once interest outruns whatever is left over each year.
      const yearAhead = estimateYear(c.s).net + h.wallet * DEBT_RATE;
      return yearAhead < 0 ? [{ weight: 6, urgent: true }] : [];
    },
    build: (c) => {
      const h = hh(c);
      const home = homeOf(h);
      const n = membersOf(c.s, h.id).length;
      const smaller = home ? TIERS.find((t) => HOMES[t].capacity >= n && HOMES[t].price < home.value * 0.8) : undefined;
      const rental = fitsRental(n);
      const cheaperRental = !home && rental && RENTALS[rental].rent < RENTALS[rentTierOf(h)].rent ? rental : undefined;
      const interest = Math.round(-h.wallet * DEBT_RATE);
      return {
        title: 'The debt is snowballing',
        text: `You owe ${money(-h.wallet)}, and the interest alone (${money(interest)} a year) is more than you can put aside. Without a change, it will keep growing.`,
        choices: [
          ...(home ? [{ id: 'sell_rent', label: 'Sell the house and rent', hint: `About ${money(equity(h))} after the mortgage and fees` }] : []),
          ...(smaller ? [{ id: 'downsize', label: `Sell and buy a smaller ${HOMES[smaller].label.toLowerCase()}`, hint: 'Lower payments and upkeep', disabled: h.wallet + equity(h) < homeUpfront(smaller, 0.2, cityOfHousehold(h)) }] : []),
          ...(cheaperRental ? [{ id: 'cheaper_rent', label: `Move to a ${RENTALS[cheaperRental].label.toLowerCase()}`, hint: `${money(RENTALS[rentTierOf(h)].rent - RENTALS[cheaperRental].rent)} a year less rent` }] : []),
          ...(c.s.plan.lifestyle !== 'frugal' ? [{ id: 'frugal', label: 'Cut back to a frugal lifestyle', hint: 'Less spending from now on' }] : []),
          { id: 'ignore', label: 'It will work itself out', hint: 'The debt keeps growing' },
        ],
      };
    },
    resolve: (c, ch) => {
      const h = hh(c);
      if (ch === 'sell_rent') {
        applyFinance(c.s, { kind: 'sellHome' });
        applyFinance(c.s, { kind: 'rent', tier: fitsRental(membersOf(c.s, h.id).length) ?? 'house' });
        for (const p of membersOf(c.s, h.id)) stat(p, 'happiness', -4);
        return 'Saying goodbye to the house was hard. Breathing again was not.';
      }
      if (ch === 'downsize') {
        const n = membersOf(c.s, h.id).length;
        const home = homeOf(h)!;
        const tier = TIERS.find((t) => HOMES[t].capacity >= n && HOMES[t].price < home.value * 0.8)!;
        return moveTo(c, tier) ? `A smaller ${HOMES[tier].label.toLowerCase()}, and a budget that finally adds up.` : 'The sale fell through. The debt is still there.';
      }
      if (ch === 'cheaper_rent') {
        applyFinance(c.s, { kind: 'rent', tier: fitsRental(membersOf(c.s, h.id).length)! });
        return 'A smaller place, a smaller rent check.';
      }
      if (ch === 'frugal') {
        c.s.plan = { ...c.s.plan, lifestyle: 'frugal' };
        return 'Fewer dinners out, more lists on the fridge. It adds up.';
      }
      stat(c.me, 'stress', 6);
      return 'You put the bills in a drawer. They are still there.';
    },
  },
];
