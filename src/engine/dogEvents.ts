/** Dogs: illness, mischief, and the kids asking for one. */
import { canCover, charge, coverHint, hasCash, payEmergency } from './money';
import { adoptInto, dogsOf, dogStage, frailestDog, maxDogs } from './dogs';
import { BREEDS, DOG_YEARLY, SHELTER_FEE, type DogBreed } from '../content/dogs';
import type { Dog } from './types';
import { adjustBond, kidsAtHome, money, stat } from './util';
import { age, one, wallet, type EventDef } from './eventKit';

/** A vet bill for an illness: bigger dogs and older dogs cost more. */
const vetBill = (d: Dog, year: number) => Math.round((DOG_YEARLY[BREEDS[d.breed].size] * 0.8 + (dogStage(d, year) === 'senior' ? 600 : 0)) / 50) * 50;

export const DOG_EVENTS: EventDef[] = [
  // ── Dogs ──────────────────────────────────────────────────────────
  {
    id: 'dog_sick',
    major: false,
    cooldown: 2,
    // Older and less healthy dogs get sick more often.
    candidates: (c) => {
      const d = frailestDog(wallet(c));
      return one(!!d, d ? (dogStage(d, c.s.year) === 'senior' ? 2.5 : 0.4) + (100 - d.health) / 40 : 0);
    },
    build: (c) => {
      const d = frailestDog(wallet(c));
      const bill = d ? vetBill(d, c.s.year) : 0;
      return {
        title: 'A sick dog',
        text: d ? `${d.name} won't eat and won't get off the couch. The vet says treatment will cost ${money(bill)}.` : 'Your dog seems unwell.',
        choices: [
          { id: 'treat', label: `Pay for treatment (${money(bill)})`, hint: coverHint(wallet(c), bill), disabled: !d || !canCover(wallet(c), bill) },
          { id: 'wait', label: 'Wait and see', hint: 'Their health may get worse' },
        ],
      };
    },
    resolve: (c, ch) => {
      const d = frailestDog(wallet(c));
      if (!d) return 'They bounced back on their own.';
      if (ch === 'treat') {
        payEmergency(wallet(c), vetBill(d, c.s.year));
        d.health = Math.min(100, d.health + 25);
        d.bond = Math.min(100, d.bond + 5);
        return `${d.name} is back to stealing socks. Worth every penny.`;
      }
      d.health = Math.max(0, d.health - 25);
      stat(c.me, 'stress', 4);
      return `${d.name} is moving slowly. You keep a close eye on them.`;
    },
  },
  {
    id: 'dog_mischief',
    major: false,
    cooldown: 2,
    candidates: (c) => {
      const d = dogsOf(wallet(c)).find((x) => !x.trained && (dogStage(x, c.s.year) === 'puppy' || x.bond < 40));
      return one(!!d, 1.5);
    },
    build: (c) => {
      const d = dogsOf(wallet(c)).find((x) => !x.trained && (dogStage(x, c.s.year) === 'puppy' || x.bond < 40));
      return {
        title: 'Who did this?',
        text: `You come home to couch stuffing everywhere. ${d?.name ?? 'The dog'} looks very innocent. Replacing the cushions: $400.`,
        choices: [
          { id: 'class', label: 'Pay, and sign up for obedience class ($700 total)', disabled: !hasCash(wallet(c), 700) },
          { id: 'pay', label: 'Pay and laugh it off ($400)' },
        ],
      };
    },
    resolve: (c, ch) => {
      const dogs = dogsOf(wallet(c)).filter((x) => !x.trained);
      if (ch === 'class') {
        charge(wallet(c), 700);
        dogs.forEach((d) => { d.trained = true; d.bond = Math.min(100, d.bond + 5); });
        return 'Six weeks later: sit, stay, and a lot less shredding.';
      }
      charge(wallet(c), 400);
      stat(c.me, 'happiness', 1);
      return 'New cushions. The photo of the crime scene is now your phone background.';
    },
  },
  {
    id: 'kids_want_dog',
    major: false,
    cooldown: 4,
    candidates: (c) => {
      const kids = kidsAtHome(c.s, c.me).filter((k) => age(c, k) >= 6 && age(c, k) <= 14);
      const hh = wallet(c);
      return one(kids.length > 0 && !dogsOf(hh).length && dogsOf(hh).length < maxDogs(hh), 1.2);
    },
    build: (c) => {
      const kids = kidsAtHome(c.s, c.me).filter((k) => age(c, k) >= 6 && age(c, k) <= 14);
      return {
        title: 'Please, please, PLEASE',
        text: `${kids.map((k) => k.firstName).join(' and ')} ${kids.length > 1 ? 'have' : 'has'} made a slideshow titled "Why We Need A Dog." It's pretty convincing.`,
        choices: [
          { id: 'shelter', label: `Adopt from the shelter (${money(SHELTER_FEE)})`, hint: 'An older dog who needs a home', disabled: !hasCash(wallet(c), SHELTER_FEE) },
          { id: 'puppy', label: 'Get a puppy (about $1,500)', hint: 'Lots of energy, lots of chewing', disabled: !hasCash(wallet(c), 1500) },
          { id: 'no', label: 'Not right now' },
        ],
      };
    },
    resolve: (c, ch) => {
      const kids = kidsAtHome(c.s, c.me).filter((k) => age(c, k) >= 6 && age(c, k) <= 14);
      if (ch === 'no') {
        kids.forEach((k) => { stat(k, 'happiness', -3); adjustBond(c.s, c.me.id, k.id, -2, 0); });
        return 'The slideshow will return. Probably with music next time.';
      }
      const rescue = ch === 'shelter';
      const breed = rescue ? c.rng.pick(Object.keys(BREEDS) as DogBreed[]) : c.rng.pick(['labrador', 'beagle', 'golden'] as DogBreed[]);
      charge(wallet(c), rescue ? SHELTER_FEE : BREEDS[breed].price);
      const d = adoptInto(c.s, c.rng, breed, '', rescue ? c.rng.int(2, 6) : 0, rescue);
      kids.forEach((k) => { stat(k, 'happiness', 8); adjustBond(c.s, c.me.id, k.id, 5, 3); });
      return `The kids named ${rescue ? 'her' : 'the puppy'} ${d.name}. Nobody has stopped smiling.`;
    },
  },
];
