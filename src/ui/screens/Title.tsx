import { useEffect } from 'react';
import { useGame } from '../../store/gameStore';
import { focusFirst } from '../input';
import { active, ageOf, fullName } from '../../engine/util';
import { Avatar } from '../Avatar';

export function Title() {
  const { saved, startNew, continueGame, ready } = useGame();
  useEffect(() => {
    if (ready) focusFirst();
  }, [ready]);
  const me = saved && saved.phase !== 'GAME_OVER' ? active(saved) : null;
  return (
    <main className="title-screen" data-focus-scope>
      <div className="logo" aria-hidden>🌳</div>
      <h1>Family Tree</h1>
      <p className="muted">A life, a family, and the generations that follow.</p>
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
        <button className={me ? 'big' : 'primary big'} onClick={startNew} disabled={!ready}>
          🎲 Start a new family
        </button>
      </div>
      {me && <p className="hint">Starting a new family replaces your current save.</p>}
    </main>
  );
}
