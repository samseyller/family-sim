/** Cat moments: a sick cat, a shredded couch, a stray at the door, a "gift", and meeting the dog. */
import { CAT_BREEDS, CAT_TREE_COST, type CatBreed } from '../content/cats';
import { adoptCatInto, catAge, catsOf, catStage, frailestCat, maxCats } from './cats';
import { dogsOf } from './dogs';
import { hash } from './jobMarket';
import type { Ctx, EventDef } from './events';
import type { Cat } from './types';
import { ageOf, clamp, flag, money, stat } from './util';

const hh = (c: Ctx) => c.s.households[c.me.householdId];
const one = (cond: boolean, weight: number) => (cond ? [{ weight }] : []);
const vetBill = (cat: Cat, year: number) => (catStage(cat, year) === 'senior' ? 1400 : 700);
const mischiefMaker = (c: Ctx) => catsOf(hh(c)).find((x) => catStage(x, c.s.year) === 'kitten' || x.bond < 40);

export const CAT_EVENTS: EventDef[] = [
  {
    id: 'cat_sick',
    major: false,
    cooldown: 2,
    candidates: (c) => {
      const cat = frailestCat(hh(c));
      return one(!!cat, cat ? (catStage(cat, c.s.year) === 'senior' ? 2 : 0.3) + (100 - cat.health) / 40 : 0);
    },
    build: (c) => {
      const cat = frailestCat(hh(c));
      const bill = cat ? vetBill(cat, c.s.year) : 0;
      return {
        title: 'A sick cat',
        text: cat ? `${cat.name} is hiding under the bed and skipping meals. The vet wants to run tests: ${money(bill)}.` : 'Your cat seems unwell.',
        choices: [
          { id: 'treat', label: `Pay for the vet (${money(bill)})`, disabled: !cat || hh(c).wallet < bill },
          { id: 'wait', label: 'Wait and see', hint: 'Cats hide it when they are unwell' },
        ],
      };
    },
    resolve: (c, ch) => {
      const cat = frailestCat(hh(c));
      if (!cat) return 'They were back on the windowsill by morning.';
      if (ch === 'treat') {
        hh(c).wallet -= vetBill(cat, c.s.year);
        cat.health = clamp(cat.health + 25, 0, 100);
        return `${cat.name} is eating again and yelling for breakfast at 5 a.m. Normal service resumed.`;
      }
      cat.health = clamp(cat.health - 25, 0, 100);
      stat(c.me, 'stress', 3);
      return `${cat.name} is still not quite right. You keep checking on them.`;
    },
  },
  {
    id: 'cat_mischief',
    major: false,
    cooldown: 2,
    candidates: (c) => one(!hh(c).catTree && !!mischiefMaker(c), 1.2),
    build: (c) => {
      const cat = mischiefMaker(c);
      return {
        title: 'The couch has seen better days',
        text: `${cat?.name ?? 'The cat'} has been using the arm of the couch as a scratching post. Reupholstering: $300.`,
        choices: [
          { id: 'tree', label: `Pay, and buy a cat tree (${money(300 + CAT_TREE_COST)})`, hint: 'Somewhere better to scratch', disabled: hh(c).wallet < 300 + CAT_TREE_COST },
          { id: 'pay', label: 'Pay and throw a blanket over it ($300)' },
        ],
      };
    },
    resolve: (c, ch) => {
      if (ch === 'tree') {
        hh(c).wallet -= 300 + CAT_TREE_COST;
        hh(c).catTree = true;
        for (const x of catsOf(hh(c))) x.bond = clamp(x.bond + 5, 0, 100);
        return 'The cat tree was ignored for one day, then claimed forever. The couch is safe.';
      }
      hh(c).wallet -= 300;
      return 'A blanket now lives on the couch. The cat now lives under the blanket.';
    },
  },
  {
    id: 'stray_cat',
    major: false,
    cooldown: 12,
    // Rare: only some years (seeded) bring a stray to the door.
    candidates: (c) => one(hash(`${c.s.seed}:${c.s.year}:stray`) % 100 < 3 && ageOf(c.me, c.s.year) >= 18 && catsOf(hh(c)).length < maxCats(hh(c)), 1),
    build: () => ({
      title: 'A visitor at the door',
      text: 'A skinny cat has been sitting on your doorstep every evening this week. Tonight, they walked right in.',
      choices: [
        { id: 'adopt', label: 'Let them stay (vet check $150)', hint: 'Strays pick their people' },
        { id: 'shelter', label: 'Take them to the shelter', hint: 'They will find a good home' },
        { id: 'feed', label: 'Leave food out, but keep the door closed' },
      ],
    }),
    resolve: (c, ch) => {
      if (ch === 'adopt') {
        hh(c).wallet -= 150;
        const breed: CatBreed = c.rng.chance(0.85) ? 'tabby' : c.rng.pick(Object.keys(CAT_BREEDS) as CatBreed[]);
        const cat = adoptCatInto(c.s, c.rng, breed, '', c.rng.int(1, 5), 'stray');
        return `You named them ${cat.name}. They claimed the best chair within the hour.`;
      }
      if (ch === 'shelter') {
        stat(c.me, 'happiness', 2);
        return 'The shelter staff knew them right away: a sweetheart. They will be adopted in no time.';
      }
      return 'The food bowl is empty every morning. You like knowing someone is out there, fed.';
    },
  },
  {
    id: 'cat_gift',
    major: false,
    cooldown: 4,
    candidates: (c) => one(catsOf(hh(c)).some((x) => x.bond >= 60 && catAge(x, c.s.year) >= 1), 0.7),
    build: (c) => {
      const cat = catsOf(hh(c)).find((x) => x.bond >= 60)!;
      return {
        title: 'A present on the doormat',
        text: `${cat.name} proudly drops a very surprised (and perfectly fine) mouse at your feet, then waits for praise.`,
        choices: [
          { id: 'praise', label: 'Thank them, then quietly release the mouse outside' },
          { id: 'scold', label: '"We do NOT bring those inside."' },
        ],
      };
    },
    resolve: (c, ch) => {
      const cat = catsOf(hh(c)).find((x) => x.bond >= 60);
      if (!cat) return 'The mouse escaped on its own. Everyone pretended it never happened.';
      if (ch === 'praise') {
        cat.bond = clamp(cat.bond + 4, 0, 100);
        return `${cat.name} looked deeply satisfied. The mouse ran for the hedges.`;
      }
      cat.bond = clamp(cat.bond - 3, 0, 100);
      return `${cat.name} turned their back on you for the rest of the evening. Message received.`;
    },
  },
  {
    // Once per life: the first time a cat and a dog share a home.
    id: 'cats_and_dogs',
    major: false,
    cooldown: 0,
    candidates: (c) => one(!c.me.flags.cats_dogs_met && catsOf(hh(c)).length > 0 && dogsOf(hh(c)).length > 0, 5),
    build: (c) => {
      const cat = catsOf(hh(c))[0];
      const dog = dogsOf(hh(c))[0];
      return {
        title: 'Cats and dogs',
        text: `${dog.name} has noticed ${cat.name}. ${cat.name} has noticed ${dog.name}. Nobody is blinking.`,
        choices: [
          { id: 'slow', label: 'Slow introductions, with treats', hint: 'A few careful weeks' },
          { id: 'wing', label: 'Let them work it out', hint: 'Could go either way' },
        ],
      };
    },
    resolve: (c, ch) => {
      c.me.flags.cats_dogs_met = 1;
      const cat = catsOf(hh(c))[0];
      const dog = dogsOf(hh(c))[0];
      if (ch === 'slow' || c.rng.chance(0.5)) {
        flag(c.me, 'cats_dogs_friends');
        cat.bond = clamp(cat.bond + 4, 0, 100);
        return `A month later, ${cat.name} sleeps curled up against ${dog.name}. Best friends.`;
      }
      cat.bond = clamp(cat.bond - 5, 0, 100);
      return `${cat.name} now rules the top of the fridge, and ${dog.name} has learned to keep a respectful distance.`;
    },
  },
];
