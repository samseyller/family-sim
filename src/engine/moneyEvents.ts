/** Home and car: a house for sale, and car trouble. */
import { annuityPayment, HOMES, MORTGAGE_RATE, MORTGAGE_YEARS, SCRAP_VALUE } from '../content/finance';
import { breakdownChance, carAge, conditionOf, garagedIds, repairCost, shakiestCar } from './cars';
import { canCover, coverHint, payEmergency } from './emergency';
import { bestSkill } from './handy';
import { homePriceIn, homeUpfront, makeHome } from './finance';
import { cityName, myCity } from './location';
import type { Asset } from './types';
import { journal, kidsAtHome, money, stat } from './util';
import { one, wallet, type Ctx, type EventDef } from './eventKit';

export const HOUSE_EVENTS: EventDef[] = [
  // ── Arc: home and money ────────────────────────────────────────────
  {
    id: 'house_for_sale',
    major: true,
    cooldown: 4,
    candidates: (c) => one(!wallet(c).assets.some((a) => a.kind === 'house') && wallet(c).wallet >= homeUpfront('family', 0.1, myCity(c.s)), 3),
    build: (c) => {
      const city = myCity(c.s);
      const price = homePriceIn('family', city);
      const loan = price * 0.9;
      return {
        title: 'A house for sale',
        text: `A ${HOMES.family.label.toLowerCase()} in a good ${cityName(city)} school district is for sale: ${money(price)}, with ${money(homeUpfront('family', 0.1, city))} up front. No more rent, but a mortgage of ${money(annuityPayment(loan, MORTGAGE_RATE, MORTGAGE_YEARS))} a year. (You can also shop for homes any time in the Money tab.)`,
        choices: [
          { id: 'buy', label: 'Buy it', hint: 'Builds wealth over time' },
          { id: 'rent', label: 'Keep renting', hint: 'Keep your savings liquid' },
        ],
      };
    },
    resolve: (c, ch) => {
      if (ch !== 'buy') return 'You kept renting. The savings stay in the bank.';
      const city = myCity(c.s);
      wallet(c).wallet -= homeUpfront('family', 0.1, city);
      wallet(c).assets.push(makeHome(c.s, 'family', city, 0.1));
      for (const m of [c.me, ...kidsAtHome(c.s, c.me)]) stat(m, 'happiness', 6);
      journal(c.s, 'You bought a family home.', 'major');
      return 'You got the keys. The kids raced to claim bedrooms.';
    },
  },
];

/** A major repair: three times a typical one (less with a mechanic at home). */
const bigRepair = (c: Ctx, car: Asset) => repairCost(car, bestSkill(c.s, c.me.householdId, 'mechanics')) * 3;

export const CAR_EVENTS: EventDef[] = [
  {
    id: 'car_trouble',
    major: false,
    cooldown: 3,
    // Older and less reliable cars break down far more often.
    candidates: (c) => {
      const car = shakiestCar(wallet(c));
      return one(!!car, car ? 0.5 + 8 * breakdownChance(car, garagedIds(wallet(c)).has(car.id), bestSkill(c.s, c.me.householdId, 'mechanics')) : 0);
    },
    build: (c) => {
      const car = shakiestCar(wallet(c));
      const cost = car ? bigRepair(c, car) : 0;
      const old = car ? conditionOf(car).tone === 'bad' : false;
      return {
        title: 'Car trouble',
        text: car
          ? `The ${car.name} (${carAge(car)} years old) makes a horrible noise and dies on the highway. The repair will cost ${money(cost)}.${old ? ' The mechanic says it may not be worth it.' : ''}`
          : 'The car makes a horrible noise and dies on the highway.',
        choices: [
          { id: 'fix', label: `Pay for the repair (${money(cost)})`, disabled: !car || !canCover(wallet(c), cost), hint: coverHint(wallet(c), cost, old ? 'It may not last much longer' : undefined) },
          { id: 'scrap', label: 'Scrap it', hint: car ? `Get ${money(SCRAP_VALUE)}; buy another in the Money tab` : undefined, disabled: !car },
          { id: 'bus', label: 'Take the bus for a while', hint: 'Stress up, late to work' },
        ],
      };
    },
    resolve: (c, ch) => {
      const hh = wallet(c);
      const car = shakiestCar(hh);
      if (ch === 'fix' && car) {
        payEmergency(hh, bigRepair(c, car));
        return 'Fixed. Your wallet is lighter.';
      }
      if (ch === 'scrap' && car) {
        hh.assets = hh.assets.filter((a) => a !== car);
        hh.wallet += SCRAP_VALUE;
        journal(c.s, `You scrapped the ${car.name}.`, 'info');
        return 'The tow truck hauled it away. Time to go car shopping.';
      }
      stat(c.me, 'stress', 6);
      c.me.workPerf = Math.max(0, c.me.workPerf - 5);
      return 'The bus is slow, but you got through a lot of podcasts.';
    },
  },

];
