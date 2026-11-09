import { useRef, useState } from 'react';
import type { GameState } from '../../engine/types';
import { ageOf, fullName } from '../../engine/util';
import { BACKUP_REMINDER_YEARS, parseSaveFile, yearsSinceBackup } from '../../persistence/exportImport';
import { useGame } from '../../store/gameStore';
import { Avatar } from '../Avatar';
import { Modal } from '../components';

function SaveCard({ s, label }: { s: GameState; label: string }) {
  const me = s.people[s.activeId];
  return (
    <div className="save-card">
      <Avatar person={me} year={s.year} size={44} />
      <div>
        <div className="hint">{label}</div>
        <strong>{fullName(me)}</strong>
        <div className="hint">
          Year {s.year} · age {ageOf(me, s.year)} · generation {me.generation}
          {s.phase === 'GAME_OVER' ? ' · story ended' : ''}
        </div>
      </div>
    </div>
  );
}

type Pending = { kind: 'import'; state: GameState; warnings: string[] } | { kind: 'restore' } | null;

/** Export, import, and recovery. Used from the title screen and the in-game menu. */
export function SavesPanel() {
  const { saved, previous, recovered, persisted, setPanel, exportSave, importSave, restorePrevious } = useGame();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [exported, setExported] = useState(false);
  const close = () => setPanel(null);

  const onFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    const res = parseSaveFile(await file.text());
    if (res.ok) setPending({ kind: 'import', state: res.state, warnings: res.warnings });
    else setError(res.error);
    if (fileRef.current) fileRef.current.value = '';
  };

  if (pending) {
    const incoming = pending.kind === 'import' ? pending.state : previous!;
    return (
      <Modal label="Confirm" onClose={() => setPending(null)} key="confirm">
        <h2>{pending.kind === 'import' ? 'Load this save?' : 'Restore the previous autosave?'}</h2>
        <SaveCard s={incoming} label={pending.kind === 'import' ? 'From file' : 'Previous autosave'} />
        {pending.kind === 'import' && pending.warnings.map((w) => <p key={w} className="notice">⚠️ {w}</p>)}
        {saved && (
          <p className="muted">
            It replaces your current game ({fullName(saved.people[saved.activeId])}, {saved.year}). The current game is kept as the
            previous autosave, so you can switch back.
          </p>
        )}
        <div className="choices">
          <button className="primary big" onClick={() => (pending.kind === 'import' ? importSave(pending.state) : restorePrevious())}>
            {pending.kind === 'import' ? 'Load save' : 'Restore'}
          </button>
          <button className="big" onClick={() => setPending(null)}>Cancel</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal label="Saves and backups" onClose={close} key="saves">
      <h2>💾 Saves & backups</h2>
      {recovered && <p className="notice">⚠️ Your latest autosave was damaged, so the previous one was loaded instead.</p>}
      <p className={persisted ? 'hint' : 'notice'}>
        {persisted
          ? '✓ The browser has agreed to keep your saves. Backups are still a good idea.'
          : '⚠️ Your browser may clear saved games (for example when clearing site data). Export a backup to be safe.'}
      </p>

      {saved && <SaveCard s={saved} label="Current game" />}
      <div className="choices">
        {saved && (
          <button className="choice" onClick={() => { exportSave(); setExported(true); }}>
            <span>⬇️ Export backup file</span>
            <span className="hint">
              {exported ? 'Downloaded. Keep it somewhere safe.' : saved.lastBackupYear === undefined ? 'Not backed up yet'
                : yearsSinceBackup(saved) === 0 ? 'Backed up this year' : `Last backup: year ${saved.lastBackupYear}`}
            </span>
          </button>
        )}
        <button className="choice" onClick={() => fileRef.current?.click()}>
          <span>⬆️ Import a save file…</span>
          <span className="hint">Checked before anything is replaced</span>
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} aria-label="Save file to import" />
        {previous && (
          <button className="choice" onClick={() => setPending({ kind: 'restore' })}>
            <span>↩️ Restore previous autosave</span>
            <span className="hint">{fullName(previous.people[previous.activeId])} · year {previous.year}</span>
          </button>
        )}
      </div>
      {error && <pre className="error-detail bad" role="alert">{error}</pre>}
      <button className="big close-btn" onClick={close}>Close</button>
    </Modal>
  );
}

/** In-game menu behind the 🌳 button. */
export function GameMenu() {
  const { setPanel, toTitle, exportSave } = useGame();
  const [exported, setExported] = useState(false);
  return (
    <Modal label="Menu" onClose={() => setPanel(null)}>
      <h2>Menu</h2>
      <div className="choices">
        <button className="choice" onClick={() => { exportSave(); setExported(true); }}>
          <span>⬇️ Export backup file</span>
          {exported && <span className="hint">Downloaded.</span>}
        </button>
        <button className="choice" onClick={() => setPanel('saves')}><span>💾 Saves & backups</span></button>
        <button className="choice" onClick={toTitle}><span>🏠 Title screen</span><span className="hint">Your game is saved automatically</span></button>
        <button className="choice" onClick={() => setPanel(null)}><span>Close</span></button>
      </div>
    </Modal>
  );
}

/** Shown in the year recap every BACKUP_REMINDER_YEARS years without an export. */
export function BackupReminder({ g }: { g: GameState }) {
  const exportSave = useGame((s) => s.exportSave);
  const [done, setDone] = useState(false);
  const years = yearsSinceBackup(g);
  if (!done && years < BACKUP_REMINDER_YEARS) return null;
  return (
    <div className="notice backup-reminder">
      {done ? (
        <span>✓ Backup downloaded.</span>
      ) : (
        <>
          <span>💾 {g.lastBackupYear ? `${years} years since your last backup.` : "You haven't backed up this family yet."}</span>
          <button className="small" onClick={() => { exportSave(); setDone(true); }}>Export</button>
        </>
      )}
    </div>
  );
}
