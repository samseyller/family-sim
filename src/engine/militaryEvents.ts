/** Decisions in military service (scheduled by militaryYear for the player). */
import { CAREER_BY_ID, titleOf } from '../content/careers';
import type { Ctx, EventDef } from './eventKit';
import {
  DISABILITY_PAY, PENSION_YEARS, REENLIST_BONUS, TOUR_YEARS, enlist, isActiveDuty, leaveService, promote, retireFromService, serviceYears,
} from './military';
import { adjustBond, ageOf, flag, journal, kidsAtHome, membersOf, money, stat } from './util';
import { credit } from './money';

const wallet = (c: Ctx) => c.s.households[c.me.householdId];
const family = (c: Ctx) => membersOf(c.s, c.me.householdId).filter((p) => p.id !== c.me.id);

export const MILITARY_EVENTS: EventDef[] = [
  {
    id: 'tour_end',
    major: true,
    cooldown: 0,
    build: (c) => {
      const job = c.me.jobId ? CAREER_BY_ID[c.me.jobId] : undefined;
      const officer = c.me.jobId === 'officer';
      const next = job && c.me.jobLevel < 3 ? titleOf(job, c.me.jobLevel + 1) : undefined;
      const years = serviceYears(c.me);
      const canPension = years >= PENSION_YEARS;
      const canOfficer = !officer && (!!c.me.flags.degree || c.me.stats.smarts >= 60);
      return {
        title: 'Your tour is ending',
        text: `After ${years} year${years === 1 ? '' : 's'} of service${job ? ` as a ${titleOf(job, c.me.jobLevel).toLowerCase()}` : ''}, it's time to decide what's next.`,
        choices: [
          { id: 'reenlist', label: `Sign on for another ${TOUR_YEARS}-year tour`, hint: `${next ? `Promotion to ${next}, ` : ''}${money(REENLIST_BONUS)} bonus` },
          ...(officer ? [] : [{ id: 'officer', label: 'Go to officer candidate school', hint: canOfficer ? 'Commissioned as a lieutenant' : 'Needs a degree or smarts 60+', disabled: !canOfficer }]),
          { id: 'reserve', label: 'Switch to the part-time reserve', hint: 'A weekend a month; the GI Bill pays for college' },
          { id: 'leave', label: 'Return to civilian life', hint: 'Veteran; the GI Bill pays for college or night school' },
          ...(canPension ? [{ id: 'retire', label: 'Retire from the military', hint: 'Half your pay as a pension, for life' }] : []),
        ],
      };
    },
    resolve: (c, ch) => {
      const me = c.me;
      if (!isActiveDuty(me)) return 'Your service had already ended.';
      if (ch === 'reenlist') {
        promote(me);
        me.flags.tour_end = c.s.year + TOUR_YEARS;
        me.flags.tours = (me.flags.tours ?? 0) + 1;
        credit(wallet(c), REENLIST_BONUS);
        journal(c.s, `You re-enlisted and were promoted to ${titleOf(CAREER_BY_ID[me.jobId!], me.jobLevel)}.`, 'major');
        return 'Another tour. New stripes, and a bonus in the bank.';
      }
      if (ch === 'officer') {
        enlist(c.s, me, true);
        return 'Twelve weeks of officer school later, you pinned on lieutenant’s bars.';
      }
      if (ch === 'retire') {
        retireFromService(c.s, me);
        return 'A ceremony, a folded flag for your years of service, and a pension for life.';
      }
      leaveService(c.s, me, ch === 'reserve' ? 'reserve' : 'civilian');
      for (const p of family(c)) adjustBond(c.s, me.id, p.id, 5, 3);
      journal(c.s, ch === 'reserve' ? 'You left active duty for the reserve.' : 'You left the military as a veteran.', 'major');
      return ch === 'reserve' ? 'Home for good, with a weekend a month in uniform.' : 'Home for good. Your family was waiting at the gate.';
    },
  },
  {
    id: 'deployment',
    major: false,
    cooldown: 0,
    build: (c) => ({
      title: 'Deployment orders',
      text: `Your unit is deploying overseas for nine months.${kidsAtHome(c.s, c.me).length ? ' The kids keep asking how many sleeps until you are back.' : ''}`,
      choices: [
        { id: 'calls', label: 'Video-call home every week', hint: 'Family bonds hold up better' },
        { id: 'mission', label: 'Focus on the mission', hint: 'Better performance; family feels it' },
        { id: 'letters', label: 'Write letters to everyone at home', hint: 'Something they can keep' },
      ],
    }),
    resolve: (c, ch) => {
      if (ch === 'calls') {
        for (const p of family(c)) adjustBond(c.s, c.me.id, p.id, 4, 2);
        stat(c.me, 'stress', 2);
        return 'A tiny screen, bad connections, and the best part of every week.';
      }
      if (ch === 'mission') {
        c.me.workPerf = Math.min(100, c.me.workPerf + 15);
        for (const p of family(c)) adjustBond(c.s, c.me.id, p.id, -3, -1);
        return 'Your commander noticed your work. Home felt very far away.';
      }
      for (const p of family(c)) adjustBond(c.s, c.me.id, p.id, 3, 4);
      return 'Every letter home got read until the paper went soft.';
    },
  },
  {
    id: 'line_of_duty_injury',
    major: true,
    severe: true,
    cooldown: 0,
    build: () => ({
      title: 'Injured in the line of duty',
      text: 'You were seriously injured during your deployment and evacuated to a military hospital. The doctors say you will recover, but it will take time.',
      choices: [
        { id: 'recover', label: 'Recover and return to duty', hint: 'Months of rehab; your unit is waiting' },
        { id: 'discharge', label: 'Accept a medical discharge', hint: `Veteran, with ${money(DISABILITY_PAY)}/yr disability pay` },
      ],
    }),
    resolve: (c, ch) => {
      flag(c.me, 'purple_heart');
      for (const p of family(c)) adjustBond(c.s, c.me.id, p.id, 6, 4);
      if (ch === 'discharge' && isActiveDuty(c.me)) {
        leaveService(c.s, c.me, 'civilian');
        c.me.flags.disability = 1;
        journal(c.s, 'You were medically discharged and awarded the Purple Heart.', 'major');
        return 'You came home with a medal, a cane for a while, and a family who would not let go of you.';
      }
      stat(c.me, 'health', 10);
      journal(c.s, 'You were awarded the Purple Heart and returned to duty.', 'major');
      return 'It took months of physical therapy. Then you laced up your boots again.';
    },
  },
  {
    id: 'reserve_callup',
    major: true,
    cooldown: 0,
    build: (c) => {
      const kids = kidsAtHome(c.s, c.me).length;
      return {
        title: 'Your reserve unit is called up',
        text: 'Orders came: a year of active duty overseas. Your civilian job has to hold your spot.',
        choices: [
          { id: 'go', label: 'Report for duty' },
          { id: 'hardship', label: 'Request a hardship exemption', hint: kids ? 'Possible with kids at home' : 'Unlikely without kids at home' },
        ],
      };
    },
    resolve: (c, ch) => {
      const kids = kidsAtHome(c.s, c.me).length;
      if (ch === 'hardship' && c.rng.chance(kids ? 0.6 : 0.15)) return 'Your exemption was approved. You stay home this time.';
      c.me.flags.deployed_year = c.s.year;
      stat(c.me, 'stress', 8);
      for (const p of family(c)) adjustBond(c.s, c.me.id, p.id, -3, 0);
      if (c.rng.chance(0.02) && ageOf(c.me, c.s.year) < 65) {
        stat(c.me, 'health', -20);
        flag(c.me, 'purple_heart');
        return 'You were injured during the deployment, but you made it home. The scars are part of you now.';
      }
      return ch === 'hardship' ? 'The exemption was denied. A year away, and then home.' : 'A year away, and then the best hug of your life at the airport.';
    },
  },
];
