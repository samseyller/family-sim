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
import { DEV_TOOLS } from '../../devtools';
import { unlockedTabs } from '../../engine/tutorial';
import { CoachMark, tabsWithNews } from '../CoachMark';
import type React from 'react';
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
      if (DEV_TOOLS && e.key === '`') toggleDev();
      const st = useGame.getState();
      const modalOpen = !!document.querySelector('.backdrop');
      if (modalOpen) return;
      // Number keys jump to a tab; [ and ] (controller LB/RB) cycle. Locked tabs are skipped.
      const open = st.game ? unlockedTabs(st.game) : [];
      const visible = TABS.filter((x) => open.includes(x.id));
      const n = Number(e.key);
      if (n >= 1 && n <= TABS.length && open.includes(TABS[n - 1].id)) setTab(TABS[n - 1].id);
      const i = Math.max(0, visible.findIndex((x) => x.id === st.tab));
      if (e.key === '[' && visible.length) setTab(visible[(i + visible.length - 1) % visible.length].id);
      if (e.key === ']' && visible.length) setTab(visible[(i + 1) % visible.length].id);
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
  const open = unlockedTabs(g);
  const shown: Tab = open.includes(tab) ? tab : 'home';
  const news = tabsWithNews(g);

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
        <CoachMark g={g} tab={shown} />
        {shown === 'home' && <HomeTab g={g} />}
        {shown === 'plan' && (g.phase === 'PLANNING' ? <PlanTab g={g} /> : <p className="muted center">The year is resolving…</p>)}
        {shown === 'family' && <FamilyTab g={g} />}
        {shown === 'journal' && <JournalTab g={g} />}
        {shown === 'money' && <MoneyTab g={g} />}
        {shown === 'activities' && <ActivitiesTab g={g} />}
      </main>

      <nav className="tabbar" aria-label="Sections" style={{ '--tabs': open.length } as React.CSSProperties}>
        {TABS.map((t, i) => open.includes(t.id) && (
          <button key={t.id} className={shown === t.id ? 'on' : ''} aria-current={shown === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <span aria-hidden>{t.icon}</span>
            <span>{t.label}</span>
            {news.includes(t.id) && <span className="new-dot" aria-label="new" />}
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
      {DEV_TOOLS && showDev && <DevPanel />}
    </div>
  );
}
