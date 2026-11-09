import type { ReactElement } from 'react';
import { CAREER_BY_ID } from '../../content/careers';
import { CONTRIBUTION_OPTIONS, EARLY_RETIREMENT_AGE, FULL_RETIREMENT_AGE, MATCH_CAP, PENSION_VESTING_YEARS } from '../../content/retirement';
import { financeBlocker } from '../../engine/finance';
import { readiness } from '../../engine/retirement';
import type { GameState } from '../../engine/types';
import { active, ageOf, money } from '../../engine/util';
import { useGame } from '../../store/gameStore';
import { Section, Segmented } from '../components';

const STATUS = {
  ready: { icon: '✅', label: 'On track' },
  tight: { icon: '⚠️', label: 'Tight' },
  not_yet: { icon: '❌', label: 'Not yet' },
} as const;

/** Retirement savings, pension status, and whether the household could afford to retire. */
export function RetirementCard({ g, Act }: { g: GameState; Act: (p: { g: GameState; action: { kind: 'retire' }; label: string; hint?: string; confirm?: string }) => ReactElement }) {
  const setPlan = useGame((s) => s.setPlan);
  const me = active(g);
  const age = ageOf(me, g.year);
  const job = me.jobId ? CAREER_BY_ID[me.jobId] : undefined;
  const rate = g.plan.retireContribution ?? 0;

  if (me.retired) {
    return (
      <Section title="🏖️ Retirement">
        <p>You're retired.</p>
        <div className="row"><span>Employer pension</span><strong>{money(me.pension)}/yr</strong></div>
        <div className="row"><span>Retirement savings</span><strong>{money(me.retirementSavings ?? 0)}</strong></div>
        <p className="hint">The state pension starts at {FULL_RETIREMENT_AGE}. Savings are drawn down so they last into your nineties.</p>
      </Section>
    );
  }

  const targets = [EARLY_RETIREMENT_AGE, 60, FULL_RETIREMENT_AGE].filter((a) => a >= age);
  if (!targets.length) targets.push(age);
  return (
    <Section title="🏖️ Retirement" aside={<strong>{money(me.retirementSavings ?? 0)}</strong>}>
      <div className="label">Save from each paycheck (before tax)</div>
      <Segmented<number>
        label="Retirement contribution"
        value={rate}
        onChange={(v) => setPlan({ ...g.plan, retireContribution: v })}
        options={CONTRIBUTION_OPTIONS.map((v) => ({ value: v, label: v ? `${v * 100}%` : 'None' }))}
      />
      <p className="hint">
        {job?.pension
          ? `Your job as a ${job.name.toLowerCase()} has a pension: ${me.pensionYears ?? 0} of ${PENSION_VESTING_YEARS} years to qualify${(me.pensionYears ?? 0) >= PENSION_VESTING_YEARS ? ' (qualified ✓)' : ''}.`
          : job ? `No pension at this job, but your employer matches half of what you save, up to ${MATCH_CAP * 100}% of pay.`
            : 'No job right now: nothing is being saved or earned toward a pension.'}
      </p>
      <table className="fin-table retire-table">
        <thead>
          <tr><th>Retire at</th><th className="num">Income</th><th className="num">Needed</th><th /></tr>
        </thead>
        <tbody>
          {targets.map((a) => {
            const r = readiness(g, me, a);
            return (
              <tr key={a} title={`Pension ${money(r.pension)} · state ${money(r.state)} · savings ${money(r.savingsIncome)}/yr (from ${money(r.savings)})`}>
                <td>{a}{a === age ? ' (now)' : ''}</td>
                <td className="num">{money(r.income)}</td>
                <td className="num">{money(r.need)}</td>
                <td className="num">{STATUS[r.status].icon} {STATUS[r.status].label}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint">
        Income counts employer pensions (smaller if taken before {FULL_RETIREMENT_AGE}), the state pension from {FULL_RETIREMENT_AGE}, and
        savings spread across retirement, for you and your spouse. "Needed" is a lean budget: living costs, housing, medical care and taxes.
      </p>
      {age >= EARLY_RETIREMENT_AGE ? (
        <div className="choices">
          <Act g={g} action={{ kind: 'retire' }} label={age < FULL_RETIREMENT_AGE ? `Retire early at ${age}` : `Retire at ${age}`}
            hint={financeBlocker(g, { kind: 'retire' }) ?? 'Stop working; pensions and savings take over'} confirm="Confirm: retire now" />
        </div>
      ) : (
        <p className="hint">You can retire from {EARLY_RETIREMENT_AGE} ({EARLY_RETIREMENT_AGE - age} years from now).</p>
      )}
    </Section>
  );
}
