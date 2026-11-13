import { useState } from 'react';
import type { ArchivedFamily, ArchivedMember } from '../../profile/types';
import { EPITAPH_MAX } from '../../profile/types';
import { AvatarFace, type AvatarSpec } from '../Avatar';

const money = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');

export function memberSpec(m: ArchivedMember, endYear: number): AvatarSpec {
  const until = m.deathYear ?? endYear;
  return { id: m.id, name: m.name, sex: m.sex, looks: m.looks, age: until - m.birthYear, happiness: 65, stress: 20, dead: m.deathYear !== undefined };
}

function Epitaph({ m, onSave }: { m: ArchivedMember; onSave?: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.epitaph);
  if (!onSave || !editing) {
    return (
      <div className="epitaph-row">
        <p className="epitaph">“{m.epitaph}”</p>
        {onSave && (
          <button className="small" onClick={() => { setDraft(m.epitaph); setEditing(true); }} aria-label={`Edit epitaph for ${m.name}`}>
            ✏️ Edit
          </button>
        )}
      </div>
    );
  }
  return (
    <form
      className="epitaph-edit"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
        setEditing(false);
      }}
    >
      <label className="hint" htmlFor={`ep-${m.id}`}>Epitaph for {m.name} ({draft.length}/{EPITAPH_MAX})</label>
      <textarea id={`ep-${m.id}`} value={draft} maxLength={EPITAPH_MAX} rows={2} autoFocus onChange={(e) => setDraft(e.target.value)} />
      <div className="row">
        <button type="submit" className="small primary" disabled={!draft.trim()}>Save</button>
        <button type="button" className="small" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </form>
  );
}

/** The memorial for a finished family. Pure props, so it also renders into the exported HTML. */
export function MemorialView({ family, onEpitaph }: { family: ArchivedFamily; onEpitaph?: (memberId: string, text: string) => void }) {
  const b = family.breakdown;
  return (
    <div className="memorial-view">
      <header className="center memorial-head">
        <div className="logo" aria-hidden>🌳</div>
        <h1>The {family.familyName} Family</h1>
        <p className="muted">
          {family.generations} generation{family.generations === 1 ? '' : 's'} · {family.startYear}–{family.endYear}
        </p>
      </header>
      <section className="card legacy">
        <div><span className="hint">Legacy</span><strong>{family.legacy}</strong></div>
        <div><span className="hint">Family wealth</span><strong>{money(b.wealth)}</strong></div>
        <div><span className="hint">Parent bonds</span><strong>{b.bonds}</strong></div>
        <div><span className="hint">Wellbeing</span><strong>{b.wellbeing}</strong></div>
      </section>
      <ol className="memorial-line">
        {family.members.map((m, i) => (
          <li key={m.id} className="card memorial-member">
            <div className="person">
              <AvatarFace spec={memberSpec(m, family.endYear)} size={72} />
              <div className="person-body">
                <div className="hint">Generation {i + 1}</div>
                <strong>{m.name}</strong>
                <div className="hint">
                  {m.birthYear}–{m.deathYear ?? 'present'}
                  {m.title ? ` · ${m.title}` : ''} · {m.children} child{m.children === 1 ? '' : 'ren'}
                </div>
                {m.aim && <div className="hint">{m.aim}</div>}
                <Epitaph m={m} onSave={onEpitaph ? (t) => onEpitaph(m.id, t) : undefined} />
                {m.highlights.length > 0 && (
                  <ul className="journal-list memorial-highlights">
                    {m.highlights.map((h, j) => <li key={j}>{h}</li>)}
                  </ul>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
