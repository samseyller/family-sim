/**
 * Life's big expenses and misfortunes.
 *
 * Fixed beats (they come with life stages): the wedding and honeymoon after a "yes", kids'
 * birthday parties, a car for a new driver, graduation gifts, a parent's retirement party, and
 * a parent's funeral. Most have a cheap option, but skipping has a cost in relationships.
 *
 * Misfortunes are rolled each year with real-world-style odds (see rollMisfortunes): a car
 * accident, a house fire, a break-in, a flood (only likely in flood-prone cities), surprise
 * medical bills, an adult child in legal trouble, and relatives asking for money. Insurance
 * (paid every year in the budget) turns most disasters into a deductible.
 */
import { CITIES } from '../content/cities';
import { DEDUCTIBLE } from '../content/economy';
import { makeCar, parkingFree, workingCars } from './cars';
import { canCover, coverHint, payEmergency } from './emergency';
import { pushPending, type Ctx, type EventDef } from './eventKit';
import { homeOf, upgradeCount } from './finance';
import { cityOfHousehold } from './location';
import type { Rng } from './rng';
import { severeGuard } from './tutorial';
import type { GameState, Household, Person } from './types';
import {
  active, adjustBond, ageOf, alive, childrenOf, clamp, flag, getBond, journal, kidsAtHome, membersOf, money, parentsOf, stat,
} from './util';

const wallet = (c: Ctx) => c.s.households[c.me.householdId];
const age = (c: Ctx, p: Person) => ageOf(p, c.s.year);
/** Prices scale with the city's everyday costs, rounded to $50. */
const local = (c: Ctx, n: number) => Math.round((n * CITIES[cityOfHousehold(wallet(c))].living) / 50) * 50;
const pay = (c: Ctx, n: number) => { wallet(c).wallet -= n; };
/** Pay for an emergency fix: cash first, then investments. */
const payE = (c: Ctx, n: number) => { payEmergency(wallet(c), n); };
const isMine = (me: Person, k: Person) => k.biologicalParents.includes(me.id) || k.adoptiveParents.includes(me.id);
/** Give money to someone: into a child's fund at home, otherwise their household. */
function give(c: Ctx, to: Person, n: number) {
  payE(c, n);
  if (to.householdId === c.me.householdId && age(c, to) < 18) to.fund += n;
  else c.s.households[to.householdId].wallet += n;
  flag(c.me, 'given_to_family', n);
}
/** Choice helper: a priced option that's disabled when you can't pay. */
const priced = (c: Ctx, id: string, label: string, cost: number, hint?: string) =>
  ({ id, label: cost ? `${label} (${money(cost)})` : label, hint, disabled: cost > 0 && wallet(c).wallet < cost });
/** Choice helper for an emergency fix: investments can cover what cash can't (pay it with payE). */
const emergency = (c: Ctx, id: string, label: string, cost: number, hint?: string) =>
  ({ id, label: `${label} (${money(cost)})`, hint: coverHint(wallet(c), cost, hint), disabled: !canCover(wallet(c), cost) });

/** A parent of the player who died this year or last and hasn't had a funeral yet. */
const recentlyDeceasedParent = (c: Ctx) =>
  parentsOf(c.s, c.me).find((p) => !alive(p) && p.deathYear! >= c.s.year - 1 && !p.flags.funeral_held);

// ── Fixed life events ─────────────────────────────────────────────────

const WEDDING = { courthouse: 600, small: 12000, big: 35000, dream: 80000 } as const;
const HONEYMOON = { road_trip: 2500, beach: 8000, europe: 16000 } as const;

