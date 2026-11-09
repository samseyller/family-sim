/** Dev-only gallery: a family's genomes rendered across ages. Open /dev/avatars.html */
import { createRoot } from 'react-dom/client';
import { AvatarFace, type AvatarSpec } from '../src/ui/Avatar';
import { inheritLooks, randomLooks } from '../src/engine/genome';
import { makeRng } from '../src/engine/rng';
import '../src/styles.css';

const rng = makeRng(Number(new URLSearchParams(location.search).get('seed') ?? 7));
const mom = randomLooks(rng);
const dad = randomLooks(rng);
dad.facialHair = 2;
mom.glasses = 1;
const kids = [inheritLooks(rng, mom, dad), inheritLooks(rng, mom, dad), inheritLooks(rng, mom, dad)];
const people: { name: string; sex: 'F' | 'M'; looks: typeof mom }[] = [
  { name: 'Mom', sex: 'F', looks: mom },
  { name: 'Dad', sex: 'M', looks: dad },
  ...kids.map((looks, i) => ({ name: `Kid ${i + 1}`, sex: (i % 2 ? 'M' : 'F') as 'F' | 'M', looks })),
];
const AGES = [1, 7, 16, 30, 50, 68, 85];

function App() {
  return (
    <main style={{ padding: 16 }}>
      <h1>Avatar gallery</h1>
      <table>
        <thead>
          <tr><th />{AGES.map((a) => <th key={a}>{a}</th>)}</tr>
        </thead>
        <tbody>
          {people.map((p, i) => (
            <tr key={p.name}>
              <th style={{ textAlign: 'left', paddingRight: 8 }}>{p.name}</th>
              {AGES.map((age) => {
                const spec: AvatarSpec = { id: `p${i}`, name: p.name, sex: p.sex, looks: p.looks, age, happiness: 40 + i * 10, stress: i === 1 ? 80 : 30, dead: false };
                return <td key={age}><AvatarFace spec={spec} size={Number(new URLSearchParams(location.search).get("size") ?? 72)} /></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
