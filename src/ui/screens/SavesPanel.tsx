import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../../engine/types';
import { ageOf, fullName } from '../../engine/util';
import { parseSaveFile, yearsSinceBackup, type ImportResult } from '../../persistence/exportImport';

import { useGame, type FullImportResult } from '../../store/gameStore';
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

type Ok = Extract<ImportResult, { ok: true }>;
type Pending = { kind: 'import'; res: Ok } | { kind: 'restore' } | null;

function FullBackupConfirm({ res, onCancel }: { res: Extract<Ok, { kind: 'full' }>; onCancel: () => void }) {
  const { saved, importFullBackup, setPanel } = useGame();
  const [useSettings, setUseSettings] = useState(false);
  const [loadGame, setLoadGame] = useState(!saved && !!res.current);
  const [done, setDone] = useState<FullImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const p = res.profile;

  if (done) {
    return (
      <Modal label="Backup restored" key="done">
        <h2>✓ Backup restored</h2>
        <ul className="journal-list">
          <li>{done.newAchievements} new achievement{done.newAchievements === 1 ? '' : 's'}</li>
          <li>{done.newArchived} family memorial{done.newArchived === 1 ? '' : 's'} added to the archive</li>
          <li>{done.statsRaised} lifetime stat{done.statsRaised === 1 ? '' : 's'} raised</li>
          {loadGame && res.current && <li>Game loaded: {fullName(res.current.people[res.current.activeId])}</li>}
          {done.previousFrom === 'your-game' && <li>Your earlier game is kept as the previous autosave.</li>}
          {done.previousFrom === 'backup' && <li>The backup's previous autosave was restored too.</li>}
        </ul>
        <button className="primary big close-btn" onClick={() => setPanel(null)}>Done</button>
      </Modal>
    );
  }

  return (
    <Modal label="Restore full backup?" onClose={onCancel} key="full">
      <h2>Restore full backup?</h2>
      <p className="muted">
        Your progress is merged, never overwritten: achievements and archived families are combined, and each lifetime
        stat keeps the higher value.
      </p>
      <div className="save-card">
        <div aria-hidden className="logo small">🏅</div>
        <div>
          <div className="hint">In this backup</div>
          <strong>{Object.keys(p.achievements).length} achievements · {p.archive.length} archived families</strong>
          <div className="hint">{p.stats.yearsPlayed} years played · {p.stats.familiesStarted} families started</div>
        </div>
      </div>
      {res.current && <SaveCard s={res.current} label="Game in this backup" />}
      {res.warnings.map((w) => <p key={w} className="notice">⚠️ {w}</p>)}
      <div className="toggles">
        <label className="toggle">
          <input type="checkbox" checked={useSettings} onChange={(e) => setUseSettings(e.target.checked)} />
          Use the settings from this backup
        </label>
        {res.current && (
          <label className="toggle">
            <input type="checkbox" checked={loadGame} onChange={(e) => setLoadGame(e.target.checked)} />
            Load the game from this backup
          </label>
        )}
      </div>
      {res.current && loadGame && (
        <p className="hint">
          {saved
            ? "Your current game becomes the previous autosave, so you can switch back. The backup's own older autosave is not restored."
            : res.previous ? "The backup's previous autosave is restored too." : ''}
        </p>
      )}
      {error && <pre className="error-detail bad" role="alert">{error}</pre>}
      <div className="choices">
        <button
          className="primary big"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              setDone(await importFullBackup({ profile: p, current: res.current, previous: res.previous, useIncomingSettings: useSettings, loadGame }));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Restore
        </button>
        <button className="big" onClick={onCancel}>Cancel</button>
      </div>
    </Modal>
  );
}

/** Export, import, and recovery. Used from the title screen and the in-game menu. */
export function SavesPanel() {
  const { saved, previous, recovered, persisted, setPanel, exportSave, exportFullBackup, importSave, restorePrevious, refreshSaves } = useGame();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [exported, setExported] = useState<null | 'game' | 'full'>(null);
  const close = () => setPanel(null);

  // Show what is actually stored right now (the previous autosave changes as you play).
  useEffect(() => {
    void refreshSaves();
  }, [refreshSaves]);

  const onFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    try {
      const res = parseSaveFile(await file.text());
      if (res.ok) setPending({ kind: 'import', res });
      else setError(res.error);
    } catch {
      setError("That file couldn't be read. Your current game is unchanged.");
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  /** Run a load/restore; keep the confirm screen open with the reason if saving fails. */
  const confirm = async (run: () => Promise<void>) => {
    setBusy(true);
    setConfirmError(null);
    try {
      await run();
      setPending(null);
    } catch (e) {
      setConfirmError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (pending?.kind === 'import' && pending.res.kind === 'full') {
    return <FullBackupConfirm res={pending.res} onCancel={() => setPending(null)} />;
  }

  if (pending) {
    const incoming = pending.kind === 'import' && pending.res.kind === 'game' ? pending.res.state : previous!;
    const warnings = pending.kind === 'import' ? pending.res.warnings : [];
    return (
      <Modal label="Confirm" onClose={() => setPending(null)} key="confirm">
        <h2>{pending.kind === 'import' ? 'Load this save?' : 'Restore the previous autosave?'}</h2>
        <SaveCard s={incoming} label={pending.kind === 'import' ? 'From file' : 'Previous autosave'} />
        {warnings.map((w) => <p key={w} className="notice">⚠️ {w}</p>)}
        {saved && (
          <p className="muted">
            It replaces your current game ({fullName(saved.people[saved.activeId])}, {saved.year}). The current game is kept as the
            previous autosave, so you can switch back.
          </p>
        )}
        {confirmError && <pre className="error-detail bad" role="alert">{confirmError}</pre>}
        <div className="choices">
          <button className="primary big" disabled={busy} onClick={() => confirm(() => (pending.kind === 'import' ? importSave(incoming) : restorePrevious()))}>
            {pending.kind === 'import' ? 'Load save' : 'Restore'}
          </button>
          <button className="big" onClick={() => { setPending(null); setConfirmError(null); }}>Cancel</button>
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
        <button className="choice" onClick={() => { exportFullBackup(); setExported('full'); }}>
          <span>📦 Export full backup</span>
          <span className="hint">{exported === 'full' ? 'Downloaded. Keep it somewhere safe.' : 'Achievements, stats, archive, settings, and your game'}</span>
        </button>
        {saved && (
          <button className="choice" onClick={() => { exportSave(); setExported('game'); }}>
            <span>⬇️ Export this game only</span>
            <span className="hint">
              {exported === 'game' ? 'Downloaded.' : saved.lastBackupYear === undefined ? 'Not backed up yet'
                : yearsSinceBackup(saved) === 0 ? 'Backed up this year' : `Last backup: year ${saved.lastBackupYear}`}
            </span>
          </button>
        )}
        <button className="choice" onClick={() => fileRef.current?.click()}>
          <span>⬆️ Import a backup file…</span>
          <span className="hint">Game or full backup. Checked before anything changes</span>
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} aria-label="Backup file to import" />
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
  const { setPanel, toTitle } = useGame();
  return (
    <Modal label="Menu" onClose={() => setPanel(null)}>
      <h2>Menu</h2>
      <div className="choices">
        <button className="choice" onClick={() => setPanel('saves')}><span>💾 Saves & backups</span><span className="hint">Export, import, and restore</span></button>
        <button className="choice" onClick={() => setPanel('achievements')}><span>🏅 Achievements & stats</span></button>
        <button className="choice" onClick={() => setPanel('settings')}><span>⚙️ Settings</span></button>
        <button className="choice" onClick={toTitle}><span>🏠 Title screen</span><span className="hint">Your game is saved automatically</span></button>
        <button className="choice" onClick={() => setPanel(null)}><span>Close</span></button>
      </div>
    </Modal>
  );
}

/** Shown in the year recap when the player's reminder interval has passed without an export. */
export function BackupReminder({ g }: { g: GameState }) {
  const exportSave = useGame((s) => s.exportSave);
  const every = useGame((s) => s.profile.settings.backupReminderYears);
  const [done, setDone] = useState(false);
  const years = yearsSinceBackup(g);
  if (!done && (every <= 0 || years < every)) return null;
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
