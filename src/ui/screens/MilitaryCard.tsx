import { useEffect, useState } from 'react';
import { CAREER_BY_ID, titleOf } from '../../content/careers';
import { ENLIST_AGE, PENSION_YEARS, TOUR_YEARS, enlistBlocker, inReserve, isActiveDuty, serviceYears } from '../../engine/military';
import type { GameState } from '../../engine/types';
import { active, ageOf, money } from '../../engine/util';
import { useGame } from '../../store/gameStore';

/** Military status in the Work section, and a recruiter for those who might enlist. */
export function MilitaryCard({ g }: { g: GameState }) {
  const me = active(g);
  const enlist = useGame((s) => s.enlist);
  const [armed, setArmed] = useState<null | 'enlisted' | 'officer'>(null);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  const age = ageOf(me, g.year);

  if (isActiveDuty(me)) {
    const job = CAREER_BY_ID[me.jobId!];
    const years = serviceYears(me);
    return (
      <p className="hint">
        🎖️ {titleOf(job, me.jobLevel)} · {years} year{years === 1 ? '' : 's'} of service · tour ends {me.flags.tour_end}
        {me.flags.deployed_year === g.year - 1 ? ' · just back from deployment' : ''}
        {years < PENSION_YEARS ? ` · pension at ${PENSION_YEARS} years` : ' · eligible for a military pension'} · health care covered
      </p>
    );
  }

  const notes: string[] = [];
  if (inReserve(me)) notes.push('🪖 In the reserve (a weekend a month; could be called up)');
  if (me.flags.veteran) notes.push('🇺🇸 Veteran: the GI Bill pays college and night-school tuition');
  if (me.flags.disability) notes.push('Disability pay for a service injury');
  if (me.flags.mil_pension) notes.push(`Military pension ${money(me.flags.mil_pension)}/yr`);
  const canVisit = age >= ENLIST_AGE[0] && age <= ENLIST_AGE[1] && !me.flags.disability;

  return (
    <>
      {notes.map((n) => <p key={n} className="hint">{n}</p>)}
      {canVisit && (
        <details className="jobs">
          <summary>🎖️ Visit a military recruiter</summary>
          <div className="job-list">
            {(['enlisted', 'officer'] as const).map((kind) => {
              const blocker = enlistBlocker(g, kind === 'officer');
              const c = CAREER_BY_ID[kind];
              return (
                <button key={kind} className={armed === kind ? 'job on' : 'job'} disabled={!!blocker}
                  onClick={() => (armed === kind ? (setArmed(null), enlist(kind === 'officer')) : setArmed(kind))}>
                  <span>{armed === kind ? `✔ Confirm: ${TOUR_YEARS}-year tour` : `${c.icon} ${kind === 'officer' ? 'Join as an officer' : 'Enlist'}`}</span>
                  <span className="hint">{blocker ?? `${titleOf(c, 1)} · ${money(c.levelPay![0])}/yr · replaces your full-time job`}</span>
                </button>
              );
            })}
          </div>
          <p className="hint">
            {TOUR_YEARS}-year tours with steady pay, health care, and the GI Bill afterward. Deployments mean time away from family and some
            risk of injury. At each tour's end you can re-enlist, go to officer school, join the reserve, or come home.
          </p>
        </details>
      )}
    </>
  );
}
