import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState } from '../../engine/types';
import { ageOf, alive, getBond } from '../../engine/util';
import { jobTitle } from '../../content/careers';
import { AvatarFace, specOf } from '../Avatar';
import { layoutTree, NODE_H, NODE_W } from './layout';

/** Scrollable family tree. Played characters are ringed; tap anyone for details. */
export function FamilyTree({ g }: { g: GameState }) {
  const layout = useMemo(() => layoutTree(g), [g]);
  const lineage = useMemo(() => new Set(g.lineage), [g.lineage]);
  const [selected, setSelected] = useState<string>(g.activeId);
  const scroller = useRef<HTMLDivElement>(null);

  // Start scrolled to the active character.
  useEffect(() => {
    const node = layout.nodes.find((n) => n.id === g.activeId);
    const el = scroller.current;
    if (!node || !el) return;
    el.scrollLeft = node.x + NODE_W / 2 - el.clientWidth / 2;
    el.scrollTop = node.y - 20;
  }, [layout, g.activeId]);

  const sel = g.people[selected];
  const bond = sel && sel.id !== g.activeId ? getBond(g, g.activeId, sel.id) : undefined;

  return (
    <div className="tree-wrap">
      <div className="tree-scroll" ref={scroller} role="group" aria-label="Family tree">
        <div className="tree-canvas" style={{ width: layout.width + 16, height: layout.height + 16 }}>
          <svg className="tree-lines" width={layout.width + 16} height={layout.height + 16} aria-hidden>
            <g transform="translate(8 8)">
              {layout.links.map((l, i) => <path key={i} d={l.d} className={l.kind} />)}
            </g>
          </svg>
          {layout.nodes.map((n) => {
            const p = g.people[n.id];
            const cls = ['tree-node', lineage.has(p.id) ? 'lineage' : '', p.id === g.activeId ? 'active' : '', p.id === selected ? 'selected' : '', alive(p) ? '' : 'dead'].join(' ');
            return (
              <button
                key={n.id}
                className={cls}
                style={{ left: n.x + 8, top: n.y + 8, width: NODE_W, height: NODE_H }}
                onClick={() => setSelected(p.id)}
                aria-pressed={p.id === selected}
                aria-label={`${p.firstName} ${p.lastName}${alive(p) ? `, age ${ageOf(p, g.year)}` : `, ${p.birthYear} to ${p.deathYear}`}${lineage.has(p.id) ? ', played' : ''}`}
              >
                <AvatarFace spec={specOf(p, g.year)} size={56} />
                <span className="tree-name">{p.firstName}</span>
                <span className="tree-years">{p.birthYear}–{p.deathYear ?? ''}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="tree-legend hint">
        <span><span className="ring lineage" /> played</span>
        <span><span className="ring active" /> you</span>
        <span>Scroll or drag to explore</span>
      </div>
      {sel && (
        <div className="tree-detail card" aria-live="polite">
          <AvatarFace spec={specOf(sel, g.year)} size={56} />
          <div>
            <strong>{sel.firstName} {sel.lastName}</strong>
            <div className="hint">
              {alive(sel) ? `Age ${ageOf(sel, g.year)}` : `${sel.birthYear}–${sel.deathYear} · ${sel.deathCause ?? ''}`}
              {ageOf(sel, g.year) >= 18 ? ` · ${jobTitle(sel)}` : ''}
              {` · generation ${sel.generation}`}
            </div>
            {bond && alive(sel) && <div className="hint">Affinity {bond.affinity} · Trust {bond.trust}</div>}
            {lineage.has(sel.id) && <div className="hint">You played as {sel.firstName}.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
