# Family Tree (working title)

A turn-based family life simulator. Each turn is one year: split your limited time
between work, yourself, and your family, guide your children, face life events, and
when your character dies, continue as your spouse, child, or grandchild.

## Setup

You need [Node.js](https://nodejs.org/) 22.12 or newer (npm comes with it).

```sh
npm install        # install dependencies
npm run dev        # play at http://localhost:5173
npm test           # unit tests
```

The browser tests (`npm run e2e`) run in Microsoft Edge through Playwright. Install its driver once:

```sh
npx playwright install msedge
```

The game saves to the browser's IndexedDB, so there is no server or database to set up. Saves stay in the browser
you play in; use **Saves & backups → Export full backup** in the game to keep a copy.

## Continuous integration and GitHub Pages

`.github/workflows/deploy.yml` runs on every push and pull request (Node 26, matching development): typecheck, unit
tests (including the golden trace), and the balance suite.
When they pass on `main`, it builds the game and publishes it to GitHub Pages. The build uses the Pages sub-path
(for example `https://<user>.github.io/<repo>/`) through the `BASE_PATH` variable. Browser tests (`npm run e2e`)
are left out of CI to keep it fast; run them locally before merging UI changes.

One-time setup on GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**. To build for a
sub-path locally, run `BASE_PATH=/family-sim/ npm run build`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the game at http://localhost:5173 |
| `npm test` | Unit tests: engine (determinism, exactly-once saves, succession money), saves (schema, round-trips), profile (tracking, merge rules, backup format) |
| `npm run test:balance` | Balance suite (~20s): plays every play style and fails if the game leaves its design bands, any achievement or event is never reached, or metrics drift from the baseline. See [Balance testing](#balance-testing) |
| `npm run balance:deep [x]` | Occasional deep check: x times the standard lives (default ~8×) on fresh seeds, in parallel (~2–3 min); report in `balance-reports/` |
| `npm run sim [runs]` | Headless balance sim comparing career / family / balanced play styles, incl. achievement unlock rates |
| `npm run e2e` | Playwright tests (keyboard on desktop, touch on mobile, reload mid-event, failing storage). Starts its own dev server on port 5174 with dev tools enabled |
| `npm run check:devtools` | Builds with and without the dev-tools flag and checks the controls are only in the flagged build |
| `npm run build` | Typecheck and build for production (installable PWA, works offline) |
| `npx vite preview --port 4173` + `npx tsx scripts/check-pwa.ts` | Verify the build installs and plays offline |

## Balance testing

The balance tools play whole family lines headlessly with scripted play styles and fixed seeds, then turn them into
one flat set of metrics (`src/balance/`). Lives run in parallel across CPU cores.

- **Play styles** (`src/balance/playstyles.ts`). The three **core** styles (career, family, balanced; 60 lives each)
  measure the economy and difficulty. When a relationship at home is strained, a core-style player commits to mending
  it at a style-specific rate (family 85%, balanced 50%, career 20%; a stable roll per strain): committed players
  give that person time every year and reach out when it comes up, the rest let it ride. Core styles also answer
  story moments by their priorities (`STORY_PREFS`: weighted choices picked by a stable roll; family players mostly
  reach out, apologize and keep traditions, career players mostly give room, explain and go for promotions, balanced
  players split; unlisted events stay random). Seven **explorer** styles
  chase one part of the game the way a player with a goal would, so every achievement and event gets exercised:
  - *athlete*: trains from childhood with coaching, camps and gear, goes as far as talent allows, later picks up
    running, golf and tennis, and coaches the next generation.
  - *soldier*: enlists or takes ROTC; re-enlists toward the 20-year pension, goes officer, or switches to the reserve.
  - *hobbyist*: a childhood passion (flying is drawn twice as often as the others; also woodworking, mechanics,
    cooking, music, fishing and gardening) followed through night school, gear, home upgrades and the hobby's
    career ladder, moving to wherever the next job is hiring.
  - *musician*: the hobbyist's music path only (30 lives), because a big break is rare enough to need its own
    sample.
  - *socialite*: dates around in their twenties, rekindles with exes, makes lots of friends, keeps a pack of dogs,
    and moves cities.
  - *tycoon*: a pro-sports family that buys and trades up homes, upgrades, a mansion and a garage full of cars, and
    fills the mansion with three generations.
  - *guided*: the guided first life, putting off kids (so its safety net is tested).

  Explorers prefer the choices their goal needs (accept promotions, sign the draft, re-enlist...) and pick the rest
  at random. They keep a rest block and an exercise block like a sensible player would.
- **Metrics:** net worth at 35–75 and at 65 by generation, wealth growth across generations, savings rate, years in
  debt, runaway debt, lifespan, generations, how often a line dies out, legacy scores, children's outcomes, the first
  character's milestones for each explorer (went pro, pension, licenses...), every achievement's and event's rate,
  and broken invariants (NaN money, stats or skills outside 0–100, events with no available choice).
- **Design bands** (`BANDS` in `src/balance/metrics.ts`): what "balanced" means, e.g. a first-generation life ends
  with $0.4–4M at 65, wealth grows at most 4.5× by the third generation, no play style trails the best by more than
  40%, deaths in service stay rare, and **every achievement and every event is reached in at least one life** (so
  nothing is impossible or dead). A band can be marked `known` to warn instead of fail while a decision is pending.
- **Drift:** `src/balance/baseline.json` holds the metrics from the standard sample. The balance suite fails when a
  metric moves more than seed noise. Tolerances were measured by running the same code on several seed sets, because
  any change that adds a random roll reshuffles every life (four other seed sets show no drift; eight show full
  coverage). When a change is meant to shift the balance, run `npm run balance:update`, review the before/after
  table it prints, and commit the new baseline.
- **Golden trace** (`src/balance/golden.test.ts`, part of `npm test`): every play style plays two fixed lives for 80
  years, and the whole game state is fingerprinted each year. It also pins the order of the event and activity
  registries (event order feeds a weighted random pick). A pure refactor must reproduce every fingerprint exactly.
  When a change is meant to alter gameplay, update the snapshot with `npx vitest run src/balance/golden.test.ts -u`.
- **Where it runs:** `npm test` includes a quick smoke (a few short lives of every style must break no invariants).
  `npm run test:balance` is the full gate (~20s): run it before merging gameplay or economy changes.
  `npm run balance` prints the same report. `npm run balance:deep` is the occasional deep check (~2–3 min): about 8×
  the lives (500 per core style) on seeds the baseline never uses, with spreads (10th/90th percentile), every
  invariant violation, seeds of lives with runaway debt (to replay), and whether the standard sample still represents
  the game.

## Controls

- Mouse / touch: everything is a button.
- Keyboard: arrow keys move focus, Enter/Space activate, Esc closes, `1`–`6` switch tabs (Home, Plan, Family, Journal, Money, Activities), `E` ends the year (with confirmation).
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
src/engine/       pure TypeScript game rules (no React or DOM); (state) => new state
  phases.ts       the turn loop (plan, resolve the year, decisions, recap, succession)
  systems.ts      the yearly economy, people, bonds and health
  events.ts       event registry and pacing; eventKit.ts shared helpers; *Events.ts the events themselves
  activities.ts   activity rules and energy; activityKit.ts helpers; activities*.ts the catalog
  money.ts        every change to household money; flags.ts every per-person flag
  strategies.ts   how a sensible player plans a year (scripted players and dev skip)
src/content/      data: careers, cities, homes, cars, gear, pets, sports, achievements, names
src/persistence/  IndexedDB saves via Dexie, Zod schema, import/export, repairs for older saves
src/profile/      settings, achievements, lifetime stats and the family archive
src/store/        Zustand store: every UI action is one engine function, then a save
src/ui/           React screens, SVG avatars, family tree, keyboard/gamepad navigation
src/balance/      scripted play styles, metrics, design bands, baseline, golden trace
scripts/          balance and economy reports, PWA and dev-tools checks, icon and name builders
e2e/              Playwright tests
```

## Saves

- **Long family lines stay small:** once a family is 150 years old, relatives you never played who died more than
  10 years earlier are pruned to their name, dates and portrait (plus their place in the family tree); the same
  happens to everyone else when the family is memorialized. Played characters, and their bonds (which the memorial
  scores), are never pruned (`src/engine/history.ts`).
- **The journal fades by importance:** everyday entries (activity results, small news) after 10 years, good and bad
  news after 40; major moments, births and deaths are kept forever, as is the first entry. A 220-year family's save
  went from about 680 KB to about 310 KB.

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
- **Family tab options:** open a person's **Options** for actions that fit them: date night and make love with your
  partner or spouse, **try for a baby** with your spouse (about 45% each try, versus 15% by chance; a planned
  pregnancy), break up with someone you're dating
  (if you live together they move out with half the savings), separate from a spouse (they move out with half;
  the divorce follows) and file for divorce, ask parents or grown children living with you to find their own
  place, ask a grown brother or sister living in a home you run to move out (they may refuse; asking costs trust,
  more so if they say no; once a year), invite relatives to move in, visit (or fly to see) relatives who live elsewhere, and call, meet or visit friends. Friends you've drifted apart from can be
  let go for good.
- Grown children (and anyone else) living with you can still marry, with the spouse moving in, and have children.
  When the home holds more people than it fits, a **full house** prompt offers an addition, a bigger home or
  rental for everyone, helping a grown child's family into their own place, or squeezing in (more stress).

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

## Economy

- `npm run econ [runs]` plays many lives per strategy and reports net worth at key ages (and what it's made of
  at 65), savings rate, years in debt, inheritances, where the money goes, and how often events happen.
- **Debt spirals:** when you owe more than $25,000 and the interest outruns what you can put aside, a prompt
  offers a way out: sell the house and rent, buy a smaller home, move to a cheaper rental, or switch to a frugal
  lifestyle. Ignoring it is allowed (some retirees in a house they can no longer afford do go under).
- **Investments in an emergency:** a flood, medical bill, car repair, legal bill, sick pet, sports injury or a
  relative asking for help can be paid from investments when cash runs short (the choice says how much it sells).
  Everyday spending stays cash-only. While you are in cash debt, 10% of it is paid from investments each year
  before the 8% interest; the Money tab offers a button to pay off the rest.
- **Everyday costs:** progressive income tax plus payroll tax (7.65% of wages), health insurance by age,
  late-life care from 80 (or when very unwell), daycare for under-5s when every adult works, home or renters
  insurance, car insurance (30% higher for 3 years after a claim), optional flood insurance.
- **Life's big moments** (each has a cheap option; skipping can cost in relationships): engagement rings, the
  wedding (parents may chip in) and honeymoon, kids' birthday parties, a car for a new driver, graduation gifts,
  a parent's retirement party, a parent's funeral.
- **Misfortunes**, rolled yearly with realistic odds: car accidents (claim and pay more later, or pay yourself;
  old cars get totaled), house fires, break-ins (a security system helps), floods (likely only in flood-prone
  cities like Houston and Miami; covered only by flood insurance), surprise medical bills (pay, negotiate, or a
  payment plan), an adult child in legal trouble, and relatives asking for money (give, lend, or refuse).
- **Renovations** (Money → Home): up to two a year, each redoing a different room (kitchen, bathroom, living room,
  bedroom, basement, kids' rooms, office or porch) for value and happiness.
- **Luxury upgrades** for owned homes: pool, hot tub, home gym, home theater, workshop, security system, and up
  to three additions (+1 capacity each). Each has upkeep and ongoing perks.
- Achievements: Cannonball!, Room to Grow, Dream Wedding, Glad We Had Insurance, The Bank of Mom and Dad.
- **Siblings:** players are only children 25% of the time, with one sibling 40%, two 25%, three 10%. Grown siblings
  have their own homes, jobs and families. When the last parent in a home dies, their share of the savings
  (by stake) is split among all their children, even if the household carries on with an heir, so a
  child who stayed home doesn't keep it all. The `econ` report shows net worth and inheritances by generation:
  wealth now levels off by the third generation instead of compounding.

## Sports

- **Ten sports** under the sports hobby (Plan → Hobby → Sports…): soccer, basketball, baseball, football, hockey,
  volleyball, tennis, golf, swimming, running. Each has its own skill (kept when you switch; 30% carries over),
  practice cost, injury risk (football and hockey are rough), the age it can start, and a pro career. Kids can start
  at 5–8; adults any time. Your kids get a sport when they take up sports.
- **The road to the pros:** travel-team tryouts (8–13; about $3k a year for your kids), varsity (14–17), an
  **athletic scholarship** at 18 with skill 62+ (university paid; stars with decent grades get a top school; college
  athletes keep training), and the **draft** at 18–24 with skill 80+. Pros are Rookie → Starter → All-Star, with pay
  by sport (up to $15M for an All-Star in basketball), contract years, injuries, and retirement in their 30s. Former
  pros can become pro coaches.
- **Talent:** everyone has a hidden natural ceiling (the athletic trait helps; each sport varies a little).
  Progress slows as you near it and stops there, and the Plan tab says when it has leveled off. Only about 1 in 7
  people can reach pro level however hard they train: in simulated lives a fully dedicated young athlete goes pro
  about 10–15% of the time (about 1 in 5 pros become All-Stars; Starter needs skill 83, All-Star 87), and kids who
  just play for fun almost never do. The rest still earn varsity letters and scholarships.
- **Coaching:** volunteer-coach your kids (they may take up your sport), hire a private coach, send kids to sports
  camp; careers as a youth coach, personal trainer, sports coach (Assistant → Head → College Coach) or pro coach.
- **Buy:** pro gear per sport (+20% practice), club memberships for golf, tennis and swimming (+40%, a yearly fee,
  and you meet people), and home setups: a sport court, batting cage or putting green (the pool counts for swimming).
- **Activities → Sports:** pickup games, rec leagues, races and tournaments (marathons, swim meets, golf, with a rare
  hole-in-one), going to a pro game, playing catch.
- Achievements: Varsity Letter, Full Ride, Going Pro, All-Star, Champion, 26.2, Hole-in-One, Coach, Multi-Sport Athlete.

## Military service

- **At 18**, next to college, trade school, a passion or work: **enlist** (a 4-year tour) or take an **ROTC
  scholarship** (state university tuition paid, then a tour as an officer). You can suggest the military to your
  kids too. Adults 18–34 can **visit a recruiter** (Plan → Work), enlisting or joining as an officer with a degree.
- **Ranks:** Private → Sergeant → Master Sergeant, or Lieutenant → Captain → Major. Military jobs never show up in
  job listings. Health care is covered while serving.
- **Tours:** each year on active duty there's a 35% chance of deployment (stress and time away from family, with
  choices about staying in touch). At the end of a tour: re-enlist (promotion and a $10k bonus), officer school
  (needs a degree or smarts 60), the part-time **reserve** (which can be called up), or civilian life. Veterans
  get the **GI Bill** (college and night-school tuition paid). After 20 years: a pension of half your final pay.
- **Risk** while deployed, kept PG-13: about a 3% chance of being seriously injured (recover and return, or a
  medical discharge with disability pay and the Purple Heart), and a rare chance of being killed in the line of
  duty, honored with a flag-folding ceremony. Officers are a little less exposed. Family members who serve face
  the same odds; the guided first life is shielded.
- Achievements: Thank You for Your Service, Commissioned, Purple Heart (hidden), Twenty Years.

## Hobby career paths

- **Nine hobbies** (Plan → Yourself → Take up a hobby): music, sports, art, cooking, woodworking, auto mechanics,
  fishing, gardening, flying. You practice one at a time and keep skill in old ones. Some cost money per practice
  block (flying $400, $120 with your own plane). Gear and home setups speed up practice: the workshop doubles
  woodworking; a studio, chef's kitchen, greenhouse or garage lift adds 50%; boats and the plane also help.
- **Credentials** (night school): carpentry, automotive and culinary certificates (each also counts as a trade
  certificate and adds skill), a Private then Commercial Pilot License, and a Captain's license. They need skill,
  an age, and sometimes an earlier credential.
- **Career ladders** with their own ranks, pay, and skill gates for promotion:
  - Apprentice → Journeyman → Master Carpenter, or run your own contracting business
  - Lube Tech → Mechanic → Master Technician, or open an auto shop
  - Line Cook → Sous Chef → Head Chef, or open a restaurant ($250k startup)
  - Session → Touring Musician (by skill, 72+) → Headliner only through a **big break**: a hit song or a won
    headline audition (`bigBreakYear` in `engine/hobbies.ts`). A stable yearly roll gives about a 15% chance over a
    career for excellent musicians (skill 90+) and about 1% for good ones (72+). You can take the top of the bill
    or keep your life as it is (a hit song still pays royalties). Other musicians follow the same rule. Touring
    strains family bonds. Or become a School Music Director.
  - Commercial Pilot → First Officer → Airline Captain, plus flight instructing
  - Fishing Guide, or Charter Captain (coastal cities, your own offshore boat)
  - Landscaper → Crew Lead → Landscape Designer, or open a garden nursery ($80k startup)

  Businesses cost money to start, and their income swings with skill and luck.
- **Gear** (Money → Hobby gear): a plane, three boats (trailered boats take a parking spot; offshore needs a
  coastal city), a project car you restore in Activities (worth $45k when finished), and a food truck ($80k; a side
  business you run on weekends, paid by cooking skill). Gear has upkeep and
  passes down to an heir in the family estate.
- **Side gigs** (Activities → Hobbies & side gigs): sell furniture, play gigs, cater, fix cars, the farmers
  market, tournaments, car shows, the food truck, plus fishing trips, family flights, garden days, dinner parties,
  sharing your harvest with friends and neighbors (you may make a new friend), and building the kids a treehouse
  (woodworking 30+, a yard, kids 4–12; once).
- **Moments:** first solo flight, engine trouble, workshop injuries, a food critic, a song going viral, a big
  audition (a session musician who wins it goes on tour; anyone else plays a paid run of shows), the big catch, a
  storm at sea, the county fair, a one-star review (reply, invite them back, or ignore it), cooking Thanksgiving for
  twenty, an "impossible" repair three shops gave up on, and a child who wants to help restore the project car.
  Nine achievements.
- **Hobby pay** is checked by the balance suite: a dedicated hobbyist's best pay on their path should be 0.7–1.5×
  a career-focused player's best (`hobbyist.hobbyPayVsCareer`, about 1.15 today).
- **Skills that pay off at home** (`src/engine/handy.ts`), using the best skill among the adults at home:
  - **Mechanics:** car repairs cost up to 50% less and breakdowns are up to 30% rarer.
  - **Woodworking:** renovations and home additions cost up to 35% less (you do the carpentry).
  - **Gardening:** with a yard (an owned house, not a condo), someone who gardens grows up to $2,500 of
    groceries a year (at city prices; 50% more with a greenhouse), shown as "Garden harvest" in the budget.

## Jobs and the job market

- **Work moments fit the job** (`src/engine/careerEvents.ts`): every full-time career belongs to a kind of workplace
  (office, clinic, school, job site, shop floor, the road, first responders, the stage, the military, pro sports, your
  own business), and work moments only come up where they make sense: a double shift or a grateful patient at the
  clinic, a breakthrough student or an angry parent at school, a safety call or a rush job on site, a rude customer or
  the holiday rush on the shop floor, a long haul on the road, a close call for responders, opening night on stage,
  mail call and your unit in the military, a cash-flow crunch in your own business, crunch time at the office.
  Coworker lunches only happen where you have coworkers; stolen credit only in offices. Nothing at work in your
  first year at a new job, and at most one work moment a year.

- **Config:** every job lives in `src/content/careers.ts` (`CAREERS`): id, name, full- or part-time, industry
  (`sector`), base pay (before the city's pay index), expected time blocks, stress, minimum smarts, and any
  requirement (`degree`, `trade_cert`, `top_degree`, or a hobby skill). Salary rises 30% per level
  (`salaryOf`), and higher levels expect an extra block (`requiredBlocks`). City industry strengths are
  `industries` in `src/content/cities.ts`. How openings are chosen is in `src/engine/jobMarket.ts`.
- 38 full-time careers (no-qualification, trades, university, top-university and talent jobs) and 18 part-time jobs.
- **Promotions** come after 2 years at a level with good performance (65+), or 4 years when stress is 70+ (burnout
  costs you). Steady good work is never ignored forever: after 5 years (7 when stressed) the offer comes even in a
  year that already has big news.
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
    show their city. Relatives live in the same city, a few hours' drive away
    (the Northeast corridor, the Texas cities, Southern California), or a flight away; visits cost more energy and
    money the farther they go ($40, $250 or $600), and flying is an option for the far ones.
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

## Cats

- **Five breeds** (Family tab → Cats): Domestic Shorthair, Maine Coon, Siamese, Persian, Ragdoll. Each has generated
  portraits (`src/ui/CatAvatar.tsx`; gallery at `/dev/cats.html`) that stay recognizable as a kitten, adult and
  senior: tabby stripes, tuxedo bibs, colorpoint masks, ear tufts and ruffs. Content cats squint (the slow blink).
- Kittens from a breeder ($250–$2,000) or an adult from the shelter ($150), up to 4 per home (2 in a small
  apartment). Cats cost less than dogs ($900–$1,250 a year; long-haired cats more, seniors more at the vet), need
  no walks, and live about 13–15 years, often longer. Bond drifts slowly without playtime (aloof breeds barely
  notice); a cat tree helps and saves the couch. Cats go with their owner when someone moves out.
- **Activities → Pets:** play with the cats, nap with the cat, brushing (long-haired), vet check-ups, and a cat café
  (no cat needed: you might make a friend, meet someone, or go home with a cat).
- **Events:** a sick cat, a scratched couch, a stray at the door (rare), a "present" on the doormat, and introducing a
  cat and a dog.
- Achievements: Cat Person, Chosen (a stray moved in), The Cat House (4 cats), Nine Lives (hidden), Living Together.

## Homes and cars

- The Money tab stays compact: car details, car shopping, home improvements, insurance, mortgage payments, moving
  and hobby gear open on demand. You can buy a different home while you own one: it's sold first and its equity
  counts toward the new place.

- Seven home types (condo → $15M mansion for 18 people and 24 cars, with achievements for buying and filling it) with different prices, sizes and garages. Every home has 2 parking
  spots plus its garage spaces; owners can add garage spaces (up to 4). Cars beyond your spots pay for street parking.
- Ten car models, new and used, with different prices, upkeep, reliability, seats and lifespans. Only new cars can
  be bought on a loan. A car is named by its model year ("2031 Sedan") and ages every year: it loses value,
  upkeep rises 10% a year, and breakdowns (small repairs, or the "Car trouble" event) get likelier. Garaged cars
  break down less. Near the end of its lifespan a car dies for good. It's then worth scrap, no longer gets anyone
  to work, and keeps its parking spot until you scrap it.

## Personality

Traits change how someone *reacts* to what they do, never what they can do or what it costs (`src/engine/personality.ts`).

- **Reactions:** exercise, rest, learning, practice, socializing, helping, travel, trying something new, and time with a
  partner, children or the whole family do about 5–15% more or less for some traits (stacked traits are capped at
  0.8–1.25×). Activities do the same, and the result card says why ("Making things feeds you.").
- **Small costs and comforts each year:** ambitious people enjoy going the extra mile but feel a stalled year; kind people
  build bonds faster but pay for helping while stressed; anxious people feel big changes but settle in steady years;
  easygoing people carry a little less stress; creative and curious people feel a long stretch without an outlet or
  anything new (once per stretch); athletic people feel a year without exercise. The yearly recap names the trait
  that mattered most.
- **Tooltips:** hover a trait on Home or Family to see what it tends to bring and cost.
- **New activities:** try something new together, help with their project, and a quiet day together. **New moments:**
  your help being noticed, and a new interest that sticks.
- **Balance:** the balance suite compares how lives go (bonds, achievement and wellbeing) by the first character's
  traits; the weakest trait must stay within 15% of the strongest (`traits.legacySpread`; wealth is left out because
  it swings too much between seeds to compare small groups). `npx tsx scripts/personality.ts` prints a by-trait report.

## Relationships and close people

- **Connection preferences** (`src/engine/relationships.ts`): each person most likes quality time, practical support,
  shared experiences, or personal space (derived from their traits, and it can shift when they become an adult or
  retire). Their preferred form of care builds the bond about 20% more; every form still helps, and every form has
  a free activity. Pressing lots of time on someone who needs space helps a little less. When a preference shows, the
  result card says so ("Maya loves time together.") and the Family card shows a clue from then on.
- **Memories:** people remember a few things about you (a missed year, pressure, support, a kept or broken promise),
  for up to 12 years and at most four each.
- **Family actions** (Options on the Family tab, or Activities): check in (once a year per person counts), ask what
  they need (reveals their preference), and make a specific apology (only for something they actually remember).
- **Arcs:** someone still hurt about a missed year (talk, make amends, or let it be); time or money (promise more time
  next year, and it is checked); a partner juggling work and the kids while you're rarely around (help, or give them
  room).
- **Close people act on their own** (`src/engine/agency.ts`): each year a partner, child, parent, sibling or
  grandchild may act on a decision of their own. Each decision is a row in `DECISIONS` with three layers:
  hard eligibility (impossible or contradictory choices never happen), a few relevant context factors (traits,
  aspiration, connection preference, bond and trust, remembered harms or support, life stage, work, interests, young
  children, health, distance), each capped at ±8 points, and a stable roll per person, year and decision. An eligible
  decision keeps at least a quarter of its base chance, so personality shifts odds but never decides.
  - *Private steps* (explained in the recap): taking up a hobby, taking it seriously ("After years of enjoying
    music, Maya has decided to take it seriously"), letting a hobby that never took hold go (a five-year settle-in
    and gap stop churn), being there when you're struggling (a loss, poor health, high stress), keeping their distance
    after two or more remembered harms, a grandparent encouraging or babysitting a grandchild, a teen claiming more
    independence, siblings bonding over a shared interest, dropping by, calling with news of a promotion.
  - *Decisions for you*: a grown child's job offer in another city, a partner's night school or career change
    (household money and income: support, plan it for next year, or say no), an estranged relative reaching out
    (less likely after broken promises), a sibling's reunion, a boundary after you pushed too hard.
  - Limits: at most one decision a year and three recap notes; each person decides at most every four years and
    takes a private step at most every two. Nobody spends household money without your decision; children you
    invited home don't leave on their own.
  - Someone who needs space sometimes declines an invitation even when you get along; the result says so and it
    doesn't hurt the bond.
  - `npx tsx scripts/stories.ts [lives] [seed]` reports how often each decision happens and how much likelier each
    trait makes it.

## Consequences across years (story threads)

Some patterns come back years later (`src/engine/threads.ts`, follow-ups in `src/engine/storyEvents.ts`). A *thread*
is a small record of something the game actually saw: who it concerns, the distinct years it showed up, the years it
was answered, and how it ended. Most choices never create one; only recurring patterns and a few significant moments
do. Follow-ups quote only what a thread recorded, so nobody remembers something that didn't happen.

| Thread | Recorded when | Can lead to |
|---|---|---|
| strain | someone remembers you hurting them (missed, pushed, broken promise) in 2+ different years | *Drifting apart* after 3 recent hurts (make real time, which they'll hold you to next year, or give them room); *They noticed* after 3 years of showing up with no new hurt (forgiven, bond restored) |
| supported | someone remembers your help in 2+ different years | *Gratitude* when you're struggling, or later; passes to your heir ("Your mother was there for me…") |
| encouraged | your child's interest you backed (lessons, practice they welcomed, a hobby you suggested) | *Hasn't forgotten* when they're grown and still at it; closes quietly if they moved on |
| pushed | your child pushing back against your plans, year after year | *Brings it up* as an adult (apologize, or explain) |
| siblings | two of your kids bonding or clashing | *Grown up*: still close, or a dinner to bring them together |
| work_first | years of heavy work with young kids and little time for them | the *crossroads* event, which now cites those years |
| trained / missed_chance | a credential earned as an adult / a promotion turned down | *That credential paid off*; *A second chance* (only half ever return, and only while the job still fits) |
| aspiration | years your fulfillment stayed high under one aspiration | a *milestone* after 7 such years (fades after 2 years without) |
| moved / retired / loss | leaving a parent behind / retiring / losing someone close | *A parent back home* when they're old or unwell; *What now?* names your last job; loss feeds later stories |

- **Pacing:** follow-ups are ordinary minor events marked `story`; at most one comes up a year and they share the
  yearly cap. A conflict raised once isn't raised again for five years. About 6 follow-ups per 100 played years.
- **Lifecycle:** a thread with no new hit for a while fades; one about someone who died ends (except the loss
  itself); a changed hobby, job or aspiration ends the old one. At succession the heir inherits the story, not the
  personality: only "supported" threads pass on. Closed threads stay 60 years (a lifetime, for the life story and memorial), then go; a save
  holds at most 60 (simulated lives peak around 25), each keeping at most 8 years.
- **Saves:** schema 24 adds the optional `threads` list; a malformed list in an old save is dropped, not rejected,
  and older-rules repair drops threads pointing at missing people.
- `scripts/stories.ts` also reports thread counts, how they end, and follow-up rates.

## The story of the life you lived

Narrative is read-only and comes only from what was recorded (`src/engine/narrative.ts`); nothing here changes
stats, so stories never move balance.

- **Story facts:** `lifeStory` and `childhoodFacts` turn story threads, aspiration history, work, skills, children
  and bonds, and friendships into small facts. Each names only people who exist and carries the people and years it
  rests on (tests check every fact in simulated lives against its thread). Facts are written in the second person
  and retold by name (`retell`); the strongest few are told, never two of a kind, with stable template variants.
- **Event context** (one sentence, only when recorded): coming of age ("Your mother backed your music for five
  years."), a child's graduation ("After four years of you backing her art, Maya has started thinking seriously about
  it."), a strain or a mended one in a child's job offer or an estranged relative reaching out, a career's story at
  the retirement decision, a promotion that fits an achievement aspiration, a grandparent who didn't live to meet a
  new baby.
- **Year in review:** stories that came back (follow-ups and recognized patterns, journal entries marked `story`)
  come first under "📖 Your story", then the big moments; everyday entries fold into "Everyday moments (n)" when
  there are more than three. Round birthdays (40, 50… 80) add a short "At 40:" note from the strongest facts.
- **Emergent patterns** (`src/engine/patterns.ts`): read from existing facts, recognized once (a closed `pattern`
  thread), at most one a year: a family tradition (the same family activity in 3 of the last 5 years), a 30-year
  friendship, a grown child in your career or deep into your craft, a child you pushed who went their own way, a
  strained relationship that recovered on its own, an interest mastered, priorities that changed after years chasing
  achievement.
- **Succession** names what the two generations shared (an interest backed, a rift mended or not) and anyone who
  still remembers how the late character stood by them. The heir keeps their own personality and aspiration.
- **Memorials** look at the whole life: a lifetime tally of years with children at home and how many had real family
  time (`parent_years`, `family_years`), and each child's bond with you at 18 (`bond18`), so a devoted parent is
  remembered for it even after grown children drift. They are remembered for the strongest supported pattern (family, a craft, a driven career or a business,
  exploring, service, security; a top rank alone isn't "driven"), falling back to the plain reading, and carry up
  to three true lines, kept in the Family Archive. Epitaphs come in several shapes (some only when their fact is true:
  grandchildren, a lifelong craft, an aspiration found), and plain readings have a few wordings each, picked by a
  stable hash of the family and person, so families don't all sound alike.
- Schema 25: the `pattern` thread kind and the optional `story` flag on journal entries.

## Family traditions

Something a family does together year after year (`src/engine/traditions.ts`). Emergent only: there is no way to
declare one.

- **What counts:** 16 family activities (game night, cooking together, movie marathons, the garden, the park, road
  trips, getaways, beach vacations, the holiday dinner, reunions, ball games, concerts, trips abroad, and the three
  made for traditions). A year counts only when someone takes part (a solo run never does). Done in 3 different
  years out of 5, it becomes a tradition; at most 3 live at once.
- **A small boost, very small at first** (`TRADITION_BONUS`), once a year for you and everyone who comes:
  3–4 years +½ bond (a point every other year); 5–9 years +1 bond, +½ trust, +1 happiness; 10+ years ("well
  formed") +2 bond, +1 trust, +2 happiness. Children who took part in 5+ years of a well-formed tradition get +1
  happiness at 18 (+2 for 10+). The result card says "Game night: a family tradition since 2031 (12th year)", and
  the Activities tab shows a 🏷️ badge.
- **Keeping it:** one missed year is fine; two get a quiet note; three and it lapses, with no penalty. Doing it again
  within 10 years brings it back with its count; the 10th and 25th years get a line in the year in review.
- **Across generations:** at succession it passes to an heir who took part 3+ times ("Game night is Ann's to keep
  now; Ann took part 12 times growing up"); otherwise it ends. Grown children who took part 5+ times may carry it on
  in their own homes (an NPC decision: likelier for kind, connection-minded and close children, and when they have
  kids; less likely far away or after a strain); if one of them later becomes the heir, their version continues.
  Grandchildren become takers too, so a tradition can skip a generation.
- **Moments** (story follow-ups): the first one without someone who came every year; passing the torch to a grown
  child when you're 65+ or unwell; a teenager who'd rather skip it (let them, insist, or tell them to bring a
  friend); bringing a lapsed tradition back when a grandchild is born or at a reunion.
- **Story:** traditions appear in life stories ("You kept game night going for 22 years"), coming of age ("You grew
  up with Sunday dinner with the grandparents: seven years of it"), succession, memorials (an epitaph shape for 15+
  years, and a stronger "a life devoted to family"), and a 🏷️ badge on the family tree.
- Schema 26: the `tradition` thread kind (`count`, `takers`) and participant counts on tradition activities in the
  activity log. Traditions recognized in the two years before an upgrade become live ones.
- The tycoon, socialite and soldier play styles keep traditions at rates that vary by family. Measured (72 lives):
  about 1.4 traditions per 100 played years, kept 23 years on average; 30% pass to an heir; grown children carried
  one on 58 times.

## Grandchildren

A played grandparent's history with each grandchild (`src/engine/grandchildren.ts`), recorded as a `grandchild`
story thread.

- **Time together:** a year counts when a grandchild takes part in an activity with you (visits, dinners, reunions,
  teaching), once a year. The story starts on the second year.
- **Teach a grandchild your craft** (activity): a grandchild 8–17 living with you or nearby, your hobby at skill 50+;
  up to three times a year. Their skill grows; curious or creative grandchildren often take it up.
- **Moments** (story follow-ups):
  - *What you taught them*: a grandchild you taught for 3+ years, now 16–30 and good at it ("She still uses your old
    chisels").
  - *Turning 18*: a grandchild you spent 5+ years with. Give a gift toward their future (from your household into
    their savings: 1% of your savings and investments, $500 to $25,000), write them a letter, or just be there.
  - *Far away*: a grandchild 6–17 in another city you've never spent time with. Fly out, call on their birthday from
    now on (which counts as time together each year), or not now. Asked once per grandchild, never again, and at
    most one every five years.
- **The story carries on:** coming of age names grandparents who taught you or were there every year (and NPC
  grandparents who cheered you on); succession names what a grandparent and a grandchild heir shared; a taught heir
  who kept the craft starts a little happier. The skipped generation (a grown grandchild in your career or craft when
  their parent isn't) is a recognized pattern. Life stories, memorials ("grandmother of five, who always had time")
  and "a life devoted to family" count close grandchildren.
- Schema 27: the `grandchild` thread kind.

## Family tree badges

The tree shows what lives were about (`treeBadges` in `src/engine/narrative.ts`), from recorded facts only: ⭐ an
aspiration fulfilled, 🏷️ traditions kept, 🌱 a craft taught to a grandchild, 👣 followed a parent's or grandparent's
path, 🤝 a 30-year friendship. A node shows the two most significant; selecting it lists them all in words, and the
node's accessible label includes them, so nothing is icon-only.

## Aspiration and fulfillment

- **Aspiration** (`src/engine/fulfillment.ts`): what someone wants from life now: connection, mastery, achievement,
  exploration, security or service. As an adult you choose one (a suggestion from your traits and interests comes
  first); heirs choose their own; everyone else gets one from their interests.
- **Fulfillment** (0–100, Home tab) moves slowly toward how well each year served that aspiration: time with family
  for connection, practice and learning for mastery, progress at work for achievement, travel and firsts for
  exploration, savings and a home for security, helping and caring for service. Doing nothing special lands around
  the middle; real effort reaches the 70s and 80s. Illness, a new baby, caring for a parent, retirement's first year
  or looking for work soften a poor year instead of counting against you. The recap says why it moved.
- **Small reach:** about two happiness points a year either way, and a little less stress when you're fulfilled. It
  never touches income, skills, health, fertility or survival.
- **When it runs low** (under 32), "Something's missing" offers a fresh start next year, a talk with someone close,
  or a new aspiration (with two years' grace to settle in).
- **New activities:** share something you made, mentor someone younger in the family, volunteer together, plan a
  modest road trip, and set a household goal. Each is worthwhile whatever your aspiration.
- **Changing priorities:** after a first child, a loss, a move, ten years at the same job (for achievers), or three
  years in a row of mostly serving a different aspiration, a "Taking stock" moment asks whether yours still fits:
  keep it, adapt it (a fresh start), switch to what you've been drifting toward, or choose anew. At most once every
  six years; never for a single bad year. Changing keeps everything you earned and comes with two years' grace.
  Earlier aspirations are remembered (at most four).
- **Life-stage arcs:** an ambitious parent at a work-or-family crossroads (with a look back three years later), a
  creative teenager choosing their craft or a practical path, and a retiree finding a new purpose (service, mastery
  or family). Plus sibling rivalry between your kids, and a hobby project together (they pick up some of your skill).
- **Close people** may change what they want when they become parents or retire (noted in the recap).
- **Stories across generations:** an heir is introduced with what the last generation sought ("Sam sought
  connection, and found it"), and memorials show each played character's aim.
- **Balance:** each core play style's average fulfillment from 22 on stays between 38 and 75 (about 46–48 for scripted
  players who never chase their aspiration). Aspirations change about twice a life at most on average, are spread
  evenly, and none is a money strategy (`aspirations.nwSpread`, median net worth at 65 by aspiration).

## Activities, retirement, and the guided first life

- **More activities:** *At home:* do your spouse's chores (named for them; tiring, but they notice). *Health:* go
  hiking, run a 5k (up to five a year), and a secret **marathon** that appears once your fitness passes 95 and you've
  trained with sixteen 5ks.
  *Learning:* attend a conference (full-time careers that require a degree; your employer pays; work performance
  up). *Family visits:* fly to see a relative in another city (less tiring than driving, a bigger bond boost).
  *Money & luck:* bet on the horse races. *Kid stuff:* ask to have a sleepover (6–14) or go to music camp (8–16; parents may say no to either).
  *Health:* a yearly dentist visit, and a diet plan (harder to stick with when stressed). *Family visits:* host a
  family reunion (three or more relatives from other homes): bonds all round, and sometimes an old rift heals or an
  argument starts. *Made for traditions:* a birthday camping trip (once a year, a child 6–17 at home; the birthday
  child gets a little extra), Sunday dinner with the grandparents (your or your partner's parents in the same city, a
  child at home; grandparents and grandchildren grow closer), teaching a grandchild your craft (see Grandchildren), and
  a holiday light display (a house, not an apartment
  or condo; $150 the first year, $60 once you own the lights).
- **Check-up follow-ups:** a worrying check-up (over 40, health under 60) orders more tests; the results come the next
  year. Treating it then (payable from investments, like other medical bills) restores health; waiting is a coin flip. *Vices:* shut down a bar, doom scroll for hours.
- **Dating while attached:** dating activities stay open when you're in a relationship, with an orange "You are
  already seeing someone" warning. You may start seeing someone in secret, and every date out raises the chance
  (6%, 12%, 18%... up to 50%) that your partner finds out. Then you can apologize (trust takes a huge hit and they
  may leave anyway), leave them for the other person, or let them go. Hidden achievements: Cheater, Found Out.
- **Achievements:** Clean Bill of Health (five clean check-ups), Globetrotter (three trips abroad), Family Reunion,
  and the hidden Lucky Ticket (a lottery jackpot).
- **🎯 Activities** (key 6): one-off things to do while planning, outside the 12 time blocks. Each costs
  energy (100 a year, less when unhealthy or stressed, never below 50) and usually money.
- **🏖️ Retirement** (Money tab): early retirement from 55, full at 65. Pension jobs pay 1.5% of best
  salary per year of service (after 10 years); state pension from 65; retirement savings with an employer
  match on non-pension jobs. The card shows whether you could afford to retire at 55, 60 and 65.
- **🌱 Guided first life**: a fixed family starting at 18. Tabs unlock with age (Home and Plan at 18,
  Family and Journal at 20, Money at 24, Activities at 30) with a tip for each. Guardrails: money can't
  fall below a small cushion before 24, a child is guaranteed between 24 and 30, no severe events before
  35, and no death before 65. A 25-playthrough test checks all of this (`src/engine/tutorial.test.ts`).
