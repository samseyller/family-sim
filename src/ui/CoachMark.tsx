import { useState } from 'react';
import { guidedPerson, type TabId } from '../engine/tutorial';
import type { GameState } from '../engine/types';
import { ageOf } from '../engine/util';
import { useGame } from '../store/gameStore';

interface Tip {
  id: string;
  age: number;
  /** Only show on this tab (otherwise anywhere). */
  tab?: TabId;
  title: string;
  body: string;
}

/** The guided first life, one tip at a time. */
export const TIPS: Tip[] = [
  {
    id: 'welcome', age: 18, tab: 'home', title: '🌱 Welcome to your first life',
    body: "You're 18 and just finished high school. This guided life opens the game up a little at a time, and keeps the worst surprises away while you learn. Home shows how you're doing: health, happiness, smarts, fitness, and stress.",
  },
  {
    id: 'plan', age: 18, tab: 'plan', title: '🗓️ Planning your year',
    body: "Every year you get 12 blocks of time. Spend them on yourself, friends, family, and (soon) work. Each extra block on the same thing is worth a little less, so spread them around. When you're happy, press End year (or E).",
  },
  {
    id: 'decisions', age: 18, title: '⭐ Life events',
    body: "When a year ends, life happens: big choices at turning points, little moments in between. There's rarely a wrong answer, but choices have consequences, sometimes years later. Your first one is coming up: what to do after high school.",
  },
  {
    id: 'family', age: 20, tab: 'family', title: '👪 New: Family',
    body: 'The Family tab shows everyone in your life and how close you are: affinity is warmth, trust is whether they listen to you. Switch to Tree to see the whole family. The Journal (tab 4) remembers everything that happened.',
  },
  {
    id: 'money', age: 24, tab: 'money', title: '💰 New: Money',
    body: "Until now family had your back. From here the money is yours: see this year's estimate, choose a lifestyle, rent or buy a home, buy cars, invest, and save for retirement. Saving early makes a huge difference later.",
  },
  {
    id: 'activities', age: 30, tab: 'activities', title: '🎯 New: Activities',
    body: 'Activities are things you do right away, outside your 12 blocks: game nights, trips, check-ups, visits to family. They cost energy (up to 100 a year, less if you are sick or stressed) and usually money. Cheap ones can be done many times; a vacation or two will use most of a year.',
  },
  {
    id: 'free', age: 35, title: '🌳 On your own now',
    body: "That's the guided part done. From here, life can surprise you, for better and worse. You can see everything; play however you like. Good luck!",
  },
];

/** First unseen tip that applies here, if the guided life is on. */
export function currentTip(g: GameState, tab: TabId): Tip | undefined {
  const p = guidedPerson(g);
  if (!p || p.id !== g.activeId) return undefined;
  const age = ageOf(p, g.year);
  return TIPS.find((t) => !g.tutorial!.seen.includes(t.id) && age >= t.age && (!t.tab || t.tab === tab));
}

/** Tabs with an unseen tip waiting (for the "new" dot). */
export function tabsWithNews(g: GameState): TabId[] {
  const p = guidedPerson(g);
  if (!p || p.id !== g.activeId) return [];
  const age = ageOf(p, g.year);
  return TIPS.filter((t) => t.tab && !g.tutorial!.seen.includes(t.id) && age >= t.age).map((t) => t.tab!);
}

export function CoachMark({ g, tab }: { g: GameState; tab: TabId }) {
  const markTip = useGame((s) => s.markTip);
  const skipGuide = useGame((s) => s.skipGuide);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const tip = currentTip(g, tab);
  if (!tip) return null;
  return (
    <aside className="coach" role="note" aria-label={tip.title}>
      <strong>{tip.title}</strong>
      <p>{tip.body}</p>
      <div className="row">
        <button className="small primary" onClick={() => markTip(tip.id)}>Got it</button>
        {tip.id === 'welcome' && (
          <button className="small" onClick={() => (confirmSkip ? skipGuide() : setConfirmSkip(true))}>
            {confirmSkip ? 'Really switch off the guide?' : 'Switch off the guide'}
          </button>
        )}
      </div>
    </aside>
  );
}
