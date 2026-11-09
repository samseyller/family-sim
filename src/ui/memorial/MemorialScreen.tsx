import { useMemo, useState } from 'react';
import type { GameState } from '../../engine/types';
import { archiveEntry, familyId } from '../../profile/tracker';
import type { ArchivedFamily } from '../../profile/types';
import { useGame } from '../../store/gameStore';
import { Modal } from '../components';
import { MemorialView } from './MemorialView';
import { downloadMemorial } from './exportHtml';

function MemorialActions({ family }: { family: ArchivedFamily }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  return (
    <button
      className="big"
      disabled={state === 'busy'}
      onClick={async () => {
        setState('busy');
        await downloadMemorial(family);
        setState('done');
      }}
    >
      {state === 'done' ? '✓ Memorial downloaded' : '📜 Download memorial (web page)'}
    </button>
  );
}

/** Shown when a family's story ends. Epitaphs are editable and saved to the archive. */
export function MemorialScreen({ g }: { g: GameState }) {
  const { profile, updateEpitaph, startNew, toTitle } = useGame();
  const id = familyId(g);
  const stored = profile.archive.find((f) => f.id === id);
  // The tracker archives the family on GAME_OVER; fall back to a fresh build if it hasn't landed yet.
  const family = useMemo(() => stored ?? archiveEntry(g, new Date().toISOString()), [stored, g]);
  return (
    <main className="memorial stack">
      <MemorialView family={family} onEpitaph={stored ? (memberId, text) => updateEpitaph(id, memberId, text) : undefined} />
      <p className="hint center">Epitaphs are saved to your Family Archive (🏅 Achievements &amp; stats).</p>
      <div className="title-actions">
        <MemorialActions family={family} />
        <button className="primary big" onClick={() => startNew()}>🎲 Start a new family</button>
        <button className="big" onClick={toTitle}>Title screen</button>
      </div>
    </main>
  );
}

/** A past family opened from the archive. */
export function ArchiveMemorial({ familyId: id, onClose }: { familyId: string; onClose: () => void }) {
  const { profile, updateEpitaph } = useGame();
  const family = profile.archive.find((f) => f.id === id);
  if (!family) return null;
  return (
    <Modal label={`The ${family.familyName} family memorial`} onClose={onClose}>
      <MemorialView family={family} onEpitaph={(memberId, text) => updateEpitaph(id, memberId, text)} />
      <div className="choices">
        <MemorialActions family={family} />
        <button className="big" onClick={onClose}>Back</button>
      </div>
    </Modal>
  );
}
