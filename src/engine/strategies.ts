/** Scripted play styles used by the headless sim and tests. */
import { TIME_BUDGET } from '../content/actions';
import { CAREER_BY_ID, requiredBlocks } from '../content/careers';
import { defaultPlan, sanitizePlan } from './generate';
import type { GameState, Plan } from './types';
import { active, kidsAtHome, partnerOf } from './util';

export type Strategy = 'career' | 'family' | 'balanced';

export function strategyPlan(s: GameState, kind: Strategy): Plan {
  if (kind === 'balanced') return defaultPlan(s);
  const me = active(s);
  const alloc: Record<string, number> = {};
  let left = TIME_BUDGET;
  const give = (k: string, n: number) => {
    const g = Math.min(n, left);
    if (g > 0) alloc[k] = (alloc[k] ?? 0) + g;
    left -= g;
  };
  const req = me.jobId && !me.retired && !me.studyingUntil ? requiredBlocks(CAREER_BY_ID[me.jobId], me.jobLevel) : 0;
  const kids = kidsAtHome(s, me);
  const partner = partnerOf(s, me.id);
  const children: Plan['children'] = {};
  if (kind === 'career') {
    give('work', req ? req + 3 : 0);
    give('learn', 1);
    for (const k of kids) children[k.id] = { focus: 'studies', tutoring: true, lessons: false, fundContribution: 5000 };
  } else {
    give('work', req);
    if (partner) give('partner_time', 2);
    for (const k of kids) {
      give(`child_time:${k.id}`, 1);
      give(`homework:${k.id}`, 1);
      children[k.id] = { focus: 'free', tutoring: false, lessons: true, fundContribution: 2000 };
    }
  }
  give('exercise', 1);
  give('relax', left);
  return sanitizePlan(s, { alloc, children, jobIntents: [] });
}
