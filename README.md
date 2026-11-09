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
| `npm run e2e` | Playwright tests (keyboard on desktop, touch on mobile, reload mid-event, failing storage). Starts its own dev server on port 5174 with dev tools enabled |
| `npm run check:devtools` | Builds with and without the dev-tools flag and checks the controls are only in the flagged build |
| `npm run build` | Typecheck and build for production (installable PWA, works offline) |
| `npx vite preview --port 4173` + `npx tsx scripts/check-pwa.ts` | Verify the build installs and plays offline |

## Controls

- Mouse / touch: everything is a button.
- Keyboard: arrow keys move focus, Enter/Space activate, Esc closes, `1`–`5` switch tabs, `E` ends the year (with confirmation).
- Controller: D-pad or left stick moves, A activates, B backs out, LB/RB switch tabs, Start ends the year, Select opens the menu.
- Keyboard extras: `[` `]` switch tabs, `M` opens the menu. Shortcuts pause while you type in a text field.
- `` ` `` (backtick) opens dev tools (skip 10 years, kill the main character), **only** in builds made with the flag below.

## Developer tools

Dev tools are off by default everywhere, including `npm run dev`. They are compiled in only when the build
is made with `VITE_ENABLE_DEV_TOOLS=true`. Nothing at runtime (URL, storage, console) can turn them on.

```sh
VITE_ENABLE_DEV_TOOLS=true npm run dev     # PowerShell: $env:VITE_ENABLE_DEV_TOOLS="true"; npm run dev
```

Never set the flag for a release build. `npm run check:devtools` verifies that a default build has no skip/kill controls.

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
  different game rules. A save made with the current rules is rejected if it refers to events, jobs or people
  this version doesn't know. A save from older rules is repaired instead: unknown events are skipped and
  unknown jobs are cleared, with a notice.
- If the browser refuses to save (out of space, blocked storage), a warning stays at the top of the screen
  with **Try saving again** and **Download a backup** until a save succeeds. App updates wait until saving works.
- Restoring a full backup on an empty browser restores its game and its previous autosave. Loading it over an
  existing game keeps that game as the previous autosave instead; the backup's older copy is not kept.
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
  `e2e/hair.spec.ts` renders every face × hairstyle × sex × age (`/dev/hair-check.html`) and fails if any scalp
  shows on the crown.
- **Family tree**: Family tab → 🌳 Tree. Rooted at the oldest known ancestor; played characters are ringed.
- **Memorials**: ending a story builds a memorial with a generated epitaph per generation. Epitaphs can be
  rewritten and are saved in the Family Archive (🏅 Achievements & stats), where past families can be
  reopened. **Download memorial** saves a standalone web page (inline portraits, no scripts).

## Names

Starting a family (adult or child) opens a dialog to name your character and the family (🎲 or blank
for random). When your baby is born, a naming event offers suggestions or lets you type your own.

## Households

- Everyone's pay goes into the household's shared savings (cash + investments). Each adult has a **stake** that
  grows with what they bring in (pay, pensions, savings draw-downs); older contributions fade 10% a year, so
  recent earners own most of today's pot. Stakes pass to a spouse (or whoever runs the home) on death.
- **Money → Household** shows who runs the home and everyone's share. Living in your parents' home you can
  **move out** (your partner and minor children always come; grown children optionally) with your share or
  leaving the savings behind, or **take charge** once a parent is 70+ or you bring in most of the money.
- Running your own home you can buy your parents a home of their own (or ask them to leave), ask grown children
  to move out (with a gift or their share), and invite grown children or parents to live with you when you're
  close enough. Their whole household moves in and their home is sold. Invited children don't leave on their own.

## Activities, retirement, and the guided first life

- **🎯 Activities** (key 6): one-off things to do while planning, outside the 12 time blocks. Each costs
  energy (100 a year, less when unhealthy or stressed, never below 50) and usually money.
- **🏖️ Retirement** (Money tab): early retirement from 55, full at 65. Pension jobs pay 1.5% of best
  salary per year of service (after 10 years); state pension from 65; retirement savings with an employer
  match on non-pension jobs. The card shows whether you could afford to retire at 55, 60 and 65.
- **🌱 Guided first life**: a fixed family starting at 18. Tabs unlock with age (Home and Plan at 18,
  Family and Journal at 20, Money at 24, Activities at 30) with a tip for each. Guardrails: money can't
  fall below a small cushion before 24, a child is guaranteed between 24 and 30, no severe events before
  35, and no death before 65. A 25-playthrough test checks all of this (`src/engine/tutorial.test.ts`).
