# Plan: hobby → training → gear → career paths

Status: proposal (not built yet). Goal: let a passion grow into a lifestyle and possibly a living,
with real costs along the way. Three paths first: **flying**, **woodworking**, **fishing**.

## The shared framework (built once, used by every path)

| Piece | What it adds | Builds on |
|---|---|---|
| **Hobbies** | `flying`, `woodworking`, `fishing` join music/sports/art. Practice blocks raise skill; some hobbies cost money per block (flight hours are expensive, fishing is cheap). | `Hobby`, Plan → Practice |
| **Licenses & certificates** | Generalize night-school `PROGRAMS` into credentials with prerequisites: a minimum skill, an earlier credential, an age, and a cost. Examples: Private Pilot License, Commercial Pilot License, Carpentry Certificate, Captain's License. | `PROGRAMS`, `qualifies()` |
| **Gear** | New owned things that age like cars (value, upkeep, breakdowns): `plane`, `boat`. Each needs a place to keep it (hangar, marina slip, or driveway/garage for a trailered boat). Bigger gear means bigger yearly costs. | `cars.ts` aging, parking spots, the `workshop` home upgrade |
| **Career ladders** | Careers get their own rank titles instead of Junior/Senior/Lead. Promotions can require skill and credentials as well as years. | `LEVEL_TITLES`, `jobLevel` |
| **Side income** | Activities that earn by skill: charter flights, furniture commissions, fishing tournaments and charters. | Activities |
| **Path achievements** | One for each milestone (first solo flight, first commission, the big catch...). | achievements |

## Flying ✈️
- **Hobby:** discovery flight activity ($250). Lessons cost about $400 per practice block. Minimum age 16.
- **Training:** Private Pilot License (skill 25, $12k) → Commercial License (PPL, skill 55, $60k, smarts 50).
  Instrument and multi-engine ratings could come later.
- **Gear:**
  - Rent a plane per flight (about $400), or buy a used single-engine plane (about $90k; upkeep $9k plus hangar $4k a year; ages and breaks down like a car).
  - Owning a plane makes visiting family and friends in other cities cheaper and faster, which ties in with cities.
- **Career:** Flight Instructor (part-time) → Commercial Pilot → First Officer → Airline Captain.
  - Replaces today's single "Airline Pilot".
  - Captain is about $200k but needs years of skill and seniority.
  - Hiring is strongest in transport-hub cities (Atlanta, Dallas, Chicago).
- **Moments:** first solo, an engine scare (skill decides the outcome), flying the kids to see grandma.

## Woodworking 🪚
- **Hobby:** practice at home, which costs materials. The existing **Workshop** home upgrade doubles practice gains.
- **Training:** Carpentry Certificate (trade school, or night school while working).
- **Gear:** tools tiers (basic $1k → pro $8k), which affect project quality.
- **Career:** Apprentice → Journeyman Carpenter → Master Carpenter → Contractor.
  - As a Contractor you run your own business: income varies year to year with skill and the housing market. Construction-heavy cities (Phoenix, Houston, Denver) pay more.
- **Payoffs at home:**
  - DIY renovations and additions cost less with high skill.
  - Build a crib or a treehouse for the kids, for bonding.
  - Sell furniture as a side hustle.
- **Moments:** a commission from a neighbor, a shop injury (safety gear matters), passing the skill to a child.

## Fishing 🎣
- **Hobby:** cheap and relaxing, with less stress and good one-on-one bonding with kids and friends. Gear tiers.
- **Gear:**
  - **Small boat:** $25k, trailered; needs a parking spot.
  - **Bass boat:** $60k.
  - **Offshore boat:** $250k; needs a marina slip, $6k a year in coastal cities.
- **Where:** coastal cities (Miami, San Diego, Seattle, Boston) unlock offshore fishing and charters. Others are lakes and rivers.
- **Career (harder):** Fishing Guide (part-time) → Charter Captain.
  - Needs a Captain's License, an offshore boat, and skill.
  - Income is seasonal and swings year to year.
- **Moments:** tournaments with prize money by skill, the one that got away, a storm at sea.

## Suggested build order
1. **Framework:**
   - new hobbies
   - credentials with prerequisites
   - per-career rank titles
   - gear assets (reusing the car aging system), with storage costs
2. **Woodworking:** smallest, and reuses the workshop upgrade. It proves the framework.
3. **Fishing:** boats, coastal cities.
4. **Flying:** the biggest; it touches travel and cities.
5. **Balance pass with `npm run econ`:**
   - gear and training are money sinks
   - side income must not outpace careers

## Questions for you
1. Should a hobby career be *possible but hard* (the default here), or a real alternative to a university career?
2. Should a plane really make family visits cheaper? It's fun, but it's a new rule for travel.
3. Should gear be inheritable (the family boat or plane passing down a generation)?
4. Any other paths for the shortlist? Some that fit the same framework: cooking (culinary school → restaurant owner), music (lessons → studio gear → touring), gardening/farming, auto restoration.
