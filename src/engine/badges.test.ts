/** Family tree badges (docs/plans/next-stories.md §3): only from recorded facts, most significant first. */
import { describe, expect, it } from 'vitest';
import { newGame } from './generate';
import { TREE_BADGES_SHOWN, treeBadges } from './narrative';
import type { Thread } from './types';
import { active, kidsAtHome, partnerOf } from './util';

describe('tree badges', () => {
  it('none without a recorded fact', () => {
    const s = newGame(64001);
    expect(treeBadges(s, active(s).id)).toEqual([]);
  });

  it('each badge comes from its fact, and they are ordered by significance', () => {
    const s = newGame(64002);
    const me = active(s);
    const kid = kidsAtHome(s, me)[0];
    const friend = partnerOf(s, me.id)!;
    const add = (t: Thread) => (s.threads ??= []).push(t);
    add({ kind: 'pattern', ownerId: me.id, subjectId: friend.id, detail: `friend:${friend.id}`, since: s.year - 31, hits: [s.year - 31, s.year], closed: s.year, outcome: 'recognized' });
    expect(treeBadges(s, me.id).map((b) => b.icon)).toEqual(['🤝']);
    add({ kind: 'tradition', ownerId: me.id, detail: 'game_night', since: s.year - 11, hits: [s.year], count: 12 });
    add({ kind: 'aspiration', ownerId: me.id, detail: 'mastery', since: s.year - 9, hits: [s.year - 1], closed: s.year, outcome: 'milestone' });
    const badges = treeBadges(s, me.id);
    expect(badges.map((b) => b.icon)).toEqual(['⭐', '🏷️', '🤝']);
    expect(badges[1].label).toBe('Kept game night (12 years)');
    expect(badges.slice(0, TREE_BADGES_SHOWN).map((b) => b.icon)).toEqual(['⭐', '🏷️']);
    // Followed a path: shown on the one who followed.
    add({ kind: 'pattern', ownerId: me.id, subjectId: kid.id, detail: `following:${kid.id}`, since: s.year, hits: [s.year], closed: s.year, outcome: 'recognized' });
    expect(treeBadges(s, kid.id)[0].label).toMatch(new RegExp(`^Followed ${me.firstName}’s path`));
  });
});
