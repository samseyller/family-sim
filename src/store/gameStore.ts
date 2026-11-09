import { create } from 'zustand';
import type { GameState, Plan } from '../engine/types';
import { newGame } from '../engine/generate';
import {
  choose, chooseHeir, devKill, devSkip, dismissOutcome, nextYear, resolveYear, updatePlan,
} from '../engine/phases';
import { deleteSave, loadGame, requestPersistence, saveGame } from '../persistence/db';

export type Tab = 'home' | 'plan' | 'family' | 'journal';

interface Store {
  game: GameState | null;
  saved: GameState | null;
  ready: boolean;
  tab: Tab;
  confirmEnd: boolean;
  showDev: boolean;
  init(): Promise<void>;
  startNew(): void;
  continueGame(): void;
  toTitle(): void;
  setTab(t: Tab): void;
  setPlan(p: Plan): void;
  askEndYear(open: boolean): void;
  endYear(): void;
  choose(uid: string, choiceId: string): void;
  dismissOutcome(): void;
  nextYear(): void;
  chooseHeir(id: string | null): void;
  toggleDev(): void;
  dev(kind: 'skip10' | 'kill'): void;
}

export const useGame = create<Store>((set, get) => {
  /** Apply a new state and persist it. Autosaves rotate when a year's recap is reached. */
  const commit = (next: GameState) => {
    const prev = get().game;
    if (next === prev) return;
    set({ game: next, saved: next });
    void saveGame(next, next.phase === 'RECAP' && prev?.phase !== 'RECAP');
  };
  const withGame = (fn: (g: GameState) => GameState) => {
    const g = get().game;
    if (g) commit(fn(g));
  };

  return {
    game: null,
    saved: null,
    ready: false,
    tab: 'home',
    confirmEnd: false,
    showDev: false,
    async init() {
      void requestPersistence();
      // Never leave the title screen stuck: a failed load just means no "Continue".
      let saved: GameState | null = null;
      try {
        saved = (await loadGame()) ?? null;
      } catch (e) {
        console.error('Could not load save', e);
      }
      set({ saved, ready: true });
    },
    startNew() {
      void deleteSave();
      const g = newGame((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
      set({ tab: 'home' });
      commit(g);
    },
    continueGame() {
      const saved = get().saved;
      if (saved) set({ game: saved, tab: 'home' });
    },
    toTitle: () => set({ game: null, confirmEnd: false }),
    setTab: (tab) => set({ tab }),
    setPlan: (p) => withGame((g) => updatePlan(g, p)),
    askEndYear: (open) => set({ confirmEnd: open }),
    endYear() {
      set({ confirmEnd: false });
      withGame(resolveYear);
    },
    choose: (uid, choiceId) => withGame((g) => choose(g, uid, choiceId)),
    dismissOutcome: () => withGame(dismissOutcome),
    nextYear() {
      withGame(nextYear);
      set({ tab: 'plan' });
    },
    chooseHeir(id) {
      withGame((g) => chooseHeir(g, id));
      set({ tab: 'home' });
    },
    toggleDev: () => set((s) => ({ showDev: !s.showDev })),
    dev(kind) {
      withGame((g) => (kind === 'kill' ? devKill(g) : devSkip(g, 10)));
    },
  };
});
