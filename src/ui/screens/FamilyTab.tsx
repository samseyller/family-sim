import { SPORTS } from '../../content/sports';
import { useState } from 'react';
import type { GameState, Person } from '../../engine/types';
import { active, ageOf, alive, childrenOf, getBond, parentsOf, partnerOf } from '../../engine/util';
import { jobTitle } from '../../content/careers';
import { HOBBY_BY_ID } from '../../content/actions';
import { receptiveness, receptivenessLabel } from '../../engine/family';
import { Avatar } from '../Avatar';
import { Section, Segmented } from '../components';
import { FamilyTree } from '../tree/FamilyTree';
import { DogsCard } from './DogsCard';
import { FriendsCard } from './FriendsCard';
import { cityName, cityOf } from '../../engine/location';
import { gpaOf } from '../../engine/school';

function role(g: GameState, me: Person, p: Person): string {
  const ps = [...g.partnerships].reverse().find((x) => (x.a === me.id && x.b === p.id) || (x.b === me.id && x.a === p.id));
  if (ps?.status === 'married') return 'Spouse';
  if (ps?.status === 'dating') return 'Dating';
  if (ps?.status === 'separated') return 'Separated';
  const parents = (x: Person) => [...x.biologicalParents, ...x.adoptiveParents];
  if (parents(p).includes(me.id)) return (p.sex === 'F' ? 'Daughter' : 'Son') + (p.adoptiveParents.includes(me.id) ? ' (adopted)' : '');
  if (parents(me).includes(p.id)) return p.sex === 'F' ? 'Mother' : 'Father';
  if (parents(p).some((id) => parents(me).includes(id))) return p.sex === 'F' ? 'Sister' : 'Brother';
  if (parents(p).some((id) => g.people[id] && parents(g.people[id]).includes(me.id))) return p.sex === 'F' ? 'Granddaughter' : 'Grandson';
  if (ps) return ps.status === 'widowed' ? 'Late spouse' : 'Ex-partner';
  return 'Relative';
}

function BondMeter({ label, v }: { label: string; v: number }) {
  const pct = (v + 100) / 2;
  return (
    <div className="bond">
      <span className="hint">{label}</span>
      <div className="bar center-bar" role="meter" aria-label={label} aria-valuemin={-100} aria-valuemax={100} aria-valuenow={v}>
        <div className={`fill ${v >= 0 ? 'good' : 'bad'}`} style={{ left: v >= 0 ? '50%' : `${pct}%`, width: `${Math.abs(v) / 2}%` }} />
      </div>
      <span className="hint">{v}</span>
    </div>
  );
}

function FamilyList({ g }: { g: GameState }) {
  const me = active(g);
  const seen = new Set<string>([me.id]);
  const list: Person[] = [];
  const add = (p?: Person) => {
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      list.push(p);
    }
  };
  add(partnerOf(g, me.id));
  for (const c of childrenOf(g, me.id)) add(c);
  for (const c of childrenOf(g, me.id)) for (const gc of childrenOf(g, c.id)) add(gc);
  for (const p of parentsOf(g, me)) add(p);
  // Brothers and sisters (anyone sharing a parent), then the ex-partners below.
  for (const par of parentsOf(g, me)) for (const sib of childrenOf(g, par.id)) add(sib);
  for (const p of g.partnerships) if (p.a === me.id || p.b === me.id) add(g.people[p.a === me.id ? p.b : p.a]);
  const living = list.filter(alive);
  const dead = list.filter((p) => !alive(p));

  const card = (p: Person) => {
    const b = getBond(g, me.id, p.id);
    const isMinorChild = p.biologicalParents.includes(me.id) && ageOf(p, g.year) < 18;
    return (
      <article key={p.id} className="person">
        <Avatar person={p} year={g.year} size={64} />
        <div className="person-body">
          <div className="row">
            <strong>{p.firstName} {p.lastName}</strong>
            <span className="chip">{role(g, me, p)}</span>
          </div>
          <div className="hint">
            {alive(p) ? `Age ${ageOf(p, g.year)}` : `${p.birthYear}–${p.deathYear}`}
            {ageOf(p, g.year) >= 18 ? ` · ${jobTitle(p)}` : p.hobby === 'sports' && p.sport ? ` · ${SPORTS[p.sport].icon} ${SPORTS[p.sport].label} (skill ${p.skills.sports ?? 0})${p.flags.varsity ? ', varsity' : p.flags.travel_team ? ', travel team' : ''}` : p.hobby ? ` · ${HOBBY_BY_ID[p.hobby].icon} ${HOBBY_BY_ID[p.hobby].label}` : ''}
            {p.householdId === me.householdId && alive(p) ? ' · lives with you' : alive(p) ? ` · 📍 ${cityName(cityOf(g, p))}` : ''}
            {alive(p) && p.flags.care_home ? ' · in a care home' : ''}
            {alive(p) && gpaOf(p) !== undefined && (ageOf(p, g.year) < 18 || p.studyingUntil) ? ` · GPA ${gpaOf(p)!.toFixed(2)}` : ''}
            {alive(p) && p.studyingUntil ? ` · at ${p.studyKind === 'top' ? 'a top university' : p.studyKind === 'trade' ? 'trade school' : 'university'}` : ''}
          </div>
          <div className="traits">{p.traits.map((t) => <span key={t} className="chip subtle">{t}</span>)}</div>
          {alive(p) && (
            <>
              <BondMeter label="Affinity" v={b.affinity} />
              <BondMeter label="Trust" v={b.trust} />
            </>
          )}
          {isMinorChild && <div className="hint">{receptivenessLabel(receptiveness(g, me, p))}</div>}
        </div>
      </article>
    );
  };

  return (
    <div className="stack">
      <Section title="Family">{living.length ? living.map(card) : <p className="muted">No living relatives yet.</p>}</Section>
      <FriendsCard g={g} />
      <DogsCard g={g} />
      {dead.length > 0 && <Section title="In memory">{dead.map(card)}</Section>}
    </div>
  );
}

type View = 'list' | 'tree';
const VIEW_KEY = 'family-view';

export function FamilyTab({ g }: { g: GameState }) {
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'tree' ? 'tree' : 'list';
    } catch {
      return 'list';
    }
  });
  const choose = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* per-viewer convenience only */
    }
  };
  return (
    <div className="stack">
      <Segmented<View> label="Family view" value={view} onChange={choose}
        options={[{ value: 'list', label: '👪 List' }, { value: 'tree', label: '🌳 Tree' }]} />
      {view === 'list' ? <FamilyList g={g} /> : <FamilyTree g={g} />}
    </div>
  );
}