export const LIFE_EVENTS: EventDef[] = [
  {
    // Enqueued when a proposal is accepted. Subject: the new spouse.
    id: 'wedding',
    major: false,
    cooldown: 0,
    build: (c, p) => {
      const help = parentsHelp(c);
      return {
        title: 'Planning the wedding',
        text: `You and ${p!.firstName} need to plan the big day.${help ? ` Your parents offer ${money(help)} toward it.` : ''}`,
        choices: [
          { id: 'courthouse', label: `Courthouse and dinner (${money(local(c, WEDDING.courthouse))})`, hint: 'Simple and sweet; always possible' },
          priced(c, 'small', 'Small wedding', Math.max(0, local(c, WEDDING.small) - help), '40 guests, a backyard, a great playlist'),
          priced(c, 'big', 'Big wedding', Math.max(0, local(c, WEDDING.big) - help), '150 guests and a band'),
          priced(c, 'dream', 'Dream wedding', Math.max(0, local(c, WEDDING.dream) - help), 'A destination, a designer dress, fireworks'),
        ],
      };
    },
    resolve: (c, ch, p) => {
      const help = ch === 'courthouse' ? 0 : parentsHelp(c);
      const cost = Math.max(0, local(c, WEDDING[ch as keyof typeof WEDDING]) - help);
      pay(c, cost);
      if (help) for (const par of parentsOf(c.s, c.me).filter(alive)) c.s.households[par.householdId].wallet -= help / Math.max(1, parentsOf(c.s, c.me).filter(alive).length);
      const joy = { courthouse: 3, small: 8, big: 10, dream: 12 }[ch as keyof typeof WEDDING];
      stat(c.me, 'happiness', joy);
      adjustBond(c.s, c.me.id, p!.id, joy / 2, 3);
      if (ch === 'big' || ch === 'dream') for (const par of parentsOf(c.s, c.me).filter(alive)) adjustBond(c.s, c.me.id, par.id, 4, 2);
      if (ch === 'dream') { flag(c.me, 'dream_wedding'); stat(c.me, 'stress', 4); }
      pushPending(c, LIFE_EVENTS.find((e) => e.id === 'honeymoon')!, p); // straight after the wedding
      return {
        courthouse: 'Two signatures, one great dinner, zero stress.',
        small: 'Fairy lights, close friends, and dancing until midnight.',
        big: 'Everyone you love in one room. Your feet hurt for days.',
        dream: 'A wedding people will talk about for years. So will your bank.',
      }[ch as keyof typeof WEDDING];
    },
  },
  {
    id: 'honeymoon',
    major: false,
    cooldown: 0,
    build: (c, p) => ({
      title: 'The honeymoon',
      text: `Where do you and ${p!.firstName} go to celebrate?`,
      choices: [
        priced(c, 'road_trip', 'Road trip', local(c, HONEYMOON.road_trip)),
        priced(c, 'beach', 'Beach resort', local(c, HONEYMOON.beach)),
        priced(c, 'europe', 'Two weeks in Europe', local(c, HONEYMOON.europe)),
        { id: 'skip', label: 'Skip it; save the money', hint: 'Practical, but a little sad' },
      ],
    }),
    resolve: (c, ch, p) => {
      if (ch === 'skip') {
        adjustBond(c.s, c.me.id, p!.id, -2, 0);
        return 'Straight back to work on Monday.';
      }
      pay(c, local(c, HONEYMOON[ch as keyof typeof HONEYMOON]));
      const lift = { road_trip: 4, beach: 7, europe: 9 }[ch as keyof typeof HONEYMOON];
      adjustBond(c.s, c.me.id, p!.id, lift, 4);
      stat(c.me, 'happiness', lift);
      stat(c.me, 'stress', -6);
      return { road_trip: 'Diners, motels, and singing in the car.', beach: 'Sun, sand, and a lot of naps.', europe: 'Pasta in Rome, croissants in Paris. Unforgettable.' }[ch as keyof typeof HONEYMOON];
    },
  },
  {
    id: 'kid_birthday',
    major: false,
    cooldown: 2,
    candidates: (c) => kidsAtHome(c.s, c.me).filter((k) => isMine(c.me, k) && age(c, k) >= 3 && age(c, k) <= 12).slice(0, 2).map((k) => ({ subject: k, weight: 1, urgent: false })),
    build: (c, k) => ({
      title: `${k!.firstName} turns ${age(c, k!)}`,
      text: `${k!.firstName} has been counting down for weeks. How do you celebrate?`,
      choices: [
        priced(c, 'home', 'Cake and friends at home', local(c, 150)),
        priced(c, 'venue', 'A party at the trampoline park', local(c, 900)),
        priced(c, 'epic', 'An epic party (bouncy castle, magician, the works)', local(c, 4000)),
        { id: 'skip', label: 'Just a quiet dinner', hint: 'They notice' },
      ],
    }),
    resolve: (c, ch, k) => {
      if (ch === 'skip') {
        stat(k!, 'happiness', -4);
        adjustBond(c.s, c.me.id, k!.id, -3, -1);
        return `${k!.firstName} said it was fine. It wasn't really fine.`;
      }
      const cost = { home: 150, venue: 900, epic: 4000 }[ch as 'home'];
      pay(c, local(c, cost));
      const joy = { home: 3, venue: 5, epic: 8 }[ch as 'home'];
      stat(k!, 'happiness', joy);
      adjustBond(c.s, c.me.id, k!.id, joy, 2);
      return { home: 'Frosting everywhere. Perfect.', venue: 'Twenty kids, one trampoline park, zero naps.', epic: 'The other parents are still talking about the magician.' }[ch as 'home'];
    },
  },
  {
    id: 'kid_car',
    major: false,
    cooldown: 0,
    candidates: (c) => kidsAtHome(c.s, c.me).filter((k) => isMine(c.me, k) && age(c, k) >= 16 && !k.flags.car_talk).slice(0, 1).map((k) => ({ subject: k, weight: 4, urgent: false })),
    build: (c, k) => {
      const room = parkingFree(wallet(c)) > 0;
      const why = room ? undefined : 'No parking spot left';
      return {
        title: `${k!.firstName} got their license!`,
        text: `${k!.firstName} passed the driving test and keeps "accidentally" leaving car listings open on your laptop.`,
        choices: [
          { ...priced(c, 'used', 'Buy them a used car', 9000), ...(room ? {} : { disabled: true, hint: why }) },
          { ...priced(c, 'new', 'Buy them a new car', 24000), ...(room ? {} : { disabled: true, hint: why }) },
          { id: 'share', label: 'They can borrow the family car', hint: 'Cheaper; some arguments' },
          { id: 'save', label: 'They save up for their own', hint: 'Builds character (and patience)' },
        ],
      };
    },
    resolve: (c, ch, k) => {
      k!.flags.car_talk = 1;
      if (ch === 'used' || ch === 'new') {
        pay(c, ch === 'used' ? 9000 : 24000);
        wallet(c).assets.push(makeCar(c.s, ch === 'used' ? 'used' : 'compact'));
        stat(k!, 'happiness', ch === 'new' ? 10 : 7);
        adjustBond(c.s, c.me.id, k!.id, ch === 'new' ? 8 : 6, 2);
        return ch === 'new' ? `${k!.firstName} screamed. The neighbors came out to look.` : `It's dented and it's perfect. ${k!.firstName} washes it every weekend.`;
      }
      if (ch === 'share') {
        stat(k!, 'happiness', -2);
        return 'The car keys now live in a contested zone.';
      }
      adjustBond(c.s, c.me.id, k!.id, -2, 4);
      flag(k!, 'saved_for_car');
      return `${k!.firstName} picked up extra shifts. They'll appreciate it more for having earned it.`;
    },
  },
  {
    // Enqueued at high-school graduation; also fires when a child finishes college or trade school.
    id: 'graduation_gift',
    major: false,
    cooldown: 0,
    candidates: (c) => childrenOf(c.s, c.me.id)
      .filter((k) => alive(k) && k.flags.graduated === c.s.year && !k.flags.grad_gift_college)
      .slice(0, 1).map((k) => ({ subject: k, weight: 6, urgent: false })),
    build: (c, k) => ({
      title: `${k!.firstName}'s graduation`,
      text: `${k!.firstName} walked across the stage${k!.flags.graduated === c.s.year ? ' with a diploma in hand' : ''}. A gift?`,
      choices: [
        { id: 'card', label: 'A heartfelt card' },
        priced(c, 'g1', 'A card and $1,000', 1000),
        priced(c, 'g5', 'A new laptop and $5,000', 5000),
        priced(c, 'g20', 'A $20,000 head start', 20000, 'Toward rent, a car, or savings'),
      ],
    }),
    resolve: (c, ch, k) => {
      if (k!.flags.graduated === c.s.year) k!.flags.grad_gift_college = 1;
      const n = { card: 0, g1: 1000, g5: 5000, g20: 20000 }[ch as 'card'];
      if (n) give(c, k!, n);
      adjustBond(c.s, c.me.id, k!.id, n >= 5000 ? 6 : n ? 4 : 2, 2);
      return n >= 20000 ? `${k!.firstName} hugged you for a full minute.` : `${k!.firstName} grinned for the photos.`;
    },
  },
  {
    id: 'retirement_party',
    major: false,
    cooldown: 0,
    candidates: (c) => parentsOf(c.s, c.me).filter((p) => alive(p) && p.flags.retired_year === c.s.year).slice(0, 1).map((p) => ({ subject: p, weight: 5, urgent: false })),
    build: (c, p) => ({
      title: `${p!.firstName} is retiring`,
      text: `After a lifetime of work, ${p!.firstName} handed in the badge. How do you mark it?`,
      choices: [
        { id: 'attend', label: 'Show up to the office send-off' },
        priced(c, 'party', 'Throw them a party', local(c, 3000)),
        priced(c, 'trip', 'A surprise party and a trip for them', local(c, 10000)),
        { id: 'skip', label: 'Send a text', hint: 'They will remember' },
      ],
    }),
    resolve: (c, ch, p) => {
      const lift = { attend: 3, party: 8, trip: 12, skip: -6 }[ch as 'attend'];
      if (ch === 'party') pay(c, local(c, 3000));
      if (ch === 'trip') { pay(c, local(c, 10000)); stat(p!, 'happiness', 10); }
      adjustBond(c.s, c.me.id, p!.id, lift, Math.max(0, lift / 2));
      return ch === 'skip' ? `${p!.firstName} said "Thanks, kiddo." Just that.` : `${p!.firstName} gave a speech and cried a little.`;
    },
  },
  {
    // Scheduled when a parent dies (no subject: they are gone).
    id: 'funeral',
    major: false,
    cooldown: 0,
    build: (c) => {
      const p = recentlyDeceasedParent(c);
      return {
        title: p ? `Saying goodbye to ${p.firstName}` : 'Saying goodbye',
        text: 'The family needs to decide on the service.',
        choices: [
          { id: 'simple', label: `A simple cremation and gathering (${money(local(c, 4000))})`, hint: 'Always possible' },
          priced(c, 'traditional', 'A traditional funeral', local(c, 12000)),
          priced(c, 'celebration', 'A big celebration of life', local(c, 22000)),
        ],
      };
    },
    resolve: (c, ch) => {
      const p = recentlyDeceasedParent(c);
      if (p) p.flags.funeral_held = 1;
      pay(c, local(c, { simple: 4000, traditional: 12000, celebration: 22000 }[ch as 'simple']));
      const comfort = { simple: 1, traditional: 3, celebration: 5 }[ch as 'simple'];
      stat(c.me, 'happiness', comfort);
      for (const other of parentsOf(c.s, c.me).filter(alive)) adjustBond(c.s, c.me.id, other.id, comfort, 2);
      return ch === 'celebration' ? 'Stories, laughter and tears. It felt like them.' : 'A quiet goodbye with the people who loved them.';
    },
  },

  // ── Misfortunes (scheduled by rollMisfortunes) ───────────────────────
  {
    id: 'car_accident',
    major: false,
    severe: true,
    cooldown: 0,
    build: (c) => {
      const car = workingCars(wallet(c))[0];
      const totaled = !!car && (car.age ?? 0) >= 10;
      return {
        title: 'Car accident',
        text: car
          ? `Someone ran a red light and hit the ${car.name}. Nobody was badly hurt.${totaled ? ' The insurer says it’s totaled.' : ''}`
          : 'You were in a fender-bender.',
        choices: totaled
          ? [{ id: 'claim', label: `Take the insurance payout (${money(Math.max(0, car!.value - DEDUCTIBLE.car))})`, hint: 'The car is gone' }, emergency(c, 'self', 'Fix it yourself anyway', local(c, 4000))]
          : [{ id: 'claim', label: `File a claim (${money(DEDUCTIBLE.car)} deductible)`, hint: 'Your premium goes up for 3 years' }, emergency(c, 'self', 'Pay for repairs yourself', local(c, 3500), 'Keep your premium low')],
      };
    },
    resolve: (c, ch) => {
      const hh = wallet(c);
      const car = workingCars(hh)[0];
      const totaled = !!car && (car.age ?? 0) >= 10;
      if (c.rng.chance(0.25)) {
        stat(c.me, 'health', -8);
        pay(c, 1500);
      }
      if (totaled && ch === 'claim') {
        hh.assets = hh.assets.filter((a) => a !== car);
        hh.wallet += Math.max(0, car!.value - DEDUCTIBLE.car - car!.mortgage);
        return 'You signed the papers and watched the tow truck drive off. Time to shop for a car.';
      }
      if (ch === 'claim') {
        pay(c, DEDUCTIBLE.car);
        c.me.flags.car_claim_year = c.s.year;
        return 'Insurance covered the rest. Your next renewal notice will sting.';
      }
      payE(c, local(c, totaled ? 4000 : 3500));
      return 'Good as new, and your premium stays put.';
    },
  },
  {
    id: 'house_fire',
    major: true,
    severe: true,
    cooldown: 0,
    build: (c) => {
      const home = homeOf(wallet(c));
      return {
        title: 'Fire!',
        text: home
          ? 'An electrical fire tore through the kitchen and living room. Everyone got out safely. Insurance will rebuild.'
          : 'A fire in the building forced everyone out. Your belongings are smoke-damaged.',
        choices: home
          ? [
            { id: 'rebuild', label: `Rebuild (${money(DEDUCTIBLE.home)} deductible)` },
            priced(c, 'better', 'Rebuild and upgrade the kitchen', DEDUCTIBLE.home + local(c, 25000), 'Adds value'),
          ]
          : [{ id: 'replace', label: `Replace your things (${money(500)} renters' deductible)` }],
      };
    },
    resolve: (c, ch) => {
      const home = homeOf(wallet(c));
      for (const m of membersOf(c.s, wallet(c).id)) { stat(m, 'happiness', -8); stat(m, 'stress', 8); }
      flag(c.me, 'insured_claim');
      if (!home) { pay(c, 500); return 'Months of hotel breakfasts, but renters insurance covered almost everything.'; }
      pay(c, DEDUCTIBLE.home);
      if (ch === 'better') { pay(c, local(c, 25000)); home.value += 30000; return 'Out of the ashes: a kitchen you actually love.'; }
      return 'Six months of contractors later, you were home.';
    },
  },
  {
    id: 'robbery',
    major: false,
    severe: true,
    cooldown: 0,
    build: (c) => {
      const home = homeOf(wallet(c));
      const loss = local(c, 6000);
      const deductible = home ? DEDUCTIBLE.car : 500;
      return {
        title: 'Break-in',
        text: `Someone broke in while you were out and took about ${money(loss)} in electronics and jewelry.`,
        choices: [
          { id: 'claim', label: `File a claim (${money(deductible)} deductible)` },
          ...(home && !upgradeCount(home, 'security')
            ? [priced(c, 'security', 'Claim it, and install a security system', deductible + local(c, 3000), 'Break-ins far less likely; $400/yr monitoring')]
            : []),
          { id: 'eat', label: 'Don’t bother with insurance', hint: `Lose ${money(loss)}` },
        ],
      };
    },
    resolve: (c, ch) => {
      const home = homeOf(wallet(c));
      stat(c.me, 'stress', 5);
      if (ch === 'eat') { pay(c, local(c, 6000)); return 'You replaced what mattered and changed the locks.'; }
      pay(c, home ? DEDUCTIBLE.car : 500);
      flag(c.me, 'insured_claim');
      if (ch === 'security' && home) {
        pay(c, local(c, 3000));
        home.upgrades = [...(home.upgrades ?? []), 'security'];
        home.upkeep += 400;
        return 'New cameras, new alarm, and you sleep better.';
      }
      return 'Insurance covered most of it. You bought better locks.';
    },
  },
  {
    id: 'flood',
    major: true,
    severe: true,
    cooldown: 0,
    build: (c) => {
      const hh = wallet(c);
      const home = homeOf(hh);
      const damage = home ? Math.round(home.value * 0.18) : local(c, 4000);
      return {
        title: 'Flood',
        text: home
          ? `Days of storms flooded the ground floor. Repairs will cost about ${money(damage)}.${hh.floodInsurance ? ' You have flood insurance.' : ' Regular home insurance doesn’t cover floods.'}`
          : `The apartment flooded. About ${money(damage)} of your things are ruined (renters insurance doesn't cover floods).`,
        choices: home && hh.floodInsurance
          ? [{ id: 'claim', label: `Flood claim (${money(DEDUCTIBLE.home)} deductible)` }]
          : home
            ? [emergency(c, 'repair', 'Pay for full repairs', damage), { id: 'patch', label: `Patch what you can (${money(Math.round(damage / 3))})`, hint: 'The house loses value' }]
            : [emergency(c, 'replace', 'Replace everything', damage), { id: 'make_do', label: 'Make do', hint: 'Everyone is unhappy for a while' }],
      };
    },
    resolve: (c, ch) => {
      const hh = wallet(c);
      const home = homeOf(hh);
      const damage = home ? Math.round(home.value * 0.18) : local(c, 4000);
      for (const m of membersOf(c.s, hh.id)) stat(m, 'stress', 6);
      if (ch === 'claim') { pay(c, DEDUCTIBLE.home); flag(c.me, 'insured_claim'); return 'The insurance check came. Best money you ever spent.'; }
      if (ch === 'repair' || ch === 'replace') { payE(c, damage); return 'Fans, dehumidifiers, new drywall. Expensive, but fixed.'; }
      if (ch === 'patch' && home) { pay(c, Math.round(damage / 3)); home.value = Math.round(home.value * 0.9); return 'It works, mostly. A buyer would notice.'; }
      for (const m of membersOf(c.s, hh.id)) stat(m, 'happiness', -5);
      return 'You salvaged what you could.';
    },
  },
  {
    id: 'medical_bill',
    major: false,
    severe: true,
    cooldown: 0,
    build: (c, p) => {
      const bill = local(c, p!.id === c.me.id ? 6000 : 4500);
      return {
        title: 'A surprise medical bill',
        text: `${p!.id === c.me.id ? 'You' : p!.firstName} needed an emergency surgery. After insurance, you owe ${money(bill)}.`,
        choices: [
          emergency(c, 'pay', 'Pay it', bill),
          { id: 'negotiate', label: 'Negotiate with the hospital', hint: 'Might cut it in half; stressful' },
          { id: 'plan', label: 'Payment plan', hint: `${money(Math.round(bill * 1.2))} over time, stressful` },
        ],
      };
    },
    resolve: (c, ch, p) => {
      const bill = local(c, p!.id === c.me.id ? 6000 : 4500);
      stat(p!, 'health', -5);
      if (ch === 'pay') { payE(c, bill); return 'Paid. Back to normal.'; }
      stat(c.me, 'stress', 6);
      if (ch === 'negotiate') {
        if (c.rng.chance(0.5)) { pay(c, Math.round(bill / 2)); return 'After two hours on hold, they cut it in half.'; }
        pay(c, bill);
        return 'They wouldn’t budge. You paid in full.';
      }
      pay(c, Math.round(bill * 1.2));
      return 'Monthly payments for a while. It adds up.';
    },
  },
  {
    id: 'legal_trouble',
    major: true,
    severe: true,
    cooldown: 0,
    build: (c, k) => ({
      title: `${k!.firstName} is in trouble`,
      text: `${k!.firstName} called you from the police station: arrested after a bar fight. They swear it wasn't their fault.`,
      choices: [
        emergency(c, 'lawyer', 'Hire a good lawyer', local(c, 10000), 'Most likely cleared'),
        { id: 'public', label: 'Let a public defender handle it', hint: 'Free; a coin flip' },
        { id: 'alone', label: 'They made their bed', hint: 'Tough love' },
      ],
    }),
    resolve: (c, ch, k) => {
      const odds = ch === 'lawyer' ? 0.85 : ch === 'public' ? 0.5 : 0.3;
      if (ch === 'lawyer') payE(c, local(c, 10000));
      adjustBond(c.s, c.me.id, k!.id, ch === 'lawyer' ? 6 : ch === 'public' ? 0 : -12, ch === 'alone' ? -8 : 3);
      if (c.rng.chance(odds)) return `The charges were dropped. ${k!.firstName} promised it would never happen again.`;
      flag(k!, 'record');
      stat(k!, 'happiness', -10);
      k!.jobId = undefined;
      journal(c.s, `${k!.firstName} was convicted and lost their job.`, 'bad');
      return `${k!.firstName} was convicted. A record will follow them for a while.`;
    },
  },
  {
    id: 'money_request',
    major: false,
    severe: true,
    cooldown: 0,
    build: (c, p) => {
      const ask = askAmount(c, p!);
      return {
        title: `${p!.firstName} needs help`,
        text: `${p!.firstName} is behind on bills and asks if you can help with ${money(ask)}.`,
        choices: [
          emergency(c, 'give', 'Give it to them', ask),
          emergency(c, 'lend', 'Lend it (they promise to pay you back)', ask),
          { id: 'no', label: 'Say no', hint: 'It will hurt' },
        ],
      };
    },
    resolve: (c, ch, p) => {
      const ask = askAmount(c, p!);
      if (ch === 'no') { adjustBond(c.s, c.me.id, p!.id, -8, -4); return `${p!.firstName} said they understood. They didn't call for a while.`; }
      give(c, p!, ask);
      adjustBond(c.s, c.me.id, p!.id, ch === 'give' ? 8 : 4, 4);
      if (ch === 'lend') c.s.scheduled.push({ dueYear: c.s.year + 2, eventId: 'loan_repaid', subjectId: p!.id });
      return `${p!.firstName} hugged you and promised to pay it forward.`;
    },
  },
  {
    // Two years after a loan to family: maybe they pay it back.
    id: 'loan_repaid',
    major: false,
    cooldown: 0,
    build: (_c, p) => ({ title: `${p!.firstName} and the loan`, text: `It's been two years since you lent ${p!.firstName} money.`, choices: [{ id: 'ok', label: 'See what happens' }] }),
    resolve: (c, _ch, p) => {
      if (c.rng.chance(0.6)) {
        const back = askAmount(c, p!);
        wallet(c).wallet += back;
        return `${p!.firstName} paid you back in full, with a thank-you card.`;
      }
      adjustBond(c.s, c.me.id, p!.id, -3, -5);
      return `${p!.firstName} never brought it up. You decided not to either.`;
    },
  },
];

