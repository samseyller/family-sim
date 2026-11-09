# Family Tree (working title)

A turn-based family life simulator. Each turn is one year: split your limited time
between work, yourself, and your family, guide your children, face life events, and
when your character dies, continue as your spouse, child, or grandchild.

See [PLAN.md](PLAN.md) for the full design and roadmap. Done so far: **Stage 1** (family loop prototype) and **Stage 2** (reliable saves).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the game at http://localhost:5173 |
| `npm test` | Engine unit tests (determinism, exactly-once saves, succession money rules, long-run invariants) |
| `npm run sim [runs]` | Headless balance sim comparing career / family / balanced play styles |
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
- **Menu (🌳) → Export backup file** downloads a `.json` save. **Saves & backups → Import** checks the file
  (format upgrade, schema, cross-references) before anything is replaced, and warns if it was made with
  different game rules.
- Browsers can clear site data, so the year recap reminds you to export a backup every 10 years.
