import { useEffect } from 'react';
import { ACHIEVEMENTS } from '../../content/achievements';
import { money } from '../../engine/util';
import type { Settings } from '../../profile/types';
import { useGame } from '../../store/gameStore';
import { Modal, Section, Segmented } from '../components';

export function SettingsPanel() {
  const { profile, updateSettings, setPanel } = useGame();
  const s = profile.settings;
  const set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => updateSettings({ [k]: v } as Partial<Settings>);
  return (
    <Modal label="Settings" onClose={() => setPanel(null)}>
      <h2>⚙️ Settings</h2>
      <div className="label">Theme</div>
      <Segmented label="Theme" value={s.theme} onChange={set('theme')}
        options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
      <div className="label">Text size</div>
      <Segmented label="Text size" value={s.textSize} onChange={set('textSize')}
        options={[{ value: 'normal', label: 'Normal' }, { value: 'large', label: 'Large' }]} />
      <div className="label">Motion</div>
      <Segmented label="Motion" value={s.motion} onChange={set('motion')}
        options={[{ value: 'system', label: 'System' }, { value: 'reduced', label: 'Reduced' }, { value: 'full', label: 'Full' }]} />
      <div className="label">Backup reminders</div>
      <Segmented label="Backup reminder interval" value={s.backupReminderYears} onChange={set('backupReminderYears')}
        options={[{ value: 5, label: 'Every 5 yrs' }, { value: 10, label: '10 yrs' }, { value: 20, label: '20 yrs' }, { value: 0, label: 'Off' }]} />
      <div className="toggles">
        <label className="toggle">
          <input type="checkbox" checked={s.showKeyHints} onChange={(e) => updateSettings({ showKeyHints: e.target.checked })} />
          Show keyboard shortcut hints
        </label>
      </div>
      <p className="hint">Settings are part of your profile and are included in full backups.</p>
      <button className="big close-btn" onClick={() => setPanel(null)}>Close</button>
    </Modal>
  );
}

const STAT_LABELS: [keyof ReturnType<typeof useGame.getState>['profile']['stats'], string, (n: number) => string][] = [
  ['yearsPlayed', 'Years lived', String],
  ['familiesStarted', 'Families started', String],
  ['familiesEnded', 'Stories completed', String],
  ['successions', 'Torches passed', String],
  ['birthsInFamily', 'Births in your families', String],
  ['mostGenerations', 'Most generations', String],
  ['longestLife', 'Longest life', (n) => (n ? `${n} years` : '—')],
  ['richestHousehold', 'Richest household', money],
];

export function AchievementsPanel() {
  const { profile, setPanel } = useGame();
  const unlocked = profile.achievements;
  const count = Object.keys(unlocked).length;
  return (
    <Modal label="Achievements and stats" onClose={() => setPanel(null)}>
      <h2>🏅 Achievements & stats</h2>
      <Section title={`Achievements (${count}/${ACHIEVEMENTS.length})`}>
        <ul className="ach-list">
          {ACHIEVEMENTS.map((a) => {
            const u = unlocked[a.id];
            const secret = a.hidden && !u;
            return (
              <li key={a.id} className={u ? 'on' : ''}>
                <span className="ach-icon" aria-hidden>{secret ? '❔' : a.icon}</span>
                <div>
                  <strong>{secret ? 'Hidden achievement' : a.title}</strong>
                  <div className="hint">{secret ? 'Keep living to discover it.' : a.desc}</div>
                  {u && <div className="hint">Earned in {u.year} with the {u.family} family</div>}
                </div>
                <span className="sr-only">{u ? 'Unlocked' : 'Locked'}</span>
              </li>
            );
          })}
        </ul>
      </Section>
      <Section title="Lifetime stats">
        <table className="fin-table">
          <tbody>
            {STAT_LABELS.map(([k, label, fmt]) => (
              <tr key={k}><td>{label}</td><td className="num">{fmt(profile.stats[k])}</td></tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title={`Family archive (${profile.archive.length})`}>
        {profile.archive.length === 0 && <p className="muted">Finished families will be remembered here.</p>}
        <ul className="journal-list">
          {[...profile.archive].reverse().map((f) => (
            <li key={f.id}>
              <strong>The {f.familyName} family</strong>
              <div className="hint">{f.startYear}–{f.endYear} · {f.generations} generation{f.generations === 1 ? '' : 's'} · legacy {f.legacy}</div>
              <div className="hint">{f.members.map((m) => m.name).join(' → ')}</div>
            </li>
          ))}
        </ul>
      </Section>
      <button className="big close-btn" onClick={() => setPanel(null)}>Close</button>
    </Modal>
  );
}

/** Non-blocking achievement popups. */
export function Toasts() {
  const { toasts, dismissToast } = useGame();
  const t = toasts[0];
  useEffect(() => {
    if (!t) return;
    const id = setTimeout(dismissToast, 4000);
    return () => clearTimeout(id);
  }, [t, dismissToast]);
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {t && (
        <button className="toast" onClick={dismissToast} key={t.id}>
          <span className="ach-icon" aria-hidden>{t.icon}</span>
          <span>
            <span className="hint">Achievement unlocked</span>
            <strong>{t.title}</strong>
          </span>
        </button>
      )}
    </div>
  );
}

/** Applies profile settings to the document root. */
export function useApplySettings() {
  const s = useGame((st) => st.profile.settings);
  useEffect(() => {
    const root = document.documentElement;
    if (s.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', s.theme);
    root.setAttribute('data-motion', s.motion);
    root.setAttribute('data-text', s.textSize);
    root.setAttribute('data-keyhints', s.showKeyHints ? 'on' : 'off');
  }, [s]);
}
