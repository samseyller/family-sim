# Family Tree (working title)

A turn-based family life simulator. Each turn is one year: split your limited time
between work, yourself, and your family, guide your children, face life events, and
when your character dies, continue as your spouse, child, or grandchild.

See [PLAN.md](PLAN.md) for the full design and roadmap. Done so far: **Stage 1** (family loop), **Stage 2** (reliable saves), **Stage 3** (profile & data format), **Stage 4** (dating & divorce, night school, a fuller household), **Stage 5** (aging avatars, family tree, memorials).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the game at http://localhost:5173 |
| `npm test` | Unit tests: engine (determinism, exactly-once saves, succession money), saves (schema, round-trips), profile (tracking, merge rules, backup format) |
| `npm run sim [runs]` | Headless balance sim comparing career / family / balanced play styles, incl. achievement unlock rates |
| `npm run e2e` | Playwright smoke test (keyboard on desktop, touch on mobile, reload mid-event) |
| `npm run build` | Typecheck and build for production |

## Controls

- Mouse / touch: everything is a button.
- Keyboard: arrow keys move focus, Enter/Space activate, Esc closes, `1`–`4` switch tabs, `E` ends the year (with confirmation).
- Controller: D-pad moves, A activates, B backs out, Start ends the year.
- `` ` `` (backtick) opens dev tools: skip 10 years, kill the main character.

## Layout

```
src/engine/      pure TypeScript game rules (no React) — phases.ts is the turn loop
src/content/     careers, actions, names (data)
src/persistence/ IndexedDB saves via Dexie (current + previous autosave)
src/store/       Zustand store wrapping the engine
src/ui/          React screens, SVG avatars, keyboard/gamepad navigation
scripts/sim.ts   headless balance simulation
e2e/             Playwright tests
```

## Saves

- The game autosaves to the browser (IndexedDB) after every plan change, decision, and year. The previous
  autosave is kept, so starting a new family, importing, or a damaged save can always be undone.
- **Menu (🌳) → Saves & backups** exports a `.json` save (this game or a full backup). **Import** checks the file
  (format upgrade, schema, cross-references) before anything is replaced, and warns if it was made with
  different game rules.
- Browsers can clear site data, so the year recap reminds you to export a backup every 10 years.

## Profile

Settings, achievements, lifetime stats, and the Family Archive live in a **profile** stored separately from
games (its own IndexedDB table, schema version, and previous-copy recovery).

- **Full backup** (Saves & backups → Export full backup) contains the profile plus your current and previous
  games. Importing one **merges**: achievements are combined (earliest unlock kept), each stat keeps the
  higher value, archived families are combined, and settings stay as they are unless you tick
  "Use the settings from this backup". Loading the backup's game is optional.
- Achievements are pure checks on the game state (`src/content/achievements.ts`), evaluated after every
  transition by `src/profile/tracker.ts`, so `npm run sim` can report how often each one unlocks.

## Identity

- **Avatars** are drawn from a 9-gene genome (skin, hair color/style, eyes, face shape, nose, facial hair,
  glasses, freckles). Children inherit each gene from a parent with a small mutation rate, and portraits
  age: proportions, graying, receding hair, glasses in middle age, wrinkles, cardigans. Stress and
  happiness show in the brows and mouth. Dev gallery: `npm run dev`, then open `/dev/avatars.html?seed=7&size=140`.
- **Family tree**: Family tab → 🌳 Tree. Rooted at the oldest known ancestor; played characters are ringed.
- **Memorials**: ending a story builds a memorial with a generated epitaph per generation. Epitaphs can be
  rewritten and are saved in the Family Archive (🏅 Achievements & stats), where past families can be
  reopened. **Download memorial** saves a standalone web page (inline portraits, no scripts).
