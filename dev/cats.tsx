/** Dev gallery: every cat breed × coat at kitten, adult (content) and senior. Open /dev/cats.html */
import { createRoot } from 'react-dom/client';
import { CAT_BREEDS, type CatBreed } from '../src/content/cats';
import { CatFace } from '../src/ui/CatAvatar';

const stages = ['kitten', 'adult', 'senior'] as const;
function Gallery() {
  const size = Number(new URLSearchParams(location.search).get('size') ?? 96);
  return (
    <div style={{ fontFamily: 'system-ui', padding: 16, background: '#f6f1ea' }}>
      {(Object.keys(CAT_BREEDS) as CatBreed[]).map((b) => (
        <div key={b} style={{ marginBottom: 12 }}>
          <h3 style={{ margin: '4px 0' }}>{CAT_BREEDS[b].label}</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            {CAT_BREEDS[b].coats.map((c, ci) => (
              <div key={ci} style={{ display: 'flex', gap: 2, background: '#fff', borderRadius: 12, padding: 6 }}>
                {stages.map((st) => (
                  <figure key={st} style={{ margin: 0, textAlign: 'center', fontSize: 11 }}>
                    <CatFace look={{ breed: b, coat: ci, stage: st, bond: st === 'adult' ? 70 : 45, seed: `${b}${ci}x` }} size={size} />
                    <figcaption>{c.name} · {st}</figcaption>
                  </figure>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Gallery />);
