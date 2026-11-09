import type { GameState, JournalEntry } from '../../engine/types';
import { Section } from '../components';

const ICON: Record<JournalEntry['kind'], string> = { info: '•', major: '⭐', birth: '👶', death: '🕯️', good: '✅', bad: '⚠️' };

export function JournalTab({ g }: { g: GameState }) {
  const byYear = new Map<number, JournalEntry[]>();
  for (const j of g.journal) byYear.set(j.year, [...(byYear.get(j.year) ?? []), j]);
  const years = [...byYear.keys()].sort((a, b) => b - a);
  return (
    <div className="stack">
      {years.map((y) => (
        <Section key={y} title={String(y)}>
          <ul className="journal-list">
            {byYear.get(y)!.map((j, i) => (
              <li key={i} className={j.kind}><span aria-hidden>{ICON[j.kind]}</span> {j.text}</li>
            ))}
          </ul>
        </Section>
      ))}
    </div>
  );
}
