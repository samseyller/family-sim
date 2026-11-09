import { LIFESTYLES, type Lifestyle } from '../../content/economy';
import { estimateYear } from '../../engine/budget';
import type { GameState } from '../../engine/types';
import { money } from '../../engine/util';
import { useGame } from '../../store/gameStore';
import { Section, Segmented } from '../components';

/** How the household lives this year: savings vs. everyone's mood. */
export function LifestylePicker({ g }: { g: GameState }) {
  const setPlan = useGame((s) => s.setPlan);
  const value = g.plan.lifestyle ?? 'comfortable';
  const est = estimateYear(g);
  const spend = est.expenses.find((l) => l.label === 'Lifestyle')?.amount ?? 0;
  const ls = LIFESTYLES[value];
  return (
    <Section title="💳 Lifestyle">
      <Segmented<Lifestyle>
        label="Household lifestyle"
        value={value}
        onChange={(v) => setPlan({ ...g.plan, lifestyle: v })}
        options={(Object.keys(LIFESTYLES) as Lifestyle[]).map((k) => ({ value: k, label: `${LIFESTYLES[k].icon} ${LIFESTYLES[k].label}` }))}
      />
      <p className="hint">
        {ls.desc}. {spend > 0 ? `About ${money(spend)} this year` : 'Nothing is left over for extras this year'}
        {ls.happiness ? ` · everyone at home ${ls.happiness > 0 ? '+' : ''}${ls.happiness} happiness` : ''}.
      </p>
    </Section>
  );
}
