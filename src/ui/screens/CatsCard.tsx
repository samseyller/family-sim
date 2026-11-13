import { useState } from 'react';
import { CAT_BREEDS, CAT_SHELTER_FEE, CAT_TREE_COST, type CatBreed } from '../../content/cats';
import { catAge, catBlocker, catsOf, catStage, catYearlyCost, maxCats, type CatAction } from '../../engine/cats';
import type { GameState } from '../../engine/types';
import { active, money } from '../../engine/util';
import { useGame } from '../../store/gameStore';
import { CatAvatar, CatFace } from '../CatAvatar';
import { ActionButton, Reveal, Section } from '../components';

function CatBtn({ g, action, label, hint, confirm }: { g: GameState; action: CatAction; label: string; hint?: string; confirm?: string }) {
  const cat = useGame((s) => s.cat);
  return <ActionButton label={label} hint={hint} confirm={confirm} blocker={catBlocker(g, action)} onClick={() => cat(action)} />;
}

function Meter({ label, v }: { label: string; v: number }) {
  return (
    <div className="bond">
      <span className="hint">{label}</span>
      <div className="bar center-bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)}>
        <div className={`fill ${v >= 40 ? 'good' : 'bad'}`} style={{ left: 0, width: `${Math.max(0, Math.min(100, v))}%` }} />
      </div>
      <span className="hint">{Math.round(v)}</span>
    </div>
  );
}

/** The family's cats: portraits, care, adoption, and those remembered. */
export function CatsCard({ g }: { g: GameState }) {
  const me = active(g);
  const hh = g.households[me.householdId];
  const cats = catsOf(hh);
  const gone = (hh.cats ?? []).filter((c) => c.deathYear !== undefined);
  const [name, setName] = useState('');

  return (
    <Section title="🐈 Cats" aside={<span className="hint">{cats.length}/{maxCats(hh)}</span>}>
      {!cats.length && <p className="muted">No cat yet. Cats are cheaper than dogs and need no walks, just playtime and a sunny windowsill.</p>}
      {cats.map((c) => (
        <div key={c.id} className="dog-row">
          <CatAvatar cat={c} year={g.year} size={76} />
          <div className="dog-info">
            <div className="row"><strong>{c.name}</strong><span className="hint">{money(catYearlyCost(c, g.year))}/yr</span></div>
            <div className="hint">
              {CAT_BREEDS[c.breed].label} · {catAge(c, g.year) === 0 ? 'under 1 yr' : `${catAge(c, g.year)} yr${catAge(c, g.year) === 1 ? '' : 's'}`} ({catStage(c, g.year)})
              {c.stray ? ' · 🚪 was a stray' : c.rescued ? ' · 🏠 rescue' : ''}{c.lastPlayYear === g.year ? ' · 🧶 played' : ''}
            </div>
            <Meter label="Bond" v={c.bond} />
            <Meter label="Health" v={c.health} />
            <Reveal label="Options">
              <div className="choices">
                <CatBtn g={g} action={{ kind: 'rehomeCat', catId: c.id }} label={`Find ${c.name} a new home`} confirm={`Confirm: rehome ${c.name}`} />
              </div>
            </Reveal>
          </div>
        </div>
      ))}
      {cats.length > 0 && (
        <>
          <p className="hint">Play, naps, brushing and the vet are in Activities → Pets. {hh.catTree ? '🌳 You have a cat tree.' : ''}</p>
          {!hh.catTree && <div className="choices"><CatBtn g={g} action={{ kind: 'catTree' }} label={`🌳 Buy a cat tree (${money(CAT_TREE_COST)})`} hint="Happier cats, and the couch survives" /></div>}
        </>
      )}

      <Reveal label="Adopt a cat">
        <label className="label" htmlFor="cat-name">Name</label>
        <input id="cat-name" maxLength={20} value={name} placeholder="Leave blank for a surprise" onChange={(e) => setName(e.target.value)} />
        <div className="label">From the shelter</div>
        <div className="choices">
          <CatBtn g={g} action={{ kind: 'adoptShelterCat', name }} label={`🏠 Adopt a shelter cat (${money(CAT_SHELTER_FEE)})`} hint="An adult (1–8), usually a domestic shorthair; warms up slowly" />
        </div>
        <div className="label">A kitten</div>
        <div className="breed-grid">
          {(Object.keys(CAT_BREEDS) as CatBreed[]).map((b) => (
            <div key={b} className="buy-home breed">
              <CatFace look={{ breed: b, coat: 0, stage: 'kitten', bond: 50, seed: b }} size={64} />
              <div>
                <strong>{CAT_BREEDS[b].label}</strong>
                <div className="hint">{CAT_BREEDS[b].blurb} · {CAT_BREEDS[b].longHair ? 'long hair' : 'short hair'} · ~{CAT_BREEDS[b].lifespan} yrs</div>
                <CatBtn g={g} action={{ kind: 'adoptKitten', breed: b, name }} label={`Adopt: ${money(CAT_BREEDS[b].price)}`} />
              </div>
            </div>
          ))}
        </div>
      </Reveal>

      {gone.length > 0 && <p className="hint">🌈 In loving memory: {gone.map((c) => `${c.name} (${c.birthYear}–${c.deathYear})`).join(', ')}</p>}
    </Section>
  );
}
