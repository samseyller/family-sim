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

## Dating

- **Activities → Love & dating.** Singles can try a dating app, speed dating, a blind date or a dance class;
  each has a chance to start a relationship (better when you're happy). With a partner: date night, picnic,
  concert, weekend getaway, spending the night together (needs a close relationship), moving in together
  (dating couples) and breaking up. A live-in ex leaves with their share of the savings, and your kids stay with you.
  With exes: coffee (can rekindle things if you're both single) or a risky late-night text.
- Spending the night carries a chance of pregnancy (opposite-sex couples, up to 44). An "A surprise" decision
  follows: have the baby, have it and move in together, place the baby for adoption, or not continue the
  pregnancy. The partner's wishes are shown, and going against them strains the relationship.
- Achievements: Butterflies, Playing the Field (5 people), Second Spark, Hopeless Romantic (10 dates), Surprise!

## Jobs and the job market

- **Config:** every job lives in `src/content/careers.ts` (`CAREERS`): id, name, full- or part-time, industry
  (`sector`), base pay (before the city's pay index), expected time blocks, stress, minimum smarts, and any
  requirement (`degree`, `trade_cert`, `top_degree`, or a hobby skill). Salary rises 30% per level
  (`salaryOf`), and higher levels expect an extra block (`requiredBlocks`). City industry strengths are
  `industries` in `src/content/cities.ts`. How openings are chosen is in `src/engine/jobMarket.ts`.
- 38 full-time careers (no-qualification, trades, university, top-university and talent jobs) and 18 part-time jobs.
- **Listings:** each city posts about 10 full-time and 6 part-time openings every 2 years, picked at random
  but weighted toward its industries (Seattle and Austin: tech; Houston: energy; Los Angeles: entertainment;
  New York: finance and law; Boston: healthcare, science and education...). In the second year some openings
  get filled. There's always an entry-level opening. You can only apply for what's open in your city; the Plan
  tab shows the openings and when new ones are posted. Listings come from the game seed, city and cycle, so
  they don't change on reload.

## School and college

- **GPA** (0.0–4.0): every school year from 6 to 17 earns a grade from smarts *relative to age* (nobody is
  expected to be smart at 6), that year's study effort (the player's Study time; for your kids, tutoring and
  a studies focus) and stress. 35% of each year's grade carries over from last year, so slacking early is hard
  to climb out of. For admissions, high school (14–17) counts 70% and the earlier years 30%. GPA shows on the
  Family cards and on a child player's Study row.
- **At 18** (you or your kids): apply to a **top university** (selective; $55,000/yr; the only route to
  **doctor, lawyer and engineer**), **state university** ($12,000/yr) or **trade school** ($5,000/yr), chase
  a passion, or start working. Each college option shows the admission chance (GPA and smarts) and the cost
  after any merit scholarship (25–50% for strong GPAs). It is disabled if the college fund plus savings can't
  cover the first year. Rejections fall back to state university, then trade school. At enrollment the
  college fund goes to the household to pay tuition.
- **College funds** take deposits of $1k, $5k, $10k or $20k and top out at $500,000. **Investments** have
  $1k–$50k deposits, and withdraw options that grow with the balance ($5k, $25k, $100k, $500k, all).

## Cities and friends

- **15 cities** (`src/content/cities.ts`): New York, Los Angeles, Chicago, Houston, Phoenix, Philadelphia,
  San Antonio, San Diego, Dallas, Austin, Seattle, Denver, Boston, Miami, Atlanta. Each has indexes for pay,
  housing and living costs, and transit. Games start in a random city (the guided life in Philadelphia).
  - Every household is in a city: home prices, rent and upkeep, living costs, pay and the cost of getting
    around without a car follow it. The $15M mansion costs the same everywhere.
  - Parents sometimes live in another city; grown kids sometimes move away for work; relatives and friends
    show their city. Family visits to another city cost more energy and money.
  - **Money → (your city) → Compare cities and move**: moving sells your home (you rent at first), ends the jobs
    of everyone working in your household, and moves the kids to new schools. Pets, cars and savings come along.
    A partner's job offer now names the city and moves the family there; the partner keeps their job.
- **Friends** are named people with their own homes in a specific city (Family → Friends).
  - You meet them at work, school, clubs, the gym, the dog park, volunteering, nights out, and as new neighbors
    (much likelier right after a move). New games start with two friends. Up to 15 at a time.
  - Friendship fades 10 a year without contact. At 0 a friend has "drifted apart" and may ignore invitations;
    spending time together again can reconnect you. Best friend = your closest friend at 50+.
  - Friends sometimes move away (best friends rarely, distant ones more often) or move to your city.
  - Activities → Social: coffee, game day, hikes, helping them move and parties need you in the same city.
    Calls and online games work anywhere. A trip to a friend in another city costs more energy and money.
  - Events: lunch with a coworker, a new neighbor, a new kid at school, a friend in need, a friend's wedding.
  - Achievements: Social Butterfly, Best Friends Forever, Like Old Times, Worth the Trip, Lifelong Friends,
    Fresh Start, City Hopper.
- **Names**: 500 female and 500 male first names from Social Security baby-name data (one year per decade,
  1950–2020) and the 1,000 most common surnames from the 2010 Census, both public domain.
  `scripts/build-names.mjs` regenerates `src/content/names.ts` from those files.

## Dogs

- **Family → Dogs**: adopt a puppy (Labrador, Golden Retriever, German Shepherd, French Bulldog or Beagle,
  $1,200–$3,500) or an adult rescue from the shelter ($300), and name them. Up to 3 dogs (1 in a small apartment).
- Portraits are generated SVGs: breed shapes the head, ears and markings, and each dog's coat and collar stay
  the same as it grows from puppy to adult to senior (grey muzzle). A dog that's close to you sticks its tongue out.
  Dev gallery: `/dev/dogs.html?size=150` (`npx tsx scripts/shot-dogs.ts` saves a screenshot).
- Yearly: "Pet care" costs ($1,300–$2,100 by size, +50% for seniors); everyone at home is happier and less
  stressed; bond drifts without walks (fastest for high-energy breeds); seniors lose health; dogs pass away near
  their breed's lifespan and are remembered on the card. Dogs move with their owner when households split.
- Activities → Dogs: walk, fetch, dog park (singles might meet someone), obedience class, vet check-up, grooming.
  Events: a sick dog (vet bill), puppy mischief, and kids begging for a dog.
- Achievements: Best Friend, Rescue Hero, Pack Leader (3 dogs), Who's a Good Walker? (20 walks), Good Old Dog (14).

## Homes and cars

- Seven home types (condo → $15M mansion for 18 people and 24 cars, with achievements for buying and filling it) with different prices, sizes and garages. Every home has 2 parking
  spots plus its garage spaces; owners can add garage spaces (up to 4). Cars beyond your spots pay for street parking.
- Ten car models, new and used, with different prices, upkeep, reliability, seats and lifespans. Only new cars can
  be bought on a loan. A car is named by its model year ("2031 Sedan") and ages every year: it loses value,
  upkeep rises 10% a year, and breakdowns (small repairs, or the "Car trouble" event) get likelier. Garaged cars
  break down less. Near the end of its lifespan a car dies for good. It's then worth scrap, no longer gets anyone
  to work, and keeps its parking spot until you scrap it.

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
