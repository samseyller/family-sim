/** Activities: Cats and dogs. */
import { active, ageOf, clamp, stat } from './util';
import { dogsOf } from './dogs';
import { adoptCatInto, catsOf, maxCats } from './cats';
import { CAT_BREEDS, CAT_SHELTER_FEE } from '../content/cats';
import { maybeMeetFriend } from './friends';
import { isSingle, meetSomeone } from './romance';
import { type ActivityDef, flat, bondAll, moodAll, hasDog, myDogs, hasCat, myCats, dogNames } from './activityKit';
import { charge, hasCash } from './money';

export const PET_ACTIVITIES: ActivityDef[] = [
  // 🐈 Cats (everything here includes all your cats)
  {
    id: 'play_with_cats', category: 'pets', icon: '🧶', label: 'Play with the cats', who: 'household', min: 0, requires: hasCat, desc: 'A laser pointer, a feather wand, and sudden bursts of chaos.',
    energy: flat(3), cost: flat(0),
    run: (c) => {
      const cats = myCats(c);
      cats.forEach((x) => { x.lastPlayYear = c.s.year; x.bond = clamp(x.bond + 5, 0, 100); });
      moodAll(c, 'happiness', 3);
      moodAll(c, 'stress', -2);
      bondAll(c, 2, 1);
      return { text: `${dogNames(cats)} chased the red dot until they pretended they meant to stop.`, tone: 'good' };
    },
  },
  {
    id: 'cat_nap', category: 'pets', icon: '😴', label: 'Nap with the cat', who: 'solo', perYear: 3, requires: hasCat, desc: 'A warm cat on your chest. The best kind of rest.',
    energy: flat(2), cost: flat(0),
    run: (c) => {
      const cat = [...myCats(c)].sort((a, b) => b.bond - a.bond)[0];
      cat.bond = clamp(cat.bond + 3, 0, 100);
      stat(c.me, 'stress', -6);
      stat(c.me, 'happiness', 2);
      return { text: `${cat.name} purred like a tiny engine. You woke up two hours later, very rested.`, tone: 'good' };
    },
  },
  {
    id: 'cat_vet', category: 'pets', icon: '🩺', label: 'Cat vet check-up', who: 'solo', perYear: 2, requires: hasCat, desc: 'Shots, a once-over, and a carrier nobody wants to get into.',
    energy: flat(4), cost: (s) => 180 * catsOf(s.households[active(s).householdId]).length,
    run: (c) => {
      const cats = myCats(c);
      cats.forEach((x) => { x.health = clamp(x.health + 12, 0, 100); x.bond = clamp(x.bond - 1, 0, 100); });
      return { text: `${dogNames(cats)} ${cats.length > 1 ? 'are' : 'is'} healthy, and deeply offended by the thermometer.`, tone: 'good' };
    },
  },
  {
    id: 'cat_grooming', category: 'pets', icon: '🪮', label: 'Brush the long-haired cats', who: 'solo', requires: (s) => (catsOf(s.households[active(s).householdId]).some((x) => CAT_BREEDS[x.breed].longHair) ? null : 'Needs a long-haired cat.'),
    desc: 'Fewer hairballs, fewer mats, a little more trust.',
    energy: flat(3), cost: flat(0),
    run: (c) => {
      const cats = myCats(c).filter((x) => CAT_BREEDS[x.breed].longHair);
      cats.forEach((x) => { x.health = clamp(x.health + 3, 0, 100); x.bond = clamp(x.bond + 2, 0, 100); });
      return { text: `Enough fur came off ${dogNames(cats)} to build another cat.`, tone: 'good' };
    },
  },
  {
    id: 'cat_cafe', category: 'pets', icon: '☕', label: 'Visit a cat café', who: 'solo', ages: [12, 100], desc: 'Coffee among a dozen adoptable cats. Some people go home with one.',
    energy: flat(5), cost: flat(20),
    run: (c) => {
      stat(c.me, 'happiness', 4);
      stat(c.me, 'stress', -3);
      const hh = c.s.households[c.me.householdId];
      if (ageOf(c.me, c.s.year) >= 18 && catsOf(hh).length < maxCats(hh) && hasCash(hh, CAT_SHELTER_FEE) && c.rng.chance(0.15)) {
        charge(hh, CAT_SHELTER_FEE);
        const cat = adoptCatInto(c.s, c.rng, 'tabby', '', c.rng.int(1, 6), 'shelter');
        return { text: `${cat.name} climbed into your lap and refused to leave. You signed the adoption papers.`, tone: 'good' };
      }
      if (isSingle(c.s, c.me) && ageOf(c.me, c.s.year) >= 18 && c.rng.chance(0.08)) {
        const sp = meetSomeone(c.s, c.rng, c.me, 'at the cat café');
        return { text: `You and ${sp.firstName} reached for the same kitten. Now you're dating.`, tone: 'good' };
      }
      const f = maybeMeetFriend(c.s, c.rng, c.me, 0.12, 'at the cat café');
      return { text: f ? `You got talking with ${f.firstName}, who knew every cat by name. Friends now.` : 'A calico fell asleep on your foot. You stayed an extra hour.', tone: 'good' };
    },
  },

  // 🐕 Dogs (everything here includes all your dogs)
  {
    id: 'walk_dogs', category: 'pets', icon: '🦮', label: 'Walk the dog', who: 'household', min: 0, requires: hasDog, desc: 'Fresh air for everyone. Energetic breeds need this most.',
    energy: flat(5), cost: flat(0),
    run: (c) => {
      const dogs = myDogs(c);
      dogs.forEach((d) => { d.lastWalkYear = c.s.year; d.bond = clamp(d.bond + 6, 0, 100); d.health = clamp(d.health + 2, 0, 100); });
      moodAll(c, 'fitness', 2);
      moodAll(c, 'stress', -3);
      bondAll(c, 2, 1);
      return { text: `${dogNames(dogs)} sniffed every single tree on the block.`, tone: 'good' };
    },
  },
  {
    id: 'play_fetch', category: 'pets', icon: '🎾', label: 'Play fetch', who: 'household', min: 0, requires: hasDog, desc: 'A ball, a yard, endless enthusiasm.',
    energy: flat(4), cost: flat(0),
    run: (c) => {
      const dogs = myDogs(c);
      dogs.forEach((d) => { d.bond = clamp(d.bond + 4, 0, 100); });
      moodAll(c, 'happiness', 3);
      bondAll(c, 2, 1);
      return { text: dogs.some((d) => d.breed === 'frenchie') ? 'One throw, one fetch, one long nap. Classic.' : `${dogNames(dogs)} brought the ball back 200 times.`, tone: 'good' };
    },
  },
  {
    id: 'dog_park', category: 'pets', icon: '🌳', label: 'Dog park', who: 'solo', requires: hasDog, desc: 'Zoomies, sniffing, and chatting with other dog people.',
    energy: flat(7), cost: flat(0),
    run: (c) => {
      const dogs = myDogs(c);
      dogs.forEach((d) => { d.lastWalkYear = c.s.year; d.bond = clamp(d.bond + 5, 0, 100); });
      stat(c.me, 'happiness', 4);
      // Dogs are great icebreakers.
      if (isSingle(c.s, c.me) && c.rng.chance(0.15)) {
        const sp = meetSomeone(c.s, c.rng, c.me, 'at the dog park');
        return { text: `${dogNames(dogs)} made friends with ${sp.firstName}'s dog, and you made friends with ${sp.firstName}. You're dating now.`, tone: 'good' };
      }
      const f = maybeMeetFriend(c.s, c.rng, c.me, 0.15, 'at the dog park');
      return { text: f ? `${dogNames(dogs)} made a best friend, and so did you: ${f.firstName}.` : `${dogNames(dogs)} ran laps until they flopped down in the shade.`, tone: 'good' };
    },
  },
  {
    id: 'obedience_class', category: 'pets', icon: '🎓', label: 'Obedience class', who: 'solo', perYear: 1, requires: hasDog, desc: 'Sit, stay, leave it. Fewer chewed shoes.',
    energy: flat(10), cost: (s) => 300 * dogsOf(s.households[active(s).householdId]).length,
    run: (c) => {
      const dogs = myDogs(c);
      dogs.forEach((d) => { d.trained = true; d.bond = clamp(d.bond + 5, 0, 100); });
      return { text: `${dogNames(dogs)} graduated! (Mostly for good behavior.)`, tone: 'good' };
    },
  },
  {
    id: 'vet_visit', category: 'pets', icon: '🩺', label: 'Vet check-up', who: 'solo', perYear: 2, requires: hasDog, desc: 'Shots, a once-over, and a treat for being brave.',
    energy: flat(4), cost: (s) => 250 * dogsOf(s.households[active(s).householdId]).length,
    run: (c) => {
      const dogs = myDogs(c);
      dogs.forEach((d) => { d.health = clamp(d.health + 12, 0, 100); });
      return { text: `The vet says ${dogNames(dogs)} ${dogs.length > 1 ? 'are' : 'is'} doing well. Treats all around.`, tone: 'good' };
    },
  },
  {
    id: 'dog_grooming', category: 'pets', icon: '🛁', label: 'Grooming day', who: 'solo', requires: hasDog, desc: 'A bath, a trim, and a bandana.',
    energy: flat(3), cost: (s) => 90 * dogsOf(s.households[active(s).householdId]).length,
    run: (c) => {
      const dogs = myDogs(c);
      dogs.forEach((d) => { d.bond = clamp(d.bond + 3, 0, 100); });
      stat(c.me, 'happiness', 2);
      return { text: `${dogNames(dogs)} came home fluffy and very proud of the bandana.`, tone: 'good' };
    },
  },

];
