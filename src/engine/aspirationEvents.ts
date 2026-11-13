/**
 * Choosing what you want from life, and noticing when something's missing. Low fulfillment opens choices; it is
 * never a spiral: refocusing, talking it over, or choosing a new aspiration (with a grace period) all help.
 */
import type { EventDef } from './eventKit';
import { ASPIRATION_INFO, ASPIRATIONS, aspirationOf, suggestAspiration } from './fulfillment';
import type { Aspiration } from './types';
import { adjustBond, ageOf, journal, partnerOf, stat } from './util';

/** Years after choosing a new aspiration during which a weak year can't lower fulfillment. */
export const ASPIRATION_GRACE = 2;
/** Fulfillment below this (for a while) brings up "something's missing". */
export const LOW_FULFILLMENT = 32;

export const ASPIRATION_EVENTS: EventDef[] = [
  {
    // Scheduled when the active character is an adult without an aspiration (coming of age, an heir, an older save).
    id: 'choose_aspiration',
    stage: 'any',
    major: false,
    cooldown: 0,
    build: (c) => {
      const current = c.me.aspiration;
      const suggested = current ? undefined : suggestAspiration(c.me);
      const order = [...(suggested ? [suggested] : []), ...ASPIRATIONS.filter((a) => a !== suggested)];
      return {
        title: current ? 'A new direction' : 'What do you want from life?',
        text: current
          ? `For years you’ve aimed for ${ASPIRATION_INFO[current].label.toLowerCase()}. Is that still what matters most?`
          : 'Looking ahead, what would make your life feel well spent? (You can change your mind later.)',
        choices: order.map((a) => ({
          id: a,
          label: `${ASPIRATION_INFO[a].icon} ${ASPIRATION_INFO[a].label}${a === suggested ? ' (suggested)' : a === current ? ' (keep it)' : ''}`,
          hint: ASPIRATION_INFO[a].desc,
        })),
      };
    },
    resolve: (c, ch) => {
      const a = ch as Aspiration;
      const changed = !!c.me.aspiration && c.me.aspiration !== a;
      c.me.aspiration = a;
      if (changed) c.me.flags.aspiration_grace = c.s.year + ASPIRATION_GRACE;
      journal(c.s, `${changed ? 'A new direction' : 'You set your sights on'}: ${ASPIRATION_INFO[a].label.toLowerCase()}.`, 'info');
      return changed
        ? `${ASPIRATION_INFO[a].desc} A change of course isn’t a failure; you’re giving yourself time to settle in.`
        : `${ASPIRATION_INFO[a].desc} Fulfillment grows when your years serve it.`;
    },
  },
  {
    id: 'something_missing',
    major: false,
    cooldown: 4,
    candidates: (c) => (ageOf(c.me, c.s.year) >= 20 && (c.me.fulfillment ?? 50) < LOW_FULFILLMENT ? [{ weight: 1.5 }] : []),
    build: (c) => {
      const a = ASPIRATION_INFO[aspirationOf(c.me)];
      return {
        title: 'Something’s missing',
        text: `Lately the years blur together. You wanted ${a.label.toLowerCase()} from life, and it hasn’t been happening.`,
        choices: [
          { id: 'refocus', label: 'Make room for what matters next year', hint: a.desc },
          { id: 'talk', label: 'Talk it over with someone close' },
          { id: 'change', label: 'Maybe you want something different now', hint: 'Choose a new aspiration, with time to settle in' },
          { id: 'accept', label: 'It’s just a phase' },
        ],
      };
    },
    resolve: (c, ch) => {
      if (ch === 'refocus') { c.me.flags.refocus_year = c.s.year + 1; return 'You wrote down what you want next year to look like. Now plan for it.'; }
      if (ch === 'talk') {
        const p = partnerOf(c.s, c.me.id);
        if (p) adjustBond(c.s, c.me.id, p.id, 4, 4);
        c.me.fulfillment = Math.min(100, (c.me.fulfillment ?? 50) + 5);
        return p ? `${p.firstName} listened, and had a few good ideas. You feel less alone in it.` : 'An old friend listened for an hour. It helped more than you expected.';
      }
      if (ch === 'change') {
        c.s.scheduled.push({ dueYear: c.s.year + 1, eventId: 'choose_aspiration', subjectId: c.me.id });
        return 'You’ll think about what you really want. (You’ll choose next year.)';
      }
      stat(c.me, 'stress', -2);
      return 'You decided not to dwell on it.';
    },
  },
];
