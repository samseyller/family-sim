/** Health follow-ups: test results after a check-up found something. */
import { local } from './eventKit';
import type { EventDef } from './eventKit';
import { canCover, coverHint, payEmergency } from './money';
import { flag, journal, money, stat } from './util';

/** Years until the results of a worrying check-up come back. */
export const TEST_RESULTS_DELAY = 1;

/** What treatment costs after insurance (before city prices). */
const TREATMENT = 3000;

export const HEALTH_EVENTS: EventDef[] = [
  {
    // Scheduled by a check-up that found something (never picked at random).
    id: 'test_results',
    major: false,
    cooldown: 0,
    build: (c) => {
      const cost = local(c, TREATMENT);
      const hh = c.s.households[c.me.householdId];
      return {
        title: 'Test results',
        text: `The doctor calls about last year's tests. Something needs attention: caught early, it's very treatable. Treatment would cost about ${money(cost)} after insurance.`,
        choices: [
          { id: 'treat', label: `Start treatment now (${money(cost)})`, hint: coverHint(hh, cost, 'The best odds'), disabled: !canCover(hh, cost) },
          { id: 'wait', label: 'Watch and wait', hint: 'Free, but it might get worse' },
        ],
      };
    },
    resolve: (c, ch) => {
      if (ch === 'treat') {
        payEmergency(c.s.households[c.me.householdId], local(c, TREATMENT));
        stat(c.me, 'health', 10);
        stat(c.me, 'stress', -4);
        flag(c.me, 'caught_early');
        journal(c.s, 'You were treated for something a check-up caught early.', 'good');
        return 'A few months of appointments, and then the all-clear. That check-up may have saved your life.';
      }
      if (c.rng.chance(0.5)) {
        stat(c.me, 'health', 2);
        return 'The follow-up scan came back clear. Whatever it was, it went away on its own.';
      }
      stat(c.me, 'health', -12);
      stat(c.me, 'stress', 8);
      journal(c.s, 'A health problem you put off got worse.', 'bad');
      return 'It got worse while you waited. The treatment is harder now, but the doctors are hopeful.';
    },
  },
];
