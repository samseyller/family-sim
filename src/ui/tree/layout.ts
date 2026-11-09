/**
 * Family tree layout (pure). Rooted at the founder's oldest known ancestor and
 * expanded down through descendants. Each "unit" is a person plus their
 * partners side by side; children hang below the unit, centered.
 */
import type { GameState, Person } from '../../engine/types';
import { childrenOf } from '../../engine/util';

export const NODE_W = 92;
export const NODE_H = 104;
export const GAP_X = 14;
export const GAP_Y = 64;

export interface TreeNode {
  id: string;
  x: number; // left
  y: number; // top
  depth: number;
}

export interface TreeLink {
  /** Path in tree coordinates (SVG d attribute). */
  d: string;
  kind: 'couple' | 'child';
}

export interface TreeLayout {
  nodes: TreeNode[];
  links: TreeLink[];
  width: number;
  height: number;
}

function partnersOf(s: GameState, id: string): Person[] {
  return s.partnerships
    .filter((p) => (p.a === id || p.b === id) && p.status !== 'ended')
    .sort((a, b) => a.startYear - b.startYear)
    .map((p) => s.people[p.a === id ? p.b : p.a])
    .filter(Boolean);
}

const parentIds = (p: Person) => [...p.biologicalParents, ...p.adoptiveParents];

/** Oldest known ancestor along first-parent links. */
export function treeRoot(s: GameState): Person {
  let p = s.people[s.lineage[0]];
  const seen = new Set<string>();
  while (p && !seen.has(p.id)) {
    seen.add(p.id);
    const up = parentIds(p).map((id) => s.people[id]).filter(Boolean)[0];
    if (!up) break;
    p = up;
  }
  return p;
}

interface Unit {
  members: Person[];
  children: Unit[];
  width: number;
}

export function layoutTree(s: GameState): TreeLayout {
  const placed = new Set<string>();

  const build = (person: Person): Unit => {
    placed.add(person.id);
    const members = [person];
    for (const partner of partnersOf(s, person.id)) {
      if (!placed.has(partner.id)) {
        placed.add(partner.id);
        members.push(partner);
      }
    }
    const kidIds = new Set<string>();
    for (const m of members) for (const c of childrenOf(s, m.id)) kidIds.add(c.id);
    const kids = [...kidIds]
      .map((id) => s.people[id])
      .filter((k) => !placed.has(k.id))
      .sort((a, b) => a.birthYear - b.birthYear);
    const children: Unit[] = [];
    for (const k of kids) if (!placed.has(k.id)) children.push(build(k));
    const own = members.length * NODE_W + (members.length - 1) * GAP_X;
    const below = children.reduce((sum, c) => sum + c.width, 0) + Math.max(0, children.length - 1) * GAP_X * 2;
    return { members, children, width: Math.max(own, below) };
  };

  const root = build(treeRoot(s));
  const nodes: TreeNode[] = [];
  const links: TreeLink[] = [];
  let maxDepth = 0;

  const place = (u: Unit, left: number, depth: number) => {
    maxDepth = Math.max(maxDepth, depth);
    const y = depth * (NODE_H + GAP_Y);
    const own = u.members.length * NODE_W + (u.members.length - 1) * GAP_X;
    const startX = left + (u.width - own) / 2;
    u.members.forEach((m, i) => nodes.push({ id: m.id, x: startX + i * (NODE_W + GAP_X), y, depth }));
    // Couple connectors between adjacent partners, at avatar height.
    for (let i = 1; i < u.members.length; i++) {
      const x1 = startX + i * (NODE_W + GAP_X) - GAP_X;
      links.push({ d: `M${x1} ${y + 30} H${x1 + GAP_X}`, kind: 'couple' });
    }
    if (!u.children.length) return;
    const below = u.children.reduce((sum, c) => sum + c.width, 0) + (u.children.length - 1) * GAP_X * 2;
    let cx = left + (u.width - below) / 2;
    const fromX = u.members.length > 1 ? startX + NODE_W + GAP_X / 2 : startX + NODE_W / 2;
    const busY = y + NODE_H + GAP_Y / 2;
    for (const child of u.children) {
      place(child, cx, depth + 1);
      const childOwn = child.members.length * NODE_W + (child.members.length - 1) * GAP_X;
      const childX = cx + (child.width - childOwn) / 2 + NODE_W / 2;
      links.push({ d: `M${fromX} ${y + NODE_H - 8} V${busY} H${childX} V${busY + GAP_Y / 2 - 4}`, kind: 'child' });
      cx += child.width + GAP_X * 2;
    }
  };

  place(root, 0, 0);
  return { nodes, links, width: root.width, height: (maxDepth + 1) * NODE_H + maxDepth * GAP_Y };
}
