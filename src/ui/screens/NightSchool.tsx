import { PROGRAMS } from '../../content/careers';
import { TIME_BUDGET } from '../../content/actions';
import type { GameState, Plan, Program } from '../../engine/types';
import { active, money } from '../../engine/util';
import { useGame } from '../../store/gameStore';
import { Stepper } from '../components';

/** Night school: enroll, study blocks with progress, or drop out. */
export function NightSchool({ g, left }: { g: GameState; left: number }) {
  const setPlan = useGame((s) => s.setPlan);
  const me = active(g);
  const plan = g.plan;
  const edu = me.education;
  const intent = plan.eduIntent;
  const set = (fn: (p: Plan) => void) => {
    const next: Plan = structuredClone(plan);
    fn(next);
    setPlan(next);
  };
  const study = plan.alloc.study ?? 0;
  const setStudy = (n: number) => set((p) => { if (n > 0) p.alloc.study = n; else delete p.alloc.study; });

  if (me.studyingUntil) return null;

  if (edu) {
    const prog = PROGRAMS[edu.program];
    const dropping = intent?.kind === 'drop';
    const remaining = Math.max(0, edu.required - edu.progress);
    return (
      <div className="sub-group">
        <div className="sub-head">{prog.icon} {prog.short}: {edu.progress}/{edu.required}</div>
        <div className="bar" role="meter" aria-label={`${prog.short} progress`} aria-valuemin={0} aria-valuemax={edu.required} aria-valuenow={edu.progress}>
          <div className="fill good" style={{ width: `${(edu.progress / edu.required) * 100}%` }} />
        </div>
        {!dropping && (
          <Stepper label="Night school" icon="🎓" value={study} max={TIME_BUDGET} disabledPlus={left <= 0} onChange={setStudy}
            hint={study >= remaining ? 'You will graduate this year!' : `${remaining} blocks to go · ${money(prog.tuition)}/yr tuition`} />
        )}
        <div className="row">
          <span className="hint">{dropping ? 'Dropping out this year' : 'Each block adds 2 stress'}</span>
          <button className={dropping ? 'small danger on' : 'small'} aria-pressed={dropping}
            onClick={() => set((p) => { p.eduIntent = dropping ? undefined : { kind: 'drop' }; })}>
            {dropping ? 'Dropping out ✓' : 'Drop out'}
          </button>
        </div>
      </div>
    );
  }

  const enrolling = intent?.kind === 'enroll' ? intent.program : undefined;
  const options = (Object.values(PROGRAMS)).filter((p) => !me.flags[p.id]);
  if (!options.length) return null;
  return (
    <details className="jobs" open={!!enrolling}>
      <summary>{enrolling ? `Enrolling: ${PROGRAMS[enrolling].short}` : '🎓 Night school'}</summary>
      <div className="job-list">
        {options.map((p) => {
          const ok = me.stats.smarts >= p.minSmarts;
          const on = enrolling === p.id;
          return (
            <button key={p.id} className={on ? 'job on' : 'job'} disabled={!ok} aria-pressed={on}
              onClick={() => set((pl) => { pl.eduIntent = on ? undefined : { kind: 'enroll', program: p.id as Program }; })}>
              <span>{p.icon} {p.short}</span>
              <span className="hint">{ok ? `${p.required} blocks total · ${money(p.tuition)}/yr` : `needs smarts ${p.minSmarts}+`}</span>
            </button>
          );
        })}
      </div>
      {enrolling && (
        <Stepper label="Night school" icon="🎓" value={study} max={TIME_BUDGET} disabledPlus={left <= 0} onChange={setStudy}
          hint={`Blocks this year toward ${PROGRAMS[enrolling].required}`} />
      )}
      <p className="hint">Study while you work. Unlocks careers that need a degree or trade certificate.</p>
    </details>
  );
}
