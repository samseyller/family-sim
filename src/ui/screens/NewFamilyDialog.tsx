import { useState } from 'react';
import { FEMALE_NAMES, LAST_NAMES, MALE_NAMES } from '../../content/names';
import { NAME_MAX } from '../../engine/util';
import { useGame } from '../../store/gameStore';
import { Modal } from '../components';

const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];

/** Name your character and family before starting (or leave blank for random names). */
export function NewFamilyDialog({ start, onClose }: { start: 'adult' | 'child'; onClose: () => void }) {
  const startNew = useGame((s) => s.startNew);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  return (
    <Modal label="Start a new family" onClose={onClose}>
      <h2>{start === 'child' ? '🧒 Start as a child' : '🎲 Start a new family'}</h2>
      <p className="muted">
        {start === 'child' ? 'Begin at 6, living with your parents.' : 'Begin in your mid-thirties with a partner and kids.'} Leave a
        name blank for a random one.
      </p>
      <form
        className="name-fields"
        onSubmit={(e) => {
          e.preventDefault();
          startNew(start, { first, last });
        }}
      >
        <div className="name-field">
          <label className="hint" htmlFor="nf-first">Your first name</label>
          <input id="nf-first" type="text" value={first} maxLength={NAME_MAX} placeholder="Random" autoComplete="off" onChange={(e) => setFirst(e.target.value)} />
          <button type="button" className="small" aria-label="Random first name" onClick={() => setFirst(pick([...FEMALE_NAMES, ...MALE_NAMES]))}>🎲</button>
        </div>
        <div className="name-field">
          <label className="hint" htmlFor="nf-last">Family name</label>
          <input id="nf-last" type="text" value={last} maxLength={NAME_MAX} placeholder="Random" autoComplete="off" onChange={(e) => setLast(e.target.value)} />
          <button type="button" className="small" aria-label="Random family name" onClick={() => setLast(pick(LAST_NAMES))}>🎲</button>
        </div>
        <div className="choices">
          <button type="submit" className="primary big" data-autofocus>Begin</button>
          <button type="button" className="big" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
