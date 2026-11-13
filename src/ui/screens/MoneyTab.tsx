import { useEffect, useState } from 'react';
import { COLLEGE_FUND_CAP, GARAGE_BUILD, HOME_UPGRADES, type UpgradeId, HOMES, INVEST_RETURN, MORTGAGE_RATE, MORTGAGE_YEARS, RENOVATION, RENTALS, SELL_COSTS, annuityPayment, type HomeTier, type RentTier } from '../../content/finance';
import { estimateYear } from '../../engine/budget';
import { capacityOf, carsOf, financeBlocker, homeEquity, homeOf, homeUpfront, netWorth, rentTierOf, upgradeCost, upgradeCount, type FinanceAction } from '../../engine/finance';
import { CITIES } from '../../content/cities';
import { DEBT_PAYDOWN, DEBT_RATE, FLOOD_INSURANCE } from '../../content/economy';
import type { GameState } from '../../engine/types';
import { active, ageOf, kidsAtHome, membersOf, money } from '../../engine/util';
import { useGame } from '../../store/gameStore';
import { Reveal, Section } from '../components';
import { LifestylePicker } from './LifestylePicker';
import { RetirementCard } from './RetirementCard';
import { CarsSection } from './CarsSection';
import { GearSection } from './GearSection';
import { garageOf, parkingSpots } from '../../engine/cars';
import { HouseholdCard } from './HouseholdCard';
import { CitySection } from './CitySection';
import { cityOfHousehold, homePriceIn, rentIn } from '../../engine/location';

