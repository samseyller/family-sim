/**
 * Dev-only hair coverage check. Renders every face × hairstyle × sex × age with the
 * scalp painted magenta, then window.__hairCheck() rasterizes each portrait and
 * reports any magenta showing on the crown (where hair should be).
 */
import { createRoot } from 'react-dom/client';
import { AvatarFace, headGeometry, type AvatarSpec } from '../src/ui/Avatar';
import type { Looks } from '../src/engine/types';

const SENTINEL = '#ff00ff';
const SIZE = 200;
const AGES = [5, 8, 16, 30, 45, 60, 70, 85];

const specs: AvatarSpec[] = [];
for (const face of [0, 1, 2])
  for (const hairStyle of [0, 1, 2, 3])
    for (const sex of ['F', 'M'] as const)
      for (const age of AGES) {
        const looks: Looks = { skin: 2, hairColor: 0, hairStyle, eyes: 0, face, nose: 0, facialHair: 0, glasses: 0, freckles: 0 };
        const spec: AvatarSpec = { id: `f${face}h${hairStyle}${sex}${age}`, name: 'x', sex, looks, age, happiness: 50, stress: 20, dead: false, debugSkin: SENTINEL };
        if (headGeometry(spec).coveredCrown) specs.push(spec);
      }

declare global {
  interface Window {
    __hairCheck: () => Promise<{ id: string; pixels: number }[]>;
  }
}

/** Is viewBox point (x, y) on the crown: inside the head, above the forehead band? */
function onCrown(spec: AvatarSpec, x: number, y: number) {
  const g = headGeometry(spec);
  if (y > g.cy - 0.6 * g.ry) return false;
  if (spec.looks.face === 2) {
    // Rounded rect, inset 1 unit so anti-aliased edges don't count.
    const k = g.r * 0.55;
    const left = g.cx - g.r + 1, right = g.cx + g.r - 1, top = g.cy - g.r + 1;
    if (x < left || x > right || y < top) return false;
    const ccx = x < left + k ? left + k : x > right - k ? right - k : x;
    const ccy = y < top + k ? top + k : y;
    return (x - ccx) ** 2 + (y - ccy) ** 2 <= (k - 0.5) ** 2 || (ccx === x || ccy === y);
  }
  return ((x - g.cx) / (g.rx - 1)) ** 2 + ((y - g.cy) / (g.ry - 1)) ** 2 <= 1;
}

window.__hairCheck = async () => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const failures: { id: string; pixels: number }[] = [];
  const svgs = [...document.querySelectorAll<SVGSVGElement>('svg[data-spec]')];
  for (const svg of svgs) {
    const spec = specs[Number(svg.dataset.spec)];
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
    await img.decode();
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
    let pixels = 0;
    for (let py = 0; py < SIZE; py++)
      for (let px = 0; px < SIZE; px++) {
        const i = (py * SIZE + px) * 4;
        const magenta = data[i] > 200 && data[i + 1] < 90 && data[i + 2] > 200;
        if (magenta && onCrown(spec, (px + 0.5) / 2, (py + 0.5) / 2)) pixels++;
      }
    if (pixels > 0) failures.push({ id: spec.id, pixels });
  }
  return failures;
};

function App() {
  return (
    <main style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 8 }}>
      {specs.map((s, i) => (
        <div key={s.id} ref={(el) => el?.querySelector('svg')?.setAttribute('data-spec', String(i))} title={s.id}>
          <AvatarFace spec={s} size={64} />
        </div>
      ))}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
