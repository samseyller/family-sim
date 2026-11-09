import type { ChildFocus, GameState, Hobby, JobIntent, Plan } from '../../engine/types';
import { canWorkFullTime, homeParents } from '../../engine/generate';
import { NightSchool } from './NightSchool';
import { active, activePartnership, ageOf, kidsAtHome, membersOf, money, partnerOf } from '../../engine/util';
import { ACTION_BY_ID, COSTS, FUND_OPTIONS, HOBBIES, HOBBY_BY_ID, TIME_BUDGET, defaultChildPlan } from '../../content/actions';
import { CAREERS, CAREER_BY_ID, PART_TIME_MAX, qualifies, requiredBlocks, salaryOf, type JobSlot } from '../../content/careers';
import { receptiveness, receptivenessLabel } from '../../engine/family';
import { useGame } from '../../store/gameStore';
import { Avatar } from '../Avatar';
import { Section, Segmented, Stepper } from '../components';

export function PlanTab({ g }: { g: GameState }) {
  const setPlan = useGame((s) => s.setPlan);
  const askEndYear = useGame((s) => s.askEndYear);
  const me = active(g);
  const myAge = ageOf(me, g.year);
  const isMinor = myAge < 18;
  const workAge = myAge >= 16; // part-time from 16, full-time from 18
  const parentsHere = homeParents(g, me);
  const plan = g.plan;
  const used = Object.values(plan.alloc).reduce((a, b) => a + b, 0);
  const left = TIME_BUDGET - used;
  const partner = partnerOf(g, me.id);
  const kids = kidsAtHome(g, me);
  const job = me.jobId ? CAREER_BY_ID[me.jobId] : undefined;
  const partJob = me.partJobId ? CAREER_BY_ID[me.partJobId] : undefined;
  const canWork = canWorkFullTime(me);
  const intentFor = (slot: JobSlot) => plan.jobIntents.find((i) => (i.kind === 'quit' ? i.slot : CAREER_BY_ID[i.careerId].hours) === slot);
  const quitting = (slot: JobSlot) => intentFor(slot)?.kind === 'quit';
  const applyingTo = (slot: JobSlot) => {
    const i = intentFor(slot);
    return i?.kind === 'apply' ? CAREER_BY_ID[i.careerId] : undefined;
  };
  /** Set (or clear, with null) the single intent for a job slot. */
  const setIntent = (slot: JobSlot, intent: JobIntent | null) => update((p) => {
    p.jobIntents = p.jobIntents.filter((i) => (i.kind === 'quit' ? i.slot : CAREER_BY_ID[i.careerId].hours) !== slot);
    if (intent) p.jobIntents.push(intent);
  });

  const update = (fn: (p: Plan) => void) => {
    const next: Plan = structuredClone(plan);
    fn(next);
    setPlan(next);
  };
  const setAlloc = (k: string, n: number) => update((p) => {
    if (n <= 0) delete p.alloc[k];
    else p.alloc[k] = n;
  });
  const step = (key: string, label: string, icon: string, hint?: string) => (
    <Stepper key={key} label={label} icon={icon} hint={hint} value={plan.alloc[key] ?? 0} max={TIME_BUDGET} disabledPlus={left <= 0} onChange={(n) => setAlloc(key, n)} />
  );

  const req = job ? requiredBlocks(job, me.jobLevel) : 0;
  const work = plan.alloc.work ?? 0;
  const workHint = !job ? '' : work < req ? `Below the ${req} expected: less pay, standing drops`
    : work > req ? `${work - req} overtime: more pay and stress` : `Meets the ${req} expected`;
  const part = plan.alloc.parttime ?? 0;
  const partHint = part === 0 ? 'Skipping all shifts loses the job' : part < 2 ? 'Below 2: standing drops'
    : part > 2 ? 'Extra shifts: more pay' : '2 blocks: good standing';
  const twoJobs = (canWork && !quitting('full')) || applyingTo('full');
  const partActive = (partJob && !quitting('part')) || applyingTo('part');

  const spend = (plan.alloc.family_outing ?? 0) * 1500 + kids.reduce((sum, k) => {
    const cp = plan.children[k.id] ?? defaultChildPlan();
    return sum + (cp.tutoring ? COSTS.tutoring : 0) + (cp.lessons && k.hobby ? COSTS.lessons : 0) + (k.flags.advanced ? COSTS.advancedLessons : 0) + cp.fundContribution;
  }, 0);

  return (
    <div className="stack two-col">
      <div className="budget card" aria-live="polite">
        <div className="row">
          <strong>Time this year</strong>
          <span>{left} of {TIME_BUDGET} blocks left</span>
        </div>
        <div className="blocks" aria-hidden>
          {Array.from({ length: TIME_BUDGET }, (_, i) => <span key={i} className={i < used ? 'used' : ''} />)}
        </div>
        {spend > 0 && <div className="hint">Planned extra spending: {money(spend)}</div>}
      </div>

      {workAge && (
      <Section title="💼 Work">
        <div className="label">Full-time</div>
        {canWork ? (
          <>
            <Stepper label={`${job!.name} · ${money(salaryOf(job!, me.jobLevel))}/yr`} icon={job!.icon} hint={workHint} value={work} max={TIME_BUDGET} disabledPlus={left <= 0} onChange={(n) => setAlloc('work', n)} />
            <div className="row">
              <span className="muted">Career: {me.workPerf}/100</span>
              <button className={quitting('full') ? 'small danger on' : 'small'} aria-pressed={quitting('full')}
                onClick={() => setIntent('full', quitting('full') ? null : { kind: 'quit', slot: 'full' })}>
                {quitting('full') ? 'Quitting this year ✓' : 'Quit'}
              </button>
            </div>
          </>
        ) : (
          <p className="muted">{me.retired ? 'You are retired.' : me.studyingUntil ? `Studying until ${me.studyingUntil}; part-time work only.` : 'No full-time job.'}</p>
        )}
        {applyingTo('full') && !canWork && step('work', `Planned hours at ${applyingTo('full')!.name}`, '💼', `Used only if you're hired (expects ${applyingTo('full')!.blocks})`)}

        <div className="label">Part-time</div>
        {partJob ? (
          <>
            <Stepper label={`${partJob.name} · ${money(partJob.salary)}/yr at 2 blocks`} icon={partJob.icon} hint={partHint} value={part}
              max={PART_TIME_MAX} disabledPlus={left <= 0} onChange={(n) => setAlloc('parttime', n)} />
            <div className="row">
              <span className="muted">Career: {me.partPerf}/100</span>
              <button className={quitting('part') ? 'small danger on' : 'small'} aria-pressed={quitting('part')}
                onClick={() => setIntent('part', quitting('part') ? null : { kind: 'quit', slot: 'part' })}>
                {quitting('part') ? 'Quitting this year ✓' : 'Quit'}
              </button>
            </div>
          </>
        ) : (
          <p className="muted">No part-time job.</p>
        )}
        {applyingTo('part') && !partJob && (
          <Stepper label={`Planned shifts at ${applyingTo('part')!.name}`} icon="⏱️" hint="Used only if you're hired (1–4; 2 is good standing)"
            value={part} max={PART_TIME_MAX} disabledPlus={left <= 0} onChange={(n) => setAlloc('parttime', n)} />
        )}
        {twoJobs && partActive && <p className="hint">⚠️ Working two jobs adds stress every year.</p>}

        {(['full', 'part'] as const).map((slot) => {
          if (slot === 'full' && (me.studyingUntil || isMinor)) return null;
          const target = applyingTo(slot);
          const current = slot === 'full' ? me.jobId : me.partJobId;
          return (
            <details key={slot} className="jobs">
              <summary>{target ? `Applying (${slot === 'full' ? 'full-time' : 'part-time'}): ${target.name}` : `Look for a ${slot === 'full' ? 'full-time' : 'part-time'} job`}</summary>
              <div className="job-list">
                {CAREERS.filter((c) => c.hours === slot && c.id !== current).map((c) => {
                  const ok = qualifies(me, c);
                  const on = target?.id === c.id;
                  return (
                    <button key={c.id} className={on ? 'job on' : 'job'} disabled={!ok} aria-pressed={on}
                      onClick={() => setIntent(slot, on ? null : { kind: 'apply', careerId: c.id })}>
                      <span>{c.icon} {c.name}</span>
                      <span className="hint">{ok ? `${money(c.salary)} · ${c.blocks} blocks` : requirement(c)}</span>
                    </button>
                  );
                })}
              </div>
              <p className="hint">
                {current ? 'If hired, this replaces your current ' + (slot === 'full' ? 'full-time' : 'part-time') + ' job. ' : ''}
                Decided when the year ends; a new job pays this year.
              </p>
            </details>
          );
        })}
      </Section>
      )}


      <Section title="🧘 Yourself">
        {step('exercise', ACTION_BY_ID.exercise.label, ACTION_BY_ID.exercise.icon, me.flags.health_vow ? 'Extra effective since your health scare' : 'Fitness, health; less stress')}
        {step('relax', ACTION_BY_ID.relax.label, ACTION_BY_ID.relax.icon, 'Less stress, more happiness')}
        {step('learn', isMinor ? 'Study' : ACTION_BY_ID.learn.label, isMinor ? '🎒' : ACTION_BY_ID.learn.icon, isMinor ? 'Better grades; smarts up' : 'Smarts: opens better careers')}
        {me.hobby && step('practice', `Practice ${HOBBY_BY_ID[me.hobby].label.toLowerCase()}`, HOBBY_BY_ID[me.hobby].icon, 'Skill up; it can become a career')}
        {step('socialize', isMinor ? 'Friends' : ACTION_BY_ID.socialize.label, isMinor ? '🛝' : ACTION_BY_ID.socialize.icon, isMinor ? 'Make friends; happiness up' : partner ? 'Happiness up, less stress' : 'Happiness up; more likely to meet someone')}
        <p className="hint">Each extra block on the same thing is worth a bit less.</p>
        <NightSchool g={g} left={left} />
      </Section>

      <Section title="🏡 Family">
        {parentsHere.map((p) => (
          <div key={p.id} className="sub-group">
            <div className="sub-head">{p.sex === 'F' ? 'Mom' : 'Dad'}: {p.firstName}</div>
            {step(`parent_time:${p.id}`, 'Time together', isMinor ? '🧸' : '☕', 'Closer bonds; they will look out for you')}
          </div>
        ))}
        {partner && (
          <div className="sub-group">
            <div className="sub-head">{activePartnership(g, me.id)?.status === 'married' ? 'Spouse' : 'Dating'}: {partner.firstName}</div>
            {step('partner_time', 'Time together', '💞', partner.householdId === me.householdId ? 'None at all and they will feel neglected' : 'Dates build the relationship; none and it fades')}
          </div>
        )}
        {kids.map((k) => (
          <div key={k.id} className="sub-group">
            <div className="sub-head">Child: {k.firstName} ({ageOf(k, g.year)})</div>
            {step(`child_time:${k.id}`, 'Time together', '🧸', 'Builds trust: they listen to you more')}
            {ageOf(k, g.year) >= 5 && step(`homework:${k.id}`, 'Homework help', '✏️', 'Their smarts up')}
          </div>
        ))}
        {!isMinor && membersOf(g, me.householdId).length > 1 && (
          <div className="sub-group">
            <div className="sub-head">Whole family</div>
            {step('family_outing', 'Family outing', '🎡', '$1,500 per block; everyone bonds')}
          </div>
        )}
        {!partner && membersOf(g, me.householdId).length <= 1 && <p className="muted">No one at home right now.</p>}
      </Section>

      {kids.map((k) => {
        const cp = plan.children[k.id] ?? defaultChildPlan();
        const r = receptiveness(g, me, k);
        const a = ageOf(k, g.year);
        const setCp = (fn: (c: typeof cp) => void) => update((p) => {
          const c = { ...defaultChildPlan(), ...p.children[k.id] };
          fn(c);
          p.children[k.id] = c;
        });
        return (
          <Section key={k.id} title={`Child: ${k.firstName} (${a})`} aside={<span className={`chip ${r >= 0.65 ? 'good' : r >= 0.4 ? '' : 'bad'}`}>{receptivenessLabel(r)}</span>}>
            <div className="kid-head">
              <Avatar person={k} year={g.year} size={48} />
              <div className="hint">
                Smarts {k.stats.smarts}
                {k.hobby ? ` · ${HOBBY_BY_ID[k.hobby].icon} ${HOBBY_BY_ID[k.hobby].label} ${k.skills[k.hobby] ?? 0}` : ' · no hobby yet'}
                {k.fund > 0 && ` · fund ${money(k.fund)}`}
              </div>
            </div>
            {a >= 5 && (
              <>
                <div className="label">Encourage them to focus on</div>
                <Segmented<ChildFocus>
                  label={`${k.firstName}'s focus`}
                  value={cp.focus}
                  onChange={(v) => setCp((c) => { c.focus = v; })}
                  options={[{ value: 'free', label: 'Their choice' }, { value: 'studies', label: 'Studies' }, { value: 'hobby', label: 'Hobby' }]}
                />
                <p className="hint">Pushing works if they listen. If not, they resent it.</p>
              </>
            )}
            {a >= 5 && !k.hobby && (
              <>
                <div className="label">Suggest a hobby</div>
                <Segmented<Hobby | 'none'>
                  label={`Suggest a hobby to ${k.firstName}`}
                  value={cp.suggestHobby ?? 'none'}
                  onChange={(v) => setCp((c) => { c.suggestHobby = v === 'none' ? undefined : v; })}
                  options={[{ value: 'none', label: 'None' }, ...HOBBIES.map((h) => ({ value: h.id, label: `${h.icon} ${h.label}` }))]}
                />
              </>
            )}
            {a >= 5 && (
              <div className="toggles">
                <label className="toggle">
                  <input type="checkbox" checked={cp.tutoring} onChange={(e) => setCp((c) => { c.tutoring = e.target.checked; })} />
                  Tutoring ({money(COSTS.tutoring)}/yr)
                </label>
                {k.hobby && (
                  <label className="toggle">
                    <input type="checkbox" checked={cp.lessons} onChange={(e) => setCp((c) => { c.lessons = e.target.checked; })} />
                    {HOBBY_BY_ID[k.hobby].label} lessons ({money(COSTS.lessons)}/yr)
                  </label>
                )}
                {k.flags.advanced ? <div className="hint">Advanced training: {money(COSTS.advancedLessons)}/yr</div> : null}
              </div>
            )}
            <div className="label">College fund contribution</div>
            <Segmented<number>
              label={`College fund for ${k.firstName}`}
              value={cp.fundContribution}
              onChange={(v) => setCp((c) => { c.fundContribution = v; })}
              options={FUND_OPTIONS.map((v) => ({ value: v, label: v ? money(v) : 'None' }))}
            />
          </Section>
        );
      })}

      <button className="primary big end-year" onClick={() => askEndYear(true)}>
        ⏭️ End {g.year} <kbd>E</kbd>
      </button>
      {left > 0 && <p className="hint center span-all">You have {left} unused block{left > 1 ? 's' : ''}.</p>}
    </div>
  );
}

function requirement(c: (typeof CAREERS)[number]) {
  const parts: string[] = [];
  if (c.requires) parts.push(c.requires === 'degree' ? 'needs a degree' : 'needs a trade cert');
  if (c.minSmarts) parts.push(`smarts ${c.minSmarts}+`);
  if (c.skill) parts.push(`${c.skill} skill ${c.minSkill}+`);
  return parts.join(', ');
}