/** What parents chip in toward a wedding: generous when they're comfortable and close. */
function parentsHelp(c: Ctx) {
  const ps = parentsOf(c.s, c.me).filter((p) => alive(p) && p.householdId !== c.me.householdId);
  if (!ps.length) return 0;
  const rich = c.s.households[ps[0].householdId].wallet;
  const close = ps.reduce((sum, p) => sum + getBond(c.s, c.me.id, p.id).affinity, 0) / ps.length;
  return rich > 60000 && close >= 30 ? Math.round(Math.min(15000, rich * 0.1) / 500) * 500 : 0;
}

const askAmount = (c: Ctx, p: Person) => (age(c, p) >= 60 ? 8000 : 5000);

// ── Yearly: misfortune rolls and life at home ───────────────────────

/** Car insurance costs 30% more for 3 years after a claim. */
export const claimSurcharge = (s: GameState) => (s.year - (active(s).flags.car_claim_year ?? -99) < 3 ? 1.3 : 1);

/**
 * Roll this year's misfortunes for the player's household and schedule the decisions.
 * At most two per year; none while the guided life is still protected.
 */
export function rollMisfortunes(s: GameState, rng: Rng) {
  const me = active(s);
  if (!alive(me) || ageOf(me, s.year) < 18 || severeGuard(s)) return;
  const hh = s.households[me.householdId];
  const home = homeOf(hh);
  const due: { eventId: string; subjectId?: string }[] = [];
  const add = (eventId: string, chance: number, subjectId?: string) => {
    if (due.length < 2 && rng.chance(chance)) due.push({ eventId, subjectId });
  };
  add('car_accident', 1 - Math.pow(0.97, workingCars(hh).length));
  add('house_fire', 0.004);
  add('robbery', home && upgradeCount(home, 'security') ? 0.01 : 0.025);
  add('flood', CITIES[cityOfHousehold(hh)].flood);
  const insured = membersOf(s, hh.id).filter((p) => ageOf(p, s.year) < 65);
  const sick = rng.pick(insured.length ? insured : [me]);
  add('medical_bill', clamp(0.04 * insured.length, 0, 0.2), sick.id);
  for (const k of childrenOf(s, me.id).filter((k) => alive(k) && ageOf(k, s.year) >= 18 && ageOf(k, s.year) <= 35)) {
    const risky = (k.flags.resents ?? 0) >= 3 || k.stats.happiness < 40;
    add('legal_trouble', risky ? 0.03 : 0.012, k.id);
  }
  if (s.year - (s.lastFired.money_request ?? -99) >= 3) {
    const needy = [...parentsOf(s, me), ...childrenOf(s, me.id)].filter((p) => alive(p) && ageOf(p, s.year) >= 18 && p.householdId !== hh.id
      && s.households[p.householdId].wallet < 3000);
    for (const p of needy.slice(0, 2)) add('money_request', 0.12, p.id);
  }
  for (const d of due) s.scheduled.push({ dueYear: s.year, ...d });
}

/** Yearly perks of home upgrades for everyone living there. */
export function homeLife(s: GameState) {
  for (const hh of Object.values(s.households) as Household[]) {
    const home = homeOf(hh);
    if (!home?.upgrades?.length) continue;
    const people = membersOf(s, hh.id);
    for (const p of people) {
      const kid = ageOf(p, s.year) < 18;
      if (upgradeCount(home, 'pool')) stat(p, 'happiness', kid ? 3 : 2);
      if (upgradeCount(home, 'hot_tub') && !kid) stat(p, 'stress', -3);
      if (upgradeCount(home, 'home_gym')) stat(p, 'fitness', 2);
      if (upgradeCount(home, 'theater')) stat(p, 'happiness', 1);
      if (upgradeCount(home, 'workshop') && !kid) stat(p, 'stress', -2);
    }
    if (upgradeCount(home, 'theater')) {
      const me = active(s);
      if (me.householdId === hh.id) for (const p of people) if (p.id !== me.id) adjustBond(s, me.id, p.id, 1, 0);
    }
  }
}

