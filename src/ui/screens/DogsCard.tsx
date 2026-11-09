import { useEffect, useState } from 'react';
import { BREEDS, MAX_DOGS, SHELTER_FEE, type DogBreed } from '../../content/dogs';
import { dogAge, dogBlocker, dogsOf, dogStage, dogYearlyCost, maxDogs, type DogAction } from '../../engine/dogs';
import type { GameState } from '../../engine/types';
import { active, money } from '../../engine/util';
import { useGame } from '../../store/gameStore';
import { DogAvatar, DogFace } from '../DogAvatar';
import { Section } from '../components';

const STAGE_LABEL = { puppy: 'puppy', adult: 'adult', senior: 'senior' } as const;

function DogBtn({ g, action, label, hint, confirm, compact }: { g: GameState; action: DogAction; label: string; hint?: string; confirm?: string; compact?: boolean }) {
  const dog = useGame((s) => s.dog);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);
  const blocker = dogBlocker(g, action);
  return (
    <button className={compact ? `small${armed ? ' primary' : ''}` : `choice money-act${armed ? ' armed' : ''}`} disabled={!!blocker} title={blocker ?? undefined}
      onClick={() => {
        if (confirm && !armed) return setArmed(true);
        setArmed(false);
        dog(action);
      }}>
      <span>{armed ? `✔ ${confirm}` : label}</span>
      {!compact && <span className="hint">{blocker ?? hint}</span>}
    </button>
  );
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

/** The family's dogs: portraits, care, adoption, and those remembered. */
export function DogsCard({ g }: { g: GameState }) {
  const me = active(g);
  const hh = g.households[me.householdId];
  const dogs = dogsOf(hh);
  const gone = (hh.dogs ?? []).filter((d) => d.deathYear !== undefined);
  const [adopting, setAdopting] = useState(false);
  const [name, setName] = useState('');

  return (
    <Section title="🐕 Dogs" aside={<span className="hint">{dogs.length}/{maxDogs(hh)}</span>}>
      {!dogs.length && <p className="muted">No dog yet. Dogs cost money every year, but everyone at home is happier with one around.</p>}
      {dogs.map((d) => (
        <div key={d.id} className="dog-row">
          <DogAvatar dog={d} year={g.year} size={76} />
          <div className="dog-info">
            <div className="row"><strong>{d.name}</strong><span className="hint">{money(dogYearlyCost(d, g.year))}/yr</span></div>
            <div className="hint">
              {BREEDS[d.breed].label} · {dogAge(d, g.year) === 0 ? 'under 1 yr' : `${dogAge(d, g.year)} yr${dogAge(d, g.year) === 1 ? '' : 's'}`} ({STAGE_LABEL[dogStage(d, g.year)]})
              {d.trained ? ' · 🎓 trained' : ''}{d.rescued ? ' · 🏠 rescue' : ''}{d.lastWalkYear === g.year ? ' · 🦮 walked' : ''}
            </div>
            <Meter label="Bond" v={d.bond} />
            <Meter label="Health" v={d.health} />
            <DogBtn g={g} action={{ kind: 'rehome', dogId: d.id }} compact label="Find them a new home" confirm={`Confirm: rehome ${d.name}`} />
          </div>
        </div>
      ))}
      {dogs.length > 0 && <p className="hint">Walk them, play, and take them to the vet in Activities → Dogs. High-energy breeds drift away fast without walks.</p>}

      {!adopting ? (
        <button className="small" disabled={g.phase !== 'PLANNING' || dogs.length >= maxDogs(hh)} onClick={() => setAdopting(true)}>
          {dogs.length >= MAX_DOGS ? 'Full pack' : '➕ Adopt a dog'}
        </button>
      ) : (
        <div className="adopt">
          <label className="label" htmlFor="dog-name">Name</label>
          <input id="dog-name" maxLength={20} value={name} placeholder="Leave blank for a surprise" onChange={(e) => setName(e.target.value)} />
          <div className="label">From the shelter</div>
          <DogBtn g={g} action={{ kind: 'adoptShelter', name }} label={`🏠 Adopt a shelter dog (${money(SHELTER_FEE)})`} hint="An adult (2–6) of any breed; shy at first" />
          <div className="label">A puppy</div>
          <div className="breed-grid">
            {(Object.keys(BREEDS) as DogBreed[]).map((b) => (
              <div key={b} className="buy-home breed">
                <DogFace look={{ breed: b, coat: 0, stage: 'puppy', bond: 70, seed: b }} size={64} />
                <div>
                  <strong>{BREEDS[b].label}</strong>
                  <div className="hint">{BREEDS[b].blurb} · {BREEDS[b].size} · ~{BREEDS[b].lifespan} yrs</div>
                  <DogBtn g={g} action={{ kind: 'adoptPuppy', breed: b, name }} label={`Adopt: ${money(BREEDS[b].price)}`} />
                </div>
              </div>
            ))}
          </div>
          <button className="small" onClick={() => setAdopting(false)}>Done</button>
        </div>
      )}

      {gone.length > 0 && (
        <p className="hint">🌈 In loving memory: {gone.map((d) => `${d.name} (${d.birthYear}–${d.deathYear})`).join(', ')}</p>
      )}
    </Section>
  );
}
