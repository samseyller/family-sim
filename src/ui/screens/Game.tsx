import { useEffect } from 'react';
import { useGame, type Tab } from '../../store/gameStore';
import { active, ageOf, money } from '../../engine/util';
import { HomeTab } from './HomeTab';
import { PlanTab } from './PlanTab';
import { FamilyTab } from './FamilyTab';
import { JournalTab } from './JournalTab';
import { MoneyTab } from './MoneyTab';
import { ActivitiesTab } from './ActivitiesTab';
import { ConfirmEndYear, DevPanel, EventModal, MemorialScreen, RecapModal, SuccessionScreen } from './Overlays';
import { GameMenu, SavesPanel } from './SavesPanel';
import { isTyping } from '../input';
import { AchievementsPanel, SettingsPanel } from './ProfilePanels';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'plan', label: 'Plan', icon: '🗓️' },
  { id: 'family', label: 'Family', icon: '👪' },
  { id: 'journal', label: 'Journal', icon: '📖' },
  { id: 'money', label: 'Money', icon: '💰' },
  { id: 'activities', label: 'Activities', icon: '🎯' },
];

export function Game() {
  const { game: g, tab, setTab, confirmEnd, askEndYear, showDev, toggleDev, panel, setPanel } = useGame();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (isTyping(t)) return;
      if (e.key === '`') toggleDev();
      const st = useGame.getState();
      const modalOpen = !!document.querySelector('.backdrop');
      if (modalOpen) return;
      const n = Number(e.key);
      if (n >= 1 && n <= TABS.length) setTab(TABS[n - 1].id);
      // [ and ] (controller LB/RB) cycle tabs; m (Select) opens the menu.
      const i = TABS.findIndex((x) => x.id === st.tab);
      if (e.key === '[') setTab(TABS[(i + TABS.length - 1) % TABS.length].id);
      if (e.key === ']') setTab(TABS[(i + 1) % TABS.length].id);
      if (e.key === 'm' || e.key === 'M') setPanel('menu');
      if ((e.key === 'e' || e.key === 'E') && st.game?.phase === 'PLANNING') askEndYear(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTab, askEndYear, toggleDev, setPanel]);

  if (!g) return null;
  if (g.phase === 'GAME_OVER') return <MemorialScreen g={g} />;
  const me = active(g);
  const hh = g.households[me.householdId];

  return (
    <div className="app">
      <header className="topbar">
        <button className="ghost" onClick={() => setPanel('menu')} aria-label="Menu">🌳</button>
        <div className="topbar-mid">
          <strong>{g.year}</strong>
          <span className="muted"> · {me.firstName}, {ageOf(me, g.year)}</span>
        </div>
        <span className={hh.wallet < 0 ? 'neg' : 'money'}>{money(hh.wallet)}</span>
      </header>

      <main className="content">
        {tab === 'home' && <HomeTab g={g} />}
        {tab === 'plan' && (g.phase === 'PLANNING' ? <PlanTab g={g} /> : <p className="muted center">The year is resolving…</p>)}
        {tab === 'family' && <FamilyTab g={g} />}
        {tab === 'journal' && <JournalTab g={g} />}
        {tab === 'money' && <MoneyTab g={g} />}
        {tab === 'activities' && <ActivitiesTab g={g} />}
      </main>

      <nav className="tabbar" aria-label="Sections">
        {TABS.map((t, i) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <span aria-hidden>{t.icon}</span>
            <span>{t.label}</span>
            <kbd className="kbd-hint">{i + 1}</kbd>
          </button>
        ))}
      </nav>

      {g.phase === 'DECISIONS' || g.lastOutcome ? <EventModal g={g} />
        : g.phase === 'RECAP' ? <RecapModal g={g} />
        : g.phase === 'SUCCESSION' ? <SuccessionScreen g={g} />
        : confirmEnd ? <ConfirmEndYear g={g} /> : null}
      {panel === 'menu' && <GameMenu />}
      {panel === 'saves' && <SavesPanel />}
      {panel === 'settings' && <SettingsPanel />}
      {panel === 'achievements' && <AchievementsPanel />}
      {showDev && <DevPanel />}
    </div>
  );
}
