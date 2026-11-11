import { CAREER_BY_ID, titleOf } from '../../content/careers';
import { PRO_SKILL, SCHOLARSHIP_SKILL, SPORTS, SPORT_IDS } from '../../content/sports';
import { hasGear, isPro, sportBlocker, sportBoost, sportSkill, sportsBlocker, type SportsAction } from '../../engine/sports';
import type { GameState } from '../../engine/types';
import { active, ageOf, money } from '../../engine/util';
import { useGame } from '../../store/gameStore';

function Btn({ g, action, label, hint }: { g: GameState; action: SportsAction; label: string; hint?: string }) {
  const sports = useGame((s) => s.sports);
  const blocker = sportsBlocker(g, action);
  return (
    <button className="choice money-act" disabled={!!blocker} title={blocker ?? undefined} onClick={() => sports(action)}>
      <span>{label}</span>
      <span className="hint">{blocker ?? hint}</span>
    </button>
  );
}

/** The ten sports to choose from (skill per sport is kept). */
export function SportPicker({ g }: { g: GameState }) {
  const me = active(g);
  const sports = useGame((s) => s.sports);
  return (
    <div className="job-list">
      {SPORT_IDS.map((id) => {
        const sp = SPORTS[id];
        const blocker = sportBlocker(g, id);
        const skill = sportSkill(me, id);
        return (
          <button key={id} className={me.sport === id && me.hobby === 'sports' ? 'job on' : 'job'} disabled={!!blocker} title={blocker ?? undefined}
            onClick={() => sports({ kind: 'take', sport: id })}>
            <span>{sp.icon} {sp.label}{skill ? ` (skill ${skill})` : ''}</span>
            <span className="hint">{blocker ?? `${sp.team ? 'Team sport' : 'Solo sport'}${sp.cost ? ` · ${money(sp.cost)}/block` : ''}${sp.injury >= 0.07 ? ' · rough on the body' : ''}`}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Your sport: skill, setup, purchases, and where it can lead. */
export function SportsPanel({ g }: { g: GameState }) {
  const me = active(g);
  if (me.hobby !== 'sports' || !me.sport) return null;
  const sp = SPORTS[me.sport];
  const skill = me.skills.sports ?? 0;
  const age = ageOf(me, g.year);
  const boost = sportBoost(g, me);
  const status: string[] = [];
  if (isPro(me)) status.push(`${titleOf(CAREER_BY_ID[me.jobId!], me.jobLevel)} · pros usually retire around ${sp.retireAge}`);
  else if (me.flags.athletic_scholarship && me.studyingUntil) status.push('College athlete on scholarship');
  else if (me.flags.varsity && age < 18) status.push('Varsity');
  else if (me.flags.travel_team && age < 18) status.push('Travel team');
  if (me.flags.former_pro) status.push('Former pro: pro coaching jobs are open to you');
  const next = age < 18 ? (skill < SCHOLARSHIP_SKILL ? `Skill ${SCHOLARSHIP_SKILL} by 18 could earn an athletic scholarship` : `Skill ${PRO_SKILL} could get you drafted`)
    : age <= 24 && !isPro(me) && !me.flags.went_pro ? `Skill ${PRO_SKILL} by 24 could get you drafted` : '';
  return (
    <div className="sub-group">
      <div className="sub-head">{sp.icon} {sp.label} · skill {skill}{boost > 1 ? ` · training ${boost}× faster` : ''}</div>
      {status.map((t) => <p key={t} className="hint">🏅 {t}</p>)}
      {next && <p className="hint">{next}.</p>}
      <div className="choices">
        {!hasGear(me, me.sport) && <Btn g={g} action={{ kind: 'gear' }} label={`🛍️ ${sp.gear.label} (${money(sp.gear.price)})`} hint="Practice 20% faster" />}
        {sp.club && (me.club === me.sport
          ? <Btn g={g} action={{ kind: 'club', join: false }} label={`Leave the ${sp.club.label.toLowerCase()}`} hint={`Saves ${money(sp.club.fee)}/yr`} />
          : <Btn g={g} action={{ kind: 'club', join: true }} label={`Join the ${sp.club.label.toLowerCase()} (${money(sp.club.fee)}/yr)`} hint="Practice 40% faster; meet people" />)}
      </div>
      {sp.home && <p className="hint">A home {sp.home === 'pool' ? 'pool' : sp.home.replace('_', ' ')} (Money → Home upgrades) makes practice 30% faster.</p>}
      <p className="hint">More in Activities → Sports: leagues, {sp.team ? 'pickup games' : `${sp.event}s`}, private coaching, and coaching your kids.</p>
    </div>
  );
}
