import { create } from 'zustand';
import type { GameState, Plan } from '../engine/types';
import { newGame, type StartNames } from '../engine/generate';
import { financeAction, type FinanceAction } from '../engine/finance';
import { dismissActivity, performActivity } from '../engine/activities';
import {
  choose, chooseHeir, devKill, devSkip, dismissOutcome, nextYear, resolveYear, updatePlan,
} from '../engine/phases';
import { isPersisted, loadProfile, loadSaves, requestPersistence, saveGame, saveProfile } from '../persistence/db';
import { downloadJson, downloadSave, fullBackupFileName, serializeFullBackup } from '../persistence/exportImport';
import type { AchievementDef } from '../content/achievements';
import { track, trackNewFamily } from '../profile/tracker';
import { mergeProfiles, type MergeSummary } from '../profile/merge';
import { EPITAPH_MAX, newProfile, type Profile, type Settings } from '../profile/types';

export type Tab = 'home' | 'plan' | 'family' | 'journal' | 'money' | 'activities';
export type Panel = null | 'menu' | 'saves' | 'settings' | 'achievements';

export interface FullImport {
  profile: Profile;
  current?: GameState;
  previous?: GameState;
  useIncomingSettings: boolean;
  loadGame: boolean;
}

interface Store {
  game: GameState | null;
  saved: GameState | null;
  previous: GameState | null;
  profile: Profile;
  toasts: AchievementDef[];
  recovered: boolean;
  persisted: boolean;
  ready: boolean;
  tab: Tab;
  panel: Panel;
  confirmEnd: boolean;
  showDev: boolean;
  init(): Promise<void>;
  startNew(start?: "adult" | "child", names?: StartNames): void;
  continueGame(): void;
  toTitle(): void;
  setTab(t: Tab): void;
  setPanel(p: Panel): void;
  setPlan(p: Plan): void;
  finance(a: FinanceAction): void;
  activity(id: string, people: string[]): void;
  dismissActivity(): void;
  askEndYear(open: boolean): void;
  endYear(): void;
  choose(uid: string, choiceId: string, text?: string): void;
  dismissOutcome(): void;
  nextYear(): void;
  chooseHeir(id: string | null): void;
  toggleDev(): void;
  dev(kind: 'skip10' | 'kill'): void;
  updateSettings(patch: Partial<Settings>): void;
  updateEpitaph(familyId: string, memberId: string, text: string): void;
  dismissToast(): void;
  exportSave(): void;
  exportFullBackup(): void;
  importSave(state: GameState): Promise<void>;
  importFullBackup(opts: FullImport): Promise<MergeSummary>;
  restorePrevious(): Promise<void>;
}

export const useGame = create<Store>((set, get) => {
  const setProfile = (profile: Profile) => {
    set({ profile });
    void saveProfile(profile);
  };

  /** Apply a new state, persist it, and update the profile (stats/achievements). */
  const commit = (next: GameState, rotate?: boolean) => {
    const prev = get().game;
    if (next === prev) return;
    set({ game: next, saved: next });
    void saveGame(next, rotate ?? (next.phase === 'RECAP' && prev?.phase !== 'RECAP'));
    const res = track(get().profile, prev, next);
    if (res.changed) setProfile(res.profile);
    if (res.unlocked.length) set({ toasts: [...get().toasts, ...res.unlocked] });
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
    profile: newProfile(),
    toasts: [],
    recovered: false,
    persisted: false,
    ready: false,
    tab: 'home',
    panel: null,
    confirmEnd: false,
    showDev: false,
    async init() {
      await requestPersistence();
      try {
        set({ profile: await loadProfile() });
      } catch (e) {
        console.error('Could not load profile', e);
      }
      // Never leave the title screen stuck: a failed load just means no "Continue".
      await refresh();
    },
    startNew(start = "adult", names) {
      const g = newGame((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0, start, names);
      set({ tab: 'home', panel: null, game: null });
      setProfile(trackNewFamily(get().profile));
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
    finance: (a) => withGame((g) => financeAction(g, a)),
    activity: (id, people) => withGame((g) => performActivity(g, id, people)),
    dismissActivity: () => withGame(dismissActivity),
    askEndYear: (open) => set({ confirmEnd: open }),
    endYear() {
      set({ confirmEnd: false });
      withGame(resolveYear);
    },
    choose: (uid, choiceId, text) => withGame((g) => choose(g, uid, choiceId, text)),
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
    updateEpitaph(familyId, memberId, text) {
      const p = get().profile;
      const clean = text.replace(/\s+/g, ' ').trim().slice(0, EPITAPH_MAX);
      if (!clean) return;
      setProfile({
        ...p,
        archive: p.archive.map((f) => (f.id !== familyId ? f : {
          ...f,
          members: f.members.map((m) => (m.id === memberId ? { ...m, epitaph: clean } : m)),
        })),
      });
    },
    updateSettings(patch) {
      const p = get().profile;
      setProfile({ ...p, settings: { ...p.settings, ...patch } });
    },
    dismissToast: () => set({ toasts: get().toasts.slice(1) }),
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
    exportFullBackup() {
      const g = get().game ?? get().saved;
      const marked = g ? { ...g, lastBackupYear: g.year } : undefined;
      downloadJson(serializeFullBackup(get().profile, { current: marked, previous: get().previous ?? undefined }), fullBackupFileName());
      if (marked) {
        if (get().game) commit(marked, false);
        else {
          set({ saved: marked });
          void saveGame(marked, false);
        }
      }
    },
    async importSave(state) {
      // The replaced game becomes "previous", so an import can be undone.
      await saveGame(state, true);
      set({ game: null, panel: null });
      await refresh();
      set({ game: get().saved, tab: 'home' });
    },
    async importFullBackup(opts) {
      const { profile, summary } = mergeProfiles(get().profile, opts.profile, { useIncomingSettings: opts.useIncomingSettings });
      setProfile(profile);
      if (opts.loadGame && opts.current) {
        await saveGame(opts.current, true);
        set({ game: null });
        await refresh();
      }
      return summary;
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
