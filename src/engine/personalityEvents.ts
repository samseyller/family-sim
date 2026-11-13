/**
 * Small moments that come from what someone actually did this year, coloured by who they are. Traits may make a
 * moment a little likelier or change how it lands; they never decide it on their own.
 */
import { activitySituation } from './activitySituations';
import type { Ctx, EventDef } from './eventKit';
import { reaction } from './personality';
import { adjustBond, ageOf, flag, partnerOf, stat } from './util';

/** This year's activities of a given kind. */
const doneThisYear = (c: Ctx, sit: string) => (c.s.activityLog ?? []).filter((x) => x.year === c.s.year && activitySituation(x.id) === sit).length;
/** Activities done for the first time this year. */
const firstTimesThisYear = (c: Ctx) => {
  const log = c.s.activityLog ?? [];
  const earlier = new Set(log.filter((x) => x.year < c.s.year).map((x) => x.id));
  return new Set(log.filter((x) => x.year === c.s.year && !earlier.has(x.id)).map((x) => x.id)).size;
};
const adult = (c: Ctx) => ageOf(c.me, c.s.year) >= 18;

export const PERSONALITY_EVENTS: EventDef[] = [
  {
    // After helping people out more than once this year.
    id: 'noticed_help',
    major: false,
    cooldown: 3,
    candidates: (c) => (adult(c) && doneThisYear(c, 'help') >= 2 ? [{ weight: 0.6 + (c.me.traits.includes('kind') ? 0.2 : 0) }] : []),
    build: (c) => {
      const p = partnerOf(c.s, c.me.id);
      const stretched = c.me.stats.stress >= 70;
      return {
        title: 'Your help didn’t go unnoticed',
        text: `${p ? p.firstName : 'A friend'} noticed how much you’ve been helping everyone this year${stretched ? ', and how tired you look' : ''}.`,
        choices: [
          { id: 'accept', label: stretched ? 'Let them take something off your plate' : 'Say thanks, and mean it' },
          { id: 'brush_off', label: 'It was nothing', hint: 'Modest' },
        ],
      };
    },
    resolve: (c, ch) => {
      const p = partnerOf(c.s, c.me.id);
      flag(c.me, 'noticed_help');
      if (ch === 'brush_off') {
        stat(c.me, 'happiness', 2);
        return 'You waved it off, but you were quietly pleased.';
      }
      if (p) adjustBond(c.s, c.me.id, p.id, 5, 4);
      if (c.me.stats.stress >= 70) {
        stat(c.me, 'stress', -8);
        return `${p ? p.firstName : 'Your friend'} took over the next few errands. Saying yes to help was harder than giving it, and it helped.`;
      }
      stat(c.me, 'happiness', 4);
      return 'A small thank-you, and it stayed with you all week.';
    },
  },
  {
    // After trying something new this year.
    id: 'interest_sticks',
    major: false,
    cooldown: 4,
    candidates: (c) => (adult(c) && firstTimesThisYear(c) >= 1 ? [{ weight: 0.3 * reaction(c.me, 'newThing').factor }] : []),
    build: () => ({
      title: 'A new interest',
      text: 'Something you tried for the first time this year keeps coming back to you. You catch yourself reading about it late at night.',
      choices: [
        { id: 'keep', label: 'Make it a regular thing', hint: 'A little time and money, now and then' },
        { id: 'let_go', label: 'It was fun once', hint: 'No regrets' },
      ],
    }),
    resolve: (c, ch) => {
      if (ch === 'let_go') return 'A nice memory. On to the next thing.';
      flag(c.me, 'new_interest');
      const r = reaction(c.me, 'newThing');
      stat(c.me, 'happiness', Math.round(4 * r.factor));
      stat(c.me, 'stress', -2);
      return r.factor > 1 ? 'You found a new corner of the world to explore. You love this kind of thing.' : 'It’s become a small, steady pleasure in your week.';
    },
  },
];
