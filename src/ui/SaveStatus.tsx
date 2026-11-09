import { useState } from 'react';
import { useGame } from '../store/gameStore';

/**
 * A persistent warning while the browser is refusing to save. It stays until a write
 * succeeds, offers a retry, and a way to download a backup so nothing is lost.
 */
export function SaveStatus() {
  const gameError = useGame((s) => s.gameSaveError);
  const profileError = useGame((s) => s.profileSaveError);
  const retrySave = useGame((s) => s.retrySave);
  const exportFullBackup = useGame((s) => s.exportFullBackup);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const error = gameError ?? profileError;
  if (!error) return null;
  return (
    <div className="save-status" role="alert">
      <strong>⚠️ {gameError ? 'Your game is not being saved.' : 'Your settings and achievements are not being saved.'}</strong>
      <p>
        {error} {gameError ? 'Progress since the last successful save will be lost if you close or reload the game.' : ''}
      </p>
      {note && <p className="hint">{note}</p>}
      <div className="row">
        <button
          className="small primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await retrySave();
            setBusy(false);
            setNote(ok ? null : 'Still failing. Free up space or check your browser settings, then try again.');
          }}
        >
          {busy ? 'Saving…' : 'Try saving again'}
        </button>
        <button className="small" onClick={() => exportFullBackup()}>Download a backup</button>
      </div>
    </div>
  );
}
