import { create } from 'zustand';
import type { GameState, Plan } from '../engine/types';
import { newGame } from '../engine/generate';
import {
  choose, chooseHeir, devKill, devSkip, dismissOutcome, nextYear, resolveYear, updatePlan,
} from '../engine/phases';
import { isPersisted, loadSaves, requestPersistence, saveGame } from '../persistence/db';
import { downloadSave } from '../persistence/exportImport';

export type Tab = 'home' | 'plan' | 'family' | 'journal';
export type Panel = null | 'menu' | 'saves';

interface Store {
  game: GameState | null;
  saved: GameState | null;
  previous: GameState | null;
  recovered: boolean;
  persisted: boolean;
  ready: boolean;
  tab: Tab;
  panel: Panel;
  confirmEnd: boolean;
  showDev: boolean;
  init(): Promise<void>;
  startNew(): void;
  continueGame(): void;
  toTitle(): void;
  setTab(t: Tab): void;
  setPanel(p: Panel): void;
  setPlan(p: Plan): void;
  askEndYear(open: boolean): void;
  endYear(): void;
  choose(uid: string, choiceId: string): void;
  dismissOutcome(): void;
  nextYear(): void;
  chooseHeir(id: string | null): void;
  toggleDev(): void;
  dev(kind: 'skip10' | 'kill'): void;
  exportSave(): void;
  importSave(state: GameState): Promise<void>;
  restorePrevious(): Promise<void>;
}

export const useGame = create<Store>((set, get) => {
  /** Apply a new state and persist it. Autosaves rotate when a year's recap is reached. */
  const commit = (next: GameState, rotate?: boolean) => {
    const prev = get().game;
    if (next === prev) return;
    set({ game: next, saved: next });
    void saveGame(next, rotate ?? (next.phase === 'RECAP' && prev?.phase !== 'RECAP'));
  };
  const withGame = (fn: (g: GameState) => GameState) => {
    const g = get().game;
    if (g) commit(fn(g));
  };
  const refresh = async () => {
    let loaded: Awaited<ReturnType<typeof loadSaves>> = { recovered: false };
    try {
      loaded = await loadSaves();
    } catch (e) {
      console.error('Could not load save', e);
    }
    set({
      saved: loaded.current ?? null,
      previous: loaded.previous ?? null,
      recovered: loaded.recovered,
      persisted: await isPersisted(),
      ready: true,
    });
  };

  return {
    game: null,
    saved: null,
    previous: null,
    recovered: false,
    persisted: false,
    ready: false,
    tab: 'home',
    panel: null,
    confirmEnd: false,
    showDev: false,
    async init() {
      await requestPersistence();
      // Never leave the title screen stuck: a failed load just means no "Continue".
      await refresh();
    },
    startNew() {
      const g = newGame((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
      set({ tab: 'home', panel: null });
      // Rotate so the game being replaced stays recoverable as "previous".
      commit(g, true);
    },
    continueGame() {
      const saved = get().saved;
      if (saved) set({ game: saved, tab: 'home', panel: null });
    },
    toTitle() {
      set({ game: null, confirmEnd: false, panel: null });
      void refresh();
    },
    setTab: (tab) => set({ tab }),
    setPanel: (panel) => set({ panel }),
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
    exportSave() {
      const g = get().game ?? get().saved;
      if (!g) return;
      const marked = { ...g, lastBackupYear: g.year };
      downloadSave(marked);
      if (get().game) commit(marked, false);
      else {
        set({ saved: marked });
        void saveGame(marked, false);
      }
    },
    async importSave(state) {
      // The replaced game becomes "previous", so an import can be undone.
      await saveGame(state, true);
      set({ game: null, panel: null });
      await refresh();
      set({ game: get().saved, tab: 'home' });
    },
    async restorePrevious() {
      const prev = get().previous;
      if (!prev) return;
      await saveGame(prev, true);
      set({ game: null, panel: null });
      await refresh();
    },
  };
});
