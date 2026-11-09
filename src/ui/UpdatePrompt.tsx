import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useGame } from '../store/gameStore';

/**
 * Offers a new version only at safe points: the title screen, planning, or a
 * year recap — never mid-decision. It saves first and refuses to reload if the
 * save fails, so an update can never throw away progress.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const phase = useGame((s) => s.game?.phase);
  const retrySave = useGame((s) => s.retrySave);
  const [blocked, setBlocked] = useState(false);
  const safe = !phase || phase === 'PLANNING' || phase === 'RECAP' || phase === 'GAME_OVER';
  if (!needRefresh || !safe) return null;
  return (
    <div className="update-banner" role="status">
      <span>
        {blocked
          ? "⚠️ Can't update yet: your progress isn't saved. Fix saving first (see the warning at the top)."
          : '✨ A new version of Family Tree is ready.'}
      </span>
      <span className="update-actions">
        <button
          className="small primary"
          onClick={async () => {
            if (!(await retrySave())) {
              setBlocked(true);
              return;
            }
            setBlocked(false);
            await updateServiceWorker(true);
          }}
        >
          Update
        </button>
        <button className="small" onClick={() => setNeedRefresh(false)}>Later</button>
      </span>
    </div>
  );
}