const WITHDRAW_STEPS = [5000, 25000, 100000, 500000];
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`;

/** A money action button: disabled with the reason when it can't happen; optional two-step confirm. */
function Act({ g, action, label, hint, confirm }: { g: GameState; action: FinanceAction; label: string; hint?: string; confirm?: string }) {
  const finance = useGame((s) => s.finance);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);
  const blocker = financeBlocker(g, action);
  return (
    <button
      className={`choice money-act${armed ? ' armed' : ''}`}
      disabled={!!blocker}
      title={blocker ?? undefined}
      onClick={() => {
        if (confirm && !armed) return setArmed(true);
        setArmed(false);
        finance(action);
      }}
    >
      <span>{armed ? `✔ ${confirm}` : label}</span>
      <span className="hint">{blocker ?? hint}</span>
    </button>
  );
}

/** Homes for sale here. If you own one, it's sold first and the equity counts toward the new one. */
function BuyHomeList({ g }: { g: GameState }) {
  const hh = g.households[active(g).householdId];
  const city = cityOfHousehold(hh);
  const home = homeOf(hh);
  return (
    <div className="choices">
      {home && <p className="hint">Buying sells your {home.name.toLowerCase()} first: about {money(homeEquity(hh))} after fees and the mortgage goes toward the new place.</p>}
      {(Object.keys(HOMES) as HomeTier[]).filter((t) => HOMES[t].label !== home?.name).map((t) => (
        <div key={t} className="buy-home">
          <div className="row">
            <strong>{HOMES[t].icon} {HOMES[t].label}</strong>
            <span className="hint">{money(homePriceIn(t, city))} · fits {HOMES[t].capacity} · {HOMES[t].garage ? `${HOMES[t].garage}-car garage` : 'no garage'}</span>
          </div>
          <div className="buy-options">
            {[0.1, 0.2].map((d) => (
              <Act key={d} g={g} action={{ kind: 'buyHome', tier: t, downPct: d }}
                label={`${d * 100}% down: ${money(homeUpfront(t, d, city))} now`}
                hint={`Mortgage ${money(annuityPayment(homePriceIn(t, city) * (1 - d), MORTGAGE_RATE, MORTGAGE_YEARS))}/yr for ${MORTGAGE_YEARS} yrs`}
                confirm={home ? `Confirm: sell and buy (${money(homeUpfront(t, d, city))} down)` : `Confirm purchase: ${money(homeUpfront(t, d, city))}`} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MoneyTab({ g }: { g: GameState }) {
  const me = active(g);
  const hh = g.households[me.householdId];
  if (ageOf(me, g.year) < 18) {
    return (
      <div className="stack">
        <Section title="💰 Money">
          <p>Your parents handle the household money for now.</p>
          <div className="row"><span>Your savings</span><strong>{money(me.fund)}</strong></div>
          <p className="hint">Summer jobs and part-time work (from 16) add to your savings. You will take them with you at 18.</p>
        </Section>
      </div>
    );
  }
  const est = estimateYear(g);
  const home = homeOf(hh);
  const cars = carsOf(hh);
  const loans = hh.assets.reduce((sum, a) => sum + a.mortgage, 0);
  const planning = g.phase === 'PLANNING';
  const people = membersOf(g, hh.id).length;
  const cap = capacityOf(hh);
  const city = cityOfHousehold(hh);

  return (
    <div className="stack two-col">
      <section className="card networth">
        <div className="row"><h2>💰 Net worth</h2><strong className="big-number">{money(netWorth(g, hh.id))}</strong></div>
        <div className="networth-grid">
          <div><span className="hint">Cash</span><strong className={hh.wallet < 0 ? 'neg' : ''}>{money(hh.wallet)}</strong></div>
          <div><span className="hint">Investments</span><strong>{money(hh.investments ?? 0)}</strong></div>
          <div><span className="hint">Home equity</span><strong>{home ? money(home.value - home.mortgage) : '—'}</strong></div>
          <div><span className="hint">Cars</span><strong>{cars.length ? money(cars.reduce((s2, c) => s2 + c.value, 0)) : '—'}</strong></div>
          <div><span className="hint">Loans owed</span><strong>{loans ? money(loans) : '—'}</strong></div>
        </div>
        {!planning && <p className="hint">Money decisions open again when you plan next year.</p>}
      </section>

      <Section title="📈 This year (estimate)" aside={<strong className={est.net >= 0 ? 'pos-text' : 'neg'}>{signed(est.net)}</strong>}>
        <table className="fin-table">
          <tbody>
            <tr className="fin-group"><th colSpan={2}>Income</th></tr>
            {est.income.map((l) => <tr key={l.label}><td>{l.label}</td><td className="num">{signed(l.amount)}</td></tr>)}
            <tr className="fin-group"><th colSpan={2}>Expenses</th></tr>
            {est.expenses.map((l) => <tr key={l.label}><td>{l.label}</td><td className="num">{signed(-l.amount)}</td></tr>)}
          </tbody>
        </table>
        <p className="hint">Before interest, investment swings, and surprises.</p>
      </Section>

      <HouseholdCard g={g} />

      <LifestylePicker g={g} />

      <CitySection g={g} Act={Act} />

      <Section title="🏠 Home" aside={<span className={people > cap ? 'neg' : 'hint'}>{people}/{cap} people</span>}>
        {home ? (
          <>
            <div className="row"><span>{home.name}</span><strong>{money(home.value)}</strong></div>
            <div className="row hint"><span>{garageOf(home) ? `${garageOf(home)}-car garage` : 'No garage'} · {parkingSpots(hh)} parking spots</span></div>
            <div className="row hint"><span>Mortgage {money(home.mortgage)}{home.payment ? ` · ${money(home.payment)}/yr` : ''}</span><span>Equity {money(home.value - home.mortgage)}</span></div>
            {(home.upgrades ?? []).length > 0 && (
              <p className="hint">
                {[...new Set(home.upgrades)].map((u) => `${HOME_UPGRADES[u as UpgradeId].icon} ${HOME_UPGRADES[u as UpgradeId].label}${upgradeCount(home, u as UpgradeId) > 1 ? ` ×${upgradeCount(home, u as UpgradeId)}` : ''}`).join(' · ')}
                {hh.floodInsurance ? ' · 🌊 flood insurance' : ''}
              </p>
            )}
            {people > cap && <p className="notice">⚠️ Too many people for this home: everyone's happiness suffers. Build an addition, or move somewhere bigger.</p>}
            {home.mortgage > 0 && (
              <Reveal label="Pay down the mortgage" summary={`${money(home.mortgage)} left`}>
                <div className="choices">
                  <Act g={g} action={{ kind: 'payLoan', assetId: home.id, amount: 10000 }} label="Pay $10,000 extra on the mortgage" hint="Less interest, smaller balance" />
                  <Act g={g} action={{ kind: 'payLoan', assetId: home.id, amount: home.mortgage }} label={`Pay off the mortgage (${money(home.mortgage)})`} hint="Own it outright" confirm={`Confirm payoff: ${money(home.mortgage)}`} />
                </div>
              </Reveal>
            )}
            <Reveal label="Improve the home">
              <div className="choices">
                <Act g={g} action={{ kind: 'renovate' }} label={`Renovate (${money(RENOVATION.cost)})`} hint={`Adds ~${money(RENOVATION.valueGain)} of value; everyone +${RENOVATION.happiness} happiness`} />
                <Act g={g} action={{ kind: 'buildGarage' }} label={`Add a garage space (${money(GARAGE_BUILD.cost)})`} hint={`Room for one more car, and garaged cars break down less. Adds ~${money(GARAGE_BUILD.valueGain)} of value`} />
                {(Object.keys(HOME_UPGRADES) as UpgradeId[]).filter((u) => upgradeCount(home, u) < HOME_UPGRADES[u].max).map((u) => (
                  <Act key={u} g={g} action={{ kind: 'upgradeHome', upgrade: u }}
                    label={`${HOME_UPGRADES[u].icon} ${u === 'expansion' ? 'Build an addition' : `Add a ${HOME_UPGRADES[u].label.toLowerCase()}`} (${money(upgradeCost(u, city))})`}
                    hint={`${HOME_UPGRADES[u].desc} · upkeep ${money(HOME_UPGRADES[u].upkeep)}/yr`} confirm={`Confirm: ${money(upgradeCost(u, city))}`} />
                ))}
              </div>
            </Reveal>
            <Reveal label="Insurance" summary={hh.floodInsurance ? 'Flood insurance: yes' : `No flood insurance (${Math.round(CITIES[city].flood * 1000) / 10}% flood risk a year)`}>
              <p className="hint">
                {Math.round(CITIES[city].flood * 1000) / 10}% chance of a serious flood each year in {CITIES[city].name}. Home insurance doesn’t cover floods.
              </p>
              <div className="choices">
                {hh.floodInsurance
                  ? <Act g={g} action={{ kind: 'floodInsurance', on: false }} label="Drop flood insurance" hint={`Saves ${money(FLOOD_INSURANCE)}/yr`} />
                  : <Act g={g} action={{ kind: 'floodInsurance', on: true }} label={`Buy flood insurance (${money(FLOOD_INSURANCE)}/yr)`} hint="Floods cost you only the deductible" />}
              </div>
            </Reveal>
            <Reveal label="Move or sell">
              <BuyHomeList g={g} />
              <div className="label">Or sell and rent</div>
              <div className="choices">
                <Act g={g} action={{ kind: 'sellHome' }} label={`Sell (about ${money(home.value * (1 - SELL_COSTS) - home.mortgage)} after fees and mortgage)`} hint="You go back to renting" confirm="Confirm: sell the home" />
              </div>
            </Reveal>
          </>
        ) : (
          <>
            <div className="row"><span>Renting: {RENTALS[rentTierOf(hh)].label}</span><strong>{money(rentIn(rentTierOf(hh), city))}/yr</strong></div>
            {people > cap && <p className="notice">⚠️ Too many people for this place: everyone's happiness suffers.</p>}
            <Reveal label="Shop for a home to buy">
              <BuyHomeList g={g} />
            </Reveal>
            <Reveal label="Move to another rental">
              <div className="choices">
                {(Object.keys(RENTALS) as RentTier[]).filter((t) => t !== rentTierOf(hh)).map((t) => (
                  <Act key={t} g={g} action={{ kind: 'rent', tier: t }} label={`${RENTALS[t].icon} ${RENTALS[t].label}: ${money(rentIn(t, city))}/yr`} hint={`Fits ${RENTALS[t].capacity} · moving costs $2,000`} />
                ))}
              </div>
            </Reveal>
          </>
        )}
      </Section>

      <CarsSection g={g} Act={Act} />

      <GearSection g={g} Act={Act} />

      <RetirementCard g={g} Act={Act} />

      <Section title="📊 Investments" aside={<strong>{money(hh.investments ?? 0)}</strong>}>
        <p className="hint">Grows about {Math.round(INVEST_RETURN * 1000) / 10}% a year on average, but some years it falls. Cash in the bank earns 1.5%.</p>
        <p className="hint">Emergencies can be paid from investments when cash runs short. While you're in debt, {Math.round(DEBT_PAYDOWN * 100)}% of it is paid from investments each year; the rest costs {Math.round(DEBT_RATE * 100)}% interest.</p>
        {hh.wallet < 0 && (hh.investments ?? 0) > 0 && (
          <Act g={g} action={{ kind: 'withdraw', amount: Math.min(hh.investments!, -hh.wallet) }} label={`Pay off debt from investments (${money(Math.min(hh.investments!, -hh.wallet))})`} />
        )}
        <div className="money-grid">
          {[1000, 5000, 25000, 50000].map((n) => <Act key={n} g={g} action={{ kind: 'invest', amount: n }} label={`Invest ${money(n)}`} />)}
        </div>
        <hr className="money-sep" aria-hidden />
        <div className="money-grid">
          {/* Withdraw options grow with the balance (only amounts you actually have). */}
          {WITHDRAW_STEPS.filter((n) => n === WITHDRAW_STEPS[0] || n <= (hh.investments ?? 0)).map((n) => (
            <Act key={n} g={g} action={{ kind: 'withdraw', amount: n }} label={`Withdraw ${money(n)}`} />
          ))}
          {(hh.investments ?? 0) > 0 && <Act g={g} action={{ kind: 'withdraw', amount: hh.investments! }} label={`Withdraw all (${money(hh.investments!)})`} />}
        </div>
      </Section>

      {kidsAtHome(g, me).length > 0 && (
        <Section title="🎓 College funds">
          {kidsAtHome(g, me).map((k) => (
            <div key={k.id} className="car-row">
              <div className="row"><span>{k.firstName} ({ageOf(k, g.year)})</span><strong>{money(k.fund)}</strong></div>
              <div className="money-grid">
                {[1000, 5000, 10000, 20000].map((n) => <Act key={n} g={g} action={{ kind: 'fundDeposit', childId: k.id, amount: n }} label={`Add ${money(n)}`} />)}
              </div>
            </div>
          ))}
          <p className="hint">Funds grow 4% a year, top out at {money(COLLEGE_FUND_CAP)}. When a child enrolls in college the fund goes to the household to pay tuition; otherwise it goes with them when they move out. Yearly contributions are set in the Plan tab.</p>
        </Section>
      )}
    </div>
  );
}
