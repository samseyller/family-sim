import { jobTitle } from '../../content/careers';
import { MAX_FRIENDS, friendLabel, friendshipsOf } from '../../engine/friends';
import { cityName, cityOf, isNear } from '../../engine/location';
import type { GameState } from '../../engine/types';
import { active, ageOf, getBond } from '../../engine/util';
import { Avatar } from '../Avatar';
import { Section } from '../components';

/** Your friends: who they are, where they live, and how close you still are. */
export function FriendsCard({ g }: { g: GameState }) {
  const me = active(g);
  const list = friendshipsOf(g, me)
    .map((fs) => ({ fs, p: g.people[fs.id], b: getBond(g, me.id, fs.id) }))
    .sort((a, b) => b.b.affinity - a.b.affinity);

  return (
    <Section title="👋 Friends" aside={<span className="hint">{list.length}/{MAX_FRIENDS}</span>}>
      {!list.length && <p className="muted">No friends yet. Join a club, go out, volunteer, or say yes when a coworker asks you to lunch.</p>}
      {list.map(({ fs, p, b }) => {
        const label = friendLabel(g, me, p);
        const near = isNear(g, p);
        const since = g.year - fs.lastSeen;
        return (
          <article key={p.id} className={`person${fs.distant ? ' distant' : ''}`}>
            <Avatar person={p} year={g.year} size={56} />
            <div className="person-body">
              <div className="row">
                <strong>{p.firstName} {p.lastName}</strong>
                <span className={`chip${label === 'Best friend' ? ' best' : label === 'Drifted apart' ? ' subtle' : ''}`}>{label === 'Best friend' ? '⭐ ' : ''}{label}</span>
              </div>
              <div className="hint">
                Age {ageOf(p, g.year)}{ageOf(p, g.year) >= 18 ? ` · ${jobTitle(p)}` : ''} · {near ? `📍 ${cityName(cityOf(g, p))}` : `✈️ lives in ${cityName(cityOf(g, p))}`}
              </div>
              <div className="hint">
                Friends since {fs.since}{fs.how ? ` (${fs.how})` : ''} · {since === 0 ? 'saw them this year' : since === 1 ? 'last saw them a year ago' : `last saw them ${since} years ago`}
              </div>
              <div className="bond">
                <span className="hint">Friendship</span>
                <div className="bar center-bar" role="meter" aria-label="Friendship" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={b.affinity}>
                  <div className={`fill ${b.affinity > 0 ? 'good' : 'bad'}`} style={{ left: b.affinity >= 0 ? '50%' : `${(b.affinity + 100) / 2}%`, width: `${Math.abs(b.affinity) / 2}%` }} />
                </div>
                <span className="hint">{b.affinity}</span>
              </div>
              {fs.distant && <div className="hint">They may not answer. Reach out anyway: a call or coffee could bring you back together.</div>}
            </div>
          </article>
        );
      })}
      {list.length > 0 && (
        <p className="hint">
          Friendships fade a little every year you don’t spend time together. Activities → Social: coffee, game day, hikes and parties
          need you in the same city; calls and online games work anywhere; or plan a trip.
        </p>
      )}
    </Section>
  );
}
