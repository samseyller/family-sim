/** Dev gallery: every breed × coat at puppy, adult and senior. Open /dev/dogs.html */
import { createRoot } from 'react-dom/client';
import { BREEDS, type DogBreed } from '../src/content/dogs';
import { DogFace } from '../src/ui/DogAvatar';

const stages = ['puppy', 'adult', 'senior'] as const;
function Gallery() {
  return (
    <div style={{ fontFamily: 'system-ui', padding: 16, background: '#f6f1ea' }}>
      {(Object.keys(BREEDS) as DogBreed[]).map((b) => (
        <div key={b} style={{ marginBottom: 12 }}>
          <h3 style={{ margin: '4px 0' }}>{BREEDS[b].label}</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            {BREEDS[b].coats.map((c, ci) => (
              <div key={ci} className="coat" style={{ display: 'flex', gap: 2, background: '#fff', borderRadius: 12, padding: 6 }}>
                {stages.map((st) => (
                  <figure key={st} style={{ margin: 0, textAlign: 'center', fontSize: 11 }}>
                    <DogFace look={{ breed: b, coat: ci, stage: st, bond: st === 'adult' ? 70 : 50, seed: `${b}${ci}` }} size={Number(new URLSearchParams(location.search).get('size') ?? 96)} />
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
