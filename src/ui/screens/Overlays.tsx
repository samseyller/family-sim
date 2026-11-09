import type { GameState, StatKey } from '../../engine/types';
import { active, ageOf, fullName, money } from '../../engine/util';
import { eligibleHeirs } from '../../engine/phases';
import { buildMemorial } from '../../engine/memorial';
import { jobTitle } from '../../content/careers';
import { useGame } from '../../store/gameStore';
import { Avatar } from '../Avatar';
import { Delta, Modal } from '../components';
import { BackupReminder } from './SavesPanel';

export function EventModal({ g }: { g: GameState }) {
  const choose = useGame((s) => s.choose);
  const dismiss = useGame((s) => s.dismissOutcome);
  if (g.lastOutcome) {
    return (
      <Modal label={g.lastOutcome.title} key={`o-${g.lastOutcome.title}`}>
        <div className="eyebrow">Outcome</div>
        <h2>{g.lastOutcome.title}</h2>
        <p>{g.lastOutcome.text}</p>
        <button className="primary big" onClick={dismiss}>Continue</button>
      </Modal>
    );
  }
  const pe = g.pending[0];
  if (!pe) return null;
  const subject = pe.subjectId ? g.people[pe.subjectId] : undefined;
  return (
    <Modal label={pe.title} key={pe.uid}>
      <div className={`eyebrow ${pe.major ? 'major' : ''}`}>{pe.major ? '⭐ Life event' : 'Moment'} · {g.year}</div>
      <div className="event-head">
        {subject && <Avatar person={subject} year={g.year} size={56} />}
        <h2>{pe.title}</h2>
      </div>
      <p>{pe.text}</p>
      <div className="choices">
        {pe.choices.map((c) => (
          <button key={c.id} className="choice" disabled={c.disabled} onClick={() => choose(pe.uid, c.id)}>
            <span>{c.label}</span>
            {c.hint && <span className="hint">{c.hint}</span>}
          </button>
        ))}
      </div>
      {g.pending.length > 1 && <div className="hint center">{g.pending.length - 1} more this year</div>}
    </Modal>
  );
}

const STAT_LABEL: Record<StatKey, string> = { health: 'Health', happiness: 'Happiness', smarts: 'Smarts', fitness: 'Fitness', stress: 'Stress' };

export function RecapModal({ g }: { g: GameState }) {
  const nextYear = useGame((s) => s.nextYear);
  const r = g.recap!;
  const me = active(g);
  return (
    <Modal label={`${r.year} in review`}>
      <div className="eyebrow">Year in review</div>
      <h2>{r.year}</h2>
      <div className="recap-stats">
        {(Object.keys(STAT_LABEL) as StatKey[]).map((k) => (
          <div key={k} className="recap-stat">
            <span className="hint">{STAT_LABEL[k]}</span>
            <strong>{me.stats[k]}</strong>
            <Delta n={r.statDeltas[k] ?? 0} invert={k === 'stress'} />
          </div>
        ))}
        <div className="recap-stat">
          <span className="hint">Household</span>
          <strong>{money(g.households[g.snapshot?.householdId ?? me.householdId].wallet)}</strong>
          <Delta n={r.walletDelta} money />
        </div>
      </div>
      <ul className="journal-list recap-list">
        {r.entries.map((j, i) => <li key={i} className={j.kind}>{j.text}</li>)}
        {!r.entries.length && <li className="muted">A quiet year.</li>}
      </ul>
      <button className="primary big" onClick={nextYear}>
        {r.activeDied ? 'Continue…' : `On to ${r.year + 1}`}
      </button>
      <BackupReminder g={g} />
    </Modal>
  );
}

export function SuccessionScreen({ g }: { g: GameState }) {
  const chooseHeir = useGame((s) => s.chooseHeir);
  const me = active(g);
  const heirs = eligibleHeirs(g);
  return (
    <Modal label="Succession">
      <div className="center">
        <Avatar person={me} year={g.year} size={88} />
        <h2>{fullName(me)}</h2>
        <p className="muted">{me.birthYear}–{me.deathYear} · {me.deathCause}</p>
      </div>
      <p>{heirs.length ? 'Whose story continues?' : 'No one is able to carry the story forward.'}</p>
      <div className="choices">
        {heirs.map((h) => (
          <button key={h.id} className="choice heir" onClick={() => chooseHeir(h.id)}>
            <Avatar person={h} year={g.year + 1} size={48} />
            <span>
              {fullName(h)}
              <span className="hint">
                {h.relation === 'spouse' ? 'Spouse' : h.relation === 'child' ? (h.sex === 'F' ? 'Daughter' : 'Son') : (h.sex === 'F' ? 'Granddaughter' : 'Grandson')} · age {ageOf(h, g.year + 1)} · {jobTitle(h)}
                {h.householdId === me.householdId ? ' · keeps the family home' : ' · own household'}
              </span>
            </span>
          </button>
        ))}
        <button className="choice" onClick={() => chooseHeir(null)}>
          <span>🕊️ End the family's story</span>
          <span className="hint">See the family memorial</span>
        </button>
      </div>
    </Modal>
  );
}

export function MemorialScreen({ g }: { g: GameState }) {
  const toTitle = useGame((s) => s.toTitle);
  const startNew = useGame((s) => s.startNew);
  const m = buildMemorial(g);
  return (
    <main className="memorial stack">
      <div className="center">
        <div className="logo" aria-hidden>🌳</div>
        <h1>The {m.familyName} Family</h1>
        <p className="muted">{m.generations} generation{m.generations > 1 ? 's' : ''} · {m.years}</p>
      </div>
      <section className="card legacy">
        <div><span className="hint">Legacy</span><strong>{m.legacy.total}</strong></div>
        <div><span className="hint">Family wealth</span><strong>{money(m.legacy.wealth)}</strong></div>
        <div><span className="hint">Parent bonds</span><strong>{m.legacy.bonds}</strong></div>
        <div><span className="hint">Wellbeing</span><strong>{m.legacy.wellbeing}</strong></div>
      </section>
      {m.entries.map((e) => (
        <section key={e.person.id} className="card">
          <div className="person">
            <Avatar person={e.person} year={g.year} size={64} />
            <div className="person-body">
              <strong>{fullName(e.person)}</strong>
              <div className="hint">{e.lifespan} · {e.title} · {e.children} child{e.children === 1 ? '' : 'ren'}</div>
              <div className="epitaph">Remembered for {e.knownFor}.</div>
              <ul className="journal-list">{e.highlights.map((h, i) => <li key={i}>{h.year}: {h.text}</li>)}</ul>
            </div>
          </div>
        </section>
      ))}
      <div className="title-actions">
        <button className="primary big" onClick={startNew}>🎲 Start a new family</button>
        <button className="big" onClick={toTitle}>Title screen</button>
      </div>
    </main>
  );
}

export { EndYearDialog as ConfirmEndYear } from './EndYearDialog';

export function DevPanel() {
  const dev = useGame((s) => s.dev);
  const toggle = useGame((s) => s.toggleDev);
  return (
    <Modal label="Developer tools" onClose={toggle}>
      <h2>🛠️ Dev tools</h2>
      <div className="choices">
        <button className="choice" onClick={() => { dev('skip10'); toggle(); }}>Skip 10 years (auto-play)</button>
        <button className="choice" onClick={() => { dev('kill'); toggle(); }}>Kill main character</button>
        <button className="choice" onClick={toggle}>Close</button>
      </div>
    </Modal>
  );
}
