import type { GameState } from '../../engine/types';
import { active, ageOf, getBond, membersOf, money, partnerOf } from '../../engine/util';
import { jobTitle, CAREER_BY_ID } from '../../content/careers';
import { Avatar } from '../Avatar';
import { Section, StatBar } from '../components';
import { useGame } from '../../store/gameStore';

export function HomeTab({ g }: { g: GameState }) {
  const me = active(g);
  const hh = g.households[me.householdId];
  const members = membersOf(g, me.householdId).filter((p) => p.id !== me.id);
  const partner = partnerOf(g, me.id);
  const setTab = useGame((s) => s.setTab);
  const job = me.jobId ? CAREER_BY_ID[me.jobId] : undefined;
  const lastYear = g.journal.filter((j) => j.year === g.year - 1 && j.kind !== 'info').slice(-3);

  return (
    <div className="stack two-col">
      <section className="card hero">
        <Avatar person={me} year={g.year} size={96} />
        <div>
          <h2>{me.firstName} {me.lastName}</h2>
          <div className="muted">Age {ageOf(me, g.year)} · {ageOf(me, g.year) < 18 && !me.partJobId ? '🎒 In school' : `${job?.icon ?? '🧭'} ${jobTitle(me)}`}</div>
          <div className="traits">{me.traits.map((t) => <span key={t} className="chip">{t}</span>)}</div>
        </div>
      </section>

      <Section title="You">
        <StatBar label="Health" value={me.stats.health} />
        <StatBar label="Happiness" value={me.stats.happiness} />
        <StatBar label="Smarts" value={me.stats.smarts} />
        <StatBar label="Fitness" value={me.stats.fitness} />
        <StatBar label="Stress" value={me.stats.stress} invert />
        {job && <StatBar label="Career" value={me.workPerf} />}
        {me.partJobId && <StatBar label="Part-time career" value={me.partPerf} />}
      </Section>

      <Section title="Household" aside={<span className={hh.wallet < 0 ? 'neg' : ''}>{money(hh.wallet)}</span>}>
        <div className="portrait-strip">
          {members.map((p) => {
            const b = getBond(g, me.id, p.id);
            return (
              <button key={p.id} className="portrait" onClick={() => setTab('family')} aria-label={`${p.firstName}, open family`}>
                <Avatar person={p} year={g.year} size={56} />
                <span>{p.firstName}</span>
                <span className="hint">{p.id === partner?.id ? 'Partner' : `Age ${ageOf(p, g.year)}`} · {b.affinity >= 40 ? '❤️' : b.affinity >= 0 ? '🙂' : '😠'}</span>
              </button>
            );
          })}
          {!members.length && <p className="muted">You live alone.</p>}
        </div>
        {hh.assets.map((a) => (
          <div key={a.id} className="row">
            <span>🏠 {a.name}</span>
            <span className="muted">worth {money(a.value)}{a.mortgage ? ` · owe ${money(a.mortgage)}` : ''}</span>
          </div>
        ))}
        {!hh.assets.some((a) => a.kind === 'house') && <div className="row muted"><span>🏢 Renting</span></div>}
      </Section>

      {lastYear.length > 0 && (
        <Section title={`Last year (${g.year - 1})`}>
          <ul className="journal-list">{lastYear.map((j, i) => <li key={i} className={j.kind}>{j.text}</li>)}</ul>
        </Section>
      )}

      {g.phase === 'PLANNING' && (
        <button className="primary big" onClick={() => setTab('plan')}>🗓️ Plan {g.year}</button>
      )}
    </div>
  );
}
