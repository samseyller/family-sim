import { create } from 'zustand';
import type { GameState, Plan } from '../engine/types';
import { newGame, type StartKind, type StartNames } from '../engine/generate';
import { markSeen, skipTutorial } from '../engine/tutorial';
import { financeAction, type FinanceAction } from '../engine/finance';
import { dismissActivity, performActivity } from '../engine/activities';
import { householdAction, type HouseholdAction } from '../engine/household';
import { dogAction, type DogAction } from '../engine/dogs';
import { takeUpHobby } from '../engine/hobbies';
import { enlistNow } from '../engine/military';
import { sportsAction, type SportsAction } from '../engine/sports';
import { relationAction, type RelationAction } from '../engine/relations';
import type { Hobby } from '../engine/types';
import {
  choose, chooseHeir, devKill, devSkip, dismissOutcome, nextYear, resolveYear, updatePlan,
} from '../engine/phases';
import {
  describeSaveError, flushSaves, isPersisted, loadProfile, loadSaves, requestPersistence, saveGame, saveProfile, writeSaves,
} from '../persistence/db';
import { downloadJson, downloadSave, fullBackupFileName, serializeFullBackup } from '../persistence/exportImport';
import type { AchievementDef } from '../content/achievements';
import { track, trackNewFamily } from '../profile/tracker';
import { mergeProfiles, type MergeSummary } from '../profile/merge';
import { EPITAPH_MAX, newProfile, type Profile, type Settings } from '../profile/types';
import { DEV_TOOLS } from '../devtools';

export type Tab = 'home' | 'plan' | 'family' | 'journal' | 'money' | 'activities';
export type Panel = null | 'menu' | 'saves' | 'settings' | 'achievements';

export interface FullImport {
  profile: Profile;
  current?: GameState;
  previous?: GameState;
  useIncomingSettings: boolean;
  loadGame: boolean;
}

export interface FullImportResult extends MergeSummary {
  /** Which copy became the "previous autosave" after loading the backup's game. */
  previousFrom: 'backup' | 'your-game' | 'none';
}

interface Store {
  game: GameState | null;
  /** The game as last *successfully* written to storage (what Continue loads). */
  saved: GameState | null;
  /** The previous autosave as last successfully written (what Restore offers). */
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
  /** Set while the latest game write failed; cleared by the next successful write. */
  gameSaveError: string | null;
  /** Set while the latest profile write failed. */
  profileSaveError: string | null;
  init(): Promise<void>;
  refreshSaves(): Promise<void>;
  startNew(start?: StartKind, names?: StartNames): void;
  markTip(id: string): void;
  skipGuide(): void;
  continueGame(): void;
  toTitle(): void;
  setTab(t: Tab): void;
  setPanel(p: Panel): void;
  setPlan(p: Plan): void;
  finance(a: FinanceAction): void;
  household(a: HouseholdAction): void;
  dog(a: DogAction): void;
  takeHobby(h: Hobby): void;
  enlist(asOfficer: boolean): void;
  sports(a: SportsAction): void;
  relation(a: RelationAction): void;
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
  /** Write the current game and profile again; resolves true once both are durably saved. */
  retrySave(): Promise<boolean>;
  exportSave(): void;
  exportFullBackup(): void;
  /** Rejects (with a player-facing message) if the import could not be saved. */
  importSave(state: GameState): Promise<void>;
  importFullBackup(opts: FullImport): Promise<FullImportResult>;
  restorePrevious(): Promise<void>;
}

/** An error whose message is safe to show the player. */
const saveFailure = (e: unknown) => new Error(`Nothing was changed: ${describeSaveError(e)}`);

