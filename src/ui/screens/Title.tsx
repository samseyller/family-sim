import { useEffect, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { focusFirst } from '../input';
import { active, ageOf, fullName } from '../../engine/util';
import { Avatar } from '../Avatar';
import { SavesPanel } from './SavesPanel';
import { NewFamilyDialog } from './NewFamilyDialog';
import type { StartKind } from '../../engine/generate';
import { AchievementsPanel, SettingsPanel } from './ProfilePanels';

export function Title() {
  const { saved, continueGame, ready, panel, setPanel, recovered, profile } = useGame();
  const firstTime = profile.stats.familiesStarted === 0;
  const [starting, setStarting] = useState<null | StartKind>(null);
  useEffect(() => {
    if (ready && !panel) focusFirst();
  }, [ready, panel]);
  const me = saved && saved.phase !== 'GAME_OVER' ? active(saved) : null;
  return (
    <main className="title-screen" data-focus-scope>
      <div className="logo" aria-hidden>🌳</div>
      <h1>Family Tree</h1>
      <p className="muted">A life, a family, and the generations that follow.</p>
      {recovered && <p className="notice">⚠️ Your latest autosave was damaged; the previous one was loaded.</p>}
      <div className="title-actions">
        {me && saved && (
          <button className="primary big" onClick={continueGame}>
            <Avatar person={me} year={saved.year} size={40} />
            <span>
              Continue as {fullName(me)}
              <small>Year {saved.year} · age {ageOf(me, saved.year)}</small>
            </span>
          </button>
        )}
        {firstTime && !me && (
          <button className="primary big guided-btn" onClick={() => setStarting("guided")} disabled={!ready}>
            <span>🌱 Guided first life<small>Recommended for your first game: start at 18 and learn as you go</small></span>
          </button>
        )}
        <button className={me || firstTime ? "big" : "primary big"} onClick={() => setStarting("adult")} disabled={!ready}>
          🎲 Start a new family
        </button>
        <button className="big" onClick={() => setStarting("child")} disabled={!ready}>
          🧒 Start as a child
        </button>
        {!(firstTime && !me) && (
          <button className="big" onClick={() => setStarting("guided")} disabled={!ready}>🌱 Guided first life</button>
        )}
        <button className="big" onClick={() => setPanel('saves')} disabled={!ready}>
          💾 Saves & backups
        </button>
        <div className="title-row">
          <button className="big" onClick={() => setPanel('achievements')} disabled={!ready}>🏅 Achievements</button>
          <button className="big" onClick={() => setPanel('settings')} disabled={!ready}>⚙️ Settings</button>
        </div>
      </div>
      {me && <p className="hint">Starting a new family replaces your current game. It stays recoverable as the previous autosave.</p>}
      {panel === 'saves' && <SavesPanel />}
      {starting && <NewFamilyDialog start={starting} onClose={() => setStarting(null)} />}
      {panel === 'settings' && <SettingsPanel />}
      {panel === 'achievements' && <AchievementsPanel />}
    </main>
  );
}
