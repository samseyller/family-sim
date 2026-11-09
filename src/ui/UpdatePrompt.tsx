import { useRegisterSW } from 'virtual:pwa-register/react';
import { useGame } from '../store/gameStore';
import { flushSaves } from '../persistence/db';

/**
 * Offers a new version only at safe points: the title screen, planning, or a
 * year recap — never mid-decision. The latest autosave is flushed before reloading.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const phase = useGame((s) => s.game?.phase);
  const safe = !phase || phase === 'PLANNING' || phase === 'RECAP' || phase === 'GAME_OVER';
  if (!needRefresh || !safe) return null;
  return (
    <div className="update-banner" role="status">
      <span>✨ A new version of Family Tree is ready.</span>
      <span className="update-actions">
        <button
          className="small primary"
          onClick={async () => {
            await flushSaves();
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