export const useGame = create<Store>((set, get) => {
  /**
   * A rotation ("current becomes previous") that was requested but hasn't been written yet.
   * It is decided inside the queued write, so a failed rotation is retried exactly once.
   */
  let rotateOwed = false;

  const persistProfile = (profile: Profile) =>
    saveProfile(profile).then(
      () => { set({ profileSaveError: null }); return true; },
      (e) => { set({ profileSaveError: describeSaveError(e) }); return false; },
    );

  const setProfile = (profile: Profile) => {
    set({ profile });
    void persistProfile(profile);
  };

  /** Write a game; on success record what is durably stored, on failure surface the error. */
  const persistGame = (state: GameState, rotate: boolean) => {
    if (rotate) rotateOwed = true;
    return saveGame(state, () => rotateOwed).then(
      (row) => {
        if (row.rotated) rotateOwed = false;
        set({ saved: row.current, previous: row.previous ?? null, gameSaveError: null });
        return true;
      },
      (e) => {
        set({ gameSaveError: describeSaveError(e) });
        return false;
      },
    );
  };

  /** Apply a new state, persist it, and update the profile (stats/achievements). */
  const commit = (next: GameState, rotate?: boolean) => {
    const prev = get().game;
    if (next === prev) return;
    set({ game: next });
    void persistGame(next, rotate ?? (next.phase === 'RECAP' && prev?.phase !== 'RECAP'));
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
    gameSaveError: null,
    profileSaveError: null,
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
    refreshSaves: refresh,
    startNew(start = 'adult', names) {
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
    household: (a) => withGame((g) => householdAction(g, a)),
    dog: (a) => withGame((g) => dogAction(g, a)),
    takeHobby: (h) => withGame((g) => takeUpHobby(g, h)),
    enlist: (asOfficer) => withGame((g) => enlistNow(g, asOfficer)),
    sports: (a) => withGame((g) => sportsAction(g, a)),
    relation: (a) => withGame((g) => relationAction(g, a)),
    activity: (id, people) => withGame((g) => performActivity(g, id, people)),
    dismissActivity: () => withGame(dismissActivity),
    markTip: (id) => withGame((g) => markSeen(g, id)),
    skipGuide: () => withGame(skipTutorial),
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
    // Developer tools exist only in builds made with VITE_ENABLE_DEV_TOOLS=true.
    toggleDev() {
      if (!DEV_TOOLS) return;
      set((s) => ({ showDev: !s.showDev }));
    },
    dev(kind) {
      if (!DEV_TOOLS) return;
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
    async retrySave() {
      const g = get().game;
      const results = await Promise.all([g ? persistGame(g, false) : true, persistProfile(get().profile)]);
      return results.every(Boolean) && (await flushSaves());
    },
    exportSave() {
      const g = get().game ?? get().saved;
      if (!g) return;
      const marked = { ...g, lastBackupYear: g.year };
      downloadSave(marked);
      if (get().game) commit(marked, false);
      else void persistGame(marked, false);
    },
    exportFullBackup() {
      const g = get().game ?? get().saved;
      const marked = g ? { ...g, lastBackupYear: g.year } : undefined;
      downloadJson(serializeFullBackup(get().profile, { current: marked, previous: get().previous ?? undefined }), fullBackupFileName());
      if (marked) {
        if (get().game) commit(marked, false);
        else void persistGame(marked, false);
      }
    },
    async importSave(state) {
      // The replaced game becomes "previous", so an import can be undone.
      let row;
      try {
        row = await saveGame(state, true);
      } catch (e) {
        throw saveFailure(e);
      }
      rotateOwed = false;
      set({ saved: row.current, previous: row.previous ?? null, gameSaveError: null, game: row.current, panel: null, tab: 'home' });
    },
    async importFullBackup(opts) {
      const { profile, summary } = mergeProfiles(get().profile, opts.profile, { useIncomingSettings: opts.useIncomingSettings });
      try {
        await saveProfile(profile);
      } catch (e) {
        throw saveFailure(e);
      }
      set({ profile, profileSaveError: null });
      let previousFrom: FullImportResult['previousFrom'] = 'none';
      if (opts.loadGame && opts.current) {
        // Read what is durably stored right now, not what the screen last showed.
        const local = (await loadSaves()).current;
        // Replacing a game keeps it as the undo copy; on an empty browser the backup's own
        // previous autosave is restored too.
        const previous = local ?? opts.previous;
        previousFrom = local ? 'your-game' : opts.previous ? 'backup' : 'none';
        let row;
        try {
          row = await writeSaves(opts.current, previous);
        } catch (e) {
          throw saveFailure(e);
        }
        rotateOwed = false;
        set({ saved: row.current, previous: row.previous ?? null, gameSaveError: null, game: null });
      }
      return { ...summary, previousFrom };
    },
    async restorePrevious() {
      // Always act on the durable copies, not on what the screen last showed.
      const { current, previous } = await loadSaves();
      if (!previous) {
        set({ previous: null });
        throw new Error('There is no previous autosave to restore.');
      }
      let row;
      try {
        // The game being replaced becomes the new "previous", so restoring can be undone too.
        row = await writeSaves(previous, current);
      } catch (e) {
        throw saveFailure(e);
      }
      rotateOwed = false;
      set({ saved: row.current, previous: row.previous ?? null, gameSaveError: null, game: null, panel: null });
    },
  };
});
