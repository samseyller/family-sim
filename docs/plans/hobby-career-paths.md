# Plan: hobby → training → gear → career paths

Status: plan agreed in principle; not built yet. Goal: let a passion grow into a lifestyle, and
into a **real alternative to university**: challenging, with real costs along the way, but a
genuine way to make a living.

## Decisions so far
- **Hobby careers:** challenging, but a real alternative path. They're not a long shot: top earners in each
  path should land near university-career pay, but it takes skill, money, and time.
- **Planes are a hobby and a career, not a travel discount.** Owning one is expensive enough on its own.
- **Gear is inheritable:** the family boat, plane, workshop tools, project car or kitchen pass down with the
  household and through estates.
- **Paths:** flying, woodworking, fishing, cooking, music, auto mechanic. **Gardening** is a hobby only for now.

## The shared framework (built once, used by every path)

| Piece | What it adds | Builds on |
|---|---|---|
| **Hobbies** | New: flying, woodworking, fishing, cooking, mechanics, gardening; music already exists. Practice blocks raise skill; some cost money per block (flight hours, car parts). | `Hobby`, Plan → Practice |
| **Credentials** | Generalize night-school `PROGRAMS` into licenses and certificates with prerequisites (minimum skill, earlier credential, age, cost). They can be earned in trade school at 18 or at night later. | `PROGRAMS`, `qualifies()` |
| **Gear** | Owned things that age like cars (value, upkeep, breakdowns) and need storage: plane (hangar), boat (driveway/garage or marina), project car (garage space), tool kits, studio gear. Inheritable like any asset. | `cars.ts` aging, parking, Workshop upgrade |
| **Career ladders** | Each career gets its own rank titles; promotions can require skill and credentials as well as years. Some top ranks are "your own business," with income that varies with skill and luck. | `LEVEL_TITLES`, `jobLevel`, job market |
| **Side income** | Skill-based activities that earn money: commissions, gigs, charters, catering, tournaments, flips. | Activities |
| **Achievements** | Milestones per path. | achievements |

City job markets matter: each ladder's jobs appear in listings weighted by city industries.

## Flying ✈️
- **Hobby:** discovery flight ($250); lessons about $400 per practice block; from 16.
- **Credentials:** Private Pilot License (skill 25, $12k) → Commercial License (PPL, skill 55, $60k, smarts 50).
- **Gear:** rent per flight (about $400), or own a used single-engine plane (about $90k; $9k upkeep plus $4k hangar a year).
- **Career:** Flight Instructor (part-time) → Commercial Pilot → First Officer → Airline Captain (about $200k). Replaces
  today's single "Airline Pilot". Transport hubs (Atlanta, Dallas, Chicago) hire most.
- **Moments:** first solo; an engine scare (skill decides the outcome); a scenic flight with the family (bonding, not travel savings).

## Woodworking 🪚
- **Hobby:** material costs; the existing **Workshop** upgrade doubles practice gains.
- **Credentials:** Carpentry Certificate.
- **Gear:** tool tiers (basic $1k → pro $8k) raise project quality.
- **Career:** Apprentice → Journeyman → Master Carpenter → Contractor (own business; pay varies with skill and the
  local housing market; best in Phoenix, Houston, Denver).
- **Payoffs:** cheaper DIY renovations and additions, furniture commissions, a treehouse for the kids.

## Fishing 🎣 (a hobby first; the career is the hardest here)
- **Hobby:** cheap, low-stress, great one-on-one time with kids and friends.
- **Gear:** small trailered boat ($25k; needs a parking spot) → bass boat ($60k) → offshore boat ($250k; marina slip about
  $6k a year, coastal cities only).
- **Career:** Fishing Guide (part-time) → Charter Captain (Captain's License, an offshore boat, skill; seasonal, swingy income).
  Strongest in Miami, San Diego, Seattle, Boston.
- **Moments:** tournaments with prize money, the one that got away, a storm at sea.

## Cooking 🍳
- **Hobby:** cook at home (cheaper than eating out; a small happiness and family-bond boost), with ingredient costs.
- **Credentials:** Culinary School certificate (trade path), or work your way up.
- **Gear:** chef's kitchen home upgrade ($40k): faster practice and better dinner parties.
- **Career:** Line Cook → Sous Chef → Head Chef → Restaurant Owner (own business: a large investment, about $250k
  to open; high risk, high reward; hospitality cities like Miami and New York do best).
  Replaces today's single "Chef".
- **Side income:** catering gigs, a food truck (gear: about $80k).
- **Moments:** a bad review, a food critic visits, Thanksgiving for 20.

## Music 🎸 (extends the existing music hobby)
- **Hobby:** practice; instrument tiers ($500 → $10k).
- **Credentials:** a music degree (university path) *or* skill alone; both work.
- **Gear:** home studio ($25k): better recordings and faster practice.
- **Career, two tracks:**
  - **Performer:** Local Gigs (part-time) → Session Musician → Touring Musician → Headliner (rare, huge pay,
    long absences that strain family bonds). Entertainment cities (Los Angeles, Austin, Atlanta, New York) hire most.
  - **Teacher:** Music Teacher (part-time, exists) → School Music Director (pension).
- **Moments:** a big audition, a song going viral, life on the road vs. family time.

## Auto mechanic 🔧 (extends Mechanic)
- **Hobby:** tinkering with cars; parts cost money.
- **Credentials:** Automotive Technician certificate → Master Technician certification.
- **Gear:** home garage lift and tools ($12k; needs a garage space); project cars (buy a rusty classic for $8k, restore it over
  years, sell or keep; a restored classic can be worth $40k+).
- **Ties to cars:** high skill makes your own repairs cheaper and breakdowns less likely.
- **Career:** Lube Tech → Mechanic → Master Technician → Shop Owner (own business).
- **Moments:** a classic car show, a customer's impossible repair, restoring a car with your kid.

## Gardening 🌱 (hobby only, for now)
- Low cost, big stress relief, small health and happiness gains; better with a home that has a yard (not apartments).
- Gear: greenhouse home upgrade ($15k).
- Payoffs: lower grocery costs, county-fair ribbons, sharing produce with neighbors (friendship boosts).
- A later career could be landscaping or nursery owner, if we want one.

## Suggested build order
1. **Framework:**
   - new hobbies
   - credentials with prerequisites
   - per-career rank titles
   - gear assets with storage
   - inheritable gear (it already passes with the household; make sure estates keep it)
   - own-business income
2. **Woodworking:** smallest, and reuses the workshop.
3. **Auto mechanic:** reuses the car system.
4. **Cooking:** a home upgrade plus restaurant ownership.
5. **Music.**
6. **Fishing:** boats, coastal cities.
7. **Flying:** the biggest.
8. **Gardening:** quick, any time.
9. **Balance with `npm run econ`:** gear and training are money sinks; hobby-career pay should land near
   university-career pay at the top, with more variance.
