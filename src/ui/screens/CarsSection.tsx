import { useState, type ReactElement } from 'react';
import { CAR_LOAN_RATE, CAR_LOAN_YEARS, CARS, STREET_PARKING_COST, TRANSIT_COST, annuityPayment, type CarKind } from '../../content/finance';
import {
  allCars, breakdownChance, carAge, carDef, carModel, conditionOf, financeable, garagedIds, parkingSpots, repairCost, upkeepAt, workingCars,
} from '../../engine/cars';
import type { FinanceAction } from '../../engine/finance';
import type { GameState } from '../../engine/types';
import { active, money } from '../../engine/util';
import { Section } from '../components';

type ActFn = (p: { g: GameState; action: FinanceAction; label: string; hint?: string; confirm?: string }) => ReactElement;

const USED: CarKind[] = (Object.keys(CARS) as CarKind[]).filter((k) => CARS[k].age > 0);
const NEW: CarKind[] = (Object.keys(CARS) as CarKind[]).filter((k) => CARS[k].age === 0);

/** Your cars (age, condition, breakdown risk), parking, and the dealership. */
export function CarsSection({ g, Act }: { g: GameState; Act: ActFn }) {
  const hh = g.households[active(g).householdId];
  const cars = allCars(hh);
  const spots = parkingSpots(hh);
  const garaged = garagedIds(hh);
  const [shopping, setShopping] = useState<null | 'used' | 'new'>(null);
  const over = Math.max(0, cars.length - spots);

  return (
    <Section title="🚗 Cars" aside={<span className={over ? 'neg' : 'hint'}>{cars.length}/{spots} parking</span>}>
      {!workingCars(hh).length && <p className="muted">No working car. Getting to work costs {money(TRANSIT_COST)} a year in transit.</p>}
      {over > 0 && <p className="notice">⚠️ More cars than parking spots: street parking costs {money(STREET_PARKING_COST)} a year per extra car.</p>}
      {cars.map((c) => {
        const cond = conditionOf(c);
        const risk = Math.round(breakdownChance(c, garaged.has(c.id)) * 100);
        return (
          <div key={c.id} className="car-row">
            <div className="row"><span>{carDef(c).icon} {c.name}</span><strong>{money(c.value)}</strong></div>
            <div className="row hint">
              <span>
                {carAge(c)} yr{carAge(c) === 1 ? '' : 's'} old · <span className={cond.tone === 'bad' ? 'neg' : cond.tone === 'good' ? 'pos-text' : ''}>{cond.label}</span>
                {c.broken ? '' : ` · ${risk}% breakdown risk${garaged.has(c.id) ? ' (garaged)' : ''}`}
              </span>
            </div>
            {!c.broken && (
              <div className="row hint">
                <span>Upkeep {money(c.upkeep)}/yr (next year {money(upkeepAt(carModel(c), carAge(c) + 1))}) · typical repair {money(repairCost(c))}</span>
              </div>
            )}
            {c.mortgage > 0 && <div className="row hint"><span>Loan {money(c.mortgage)} ({money(c.payment ?? 0)}/yr)</span></div>}
            <div className="choices">
              {c.mortgage > 0 && <Act g={g} action={{ kind: 'payLoan', assetId: c.id, amount: c.mortgage }} label={`Pay off the loan (${money(c.mortgage)})`} />}
              {c.broken
                ? <Act g={g} action={{ kind: 'sellCar', assetId: c.id }} label={`Scrap it (${money(c.value - c.mortgage)})`} hint="Frees the parking spot" />
                : <Act g={g} action={{ kind: 'sellCar', assetId: c.id }} label={`Sell for ${money(c.value - c.mortgage)}`} confirm="Confirm: sell the car" />}
            </div>
          </div>
        );
      })}

      <div className="row" style={{ gap: 8, justifyContent: 'flex-start', marginTop: 8 }}>
        <button className={`small${shopping === 'used' ? ' primary' : ''}`} onClick={() => setShopping(shopping === 'used' ? null : 'used')}>Shop used cars</button>
        <button className={`small${shopping === 'new' ? ' primary' : ''}`} onClick={() => setShopping(shopping === 'new' ? null : 'new')}>Shop new cars</button>
      </div>
      {shopping && (
        <div className="choices">
          {(shopping === 'used' ? USED : NEW).map((k) => {
            const d = CARS[k];
            const traits = [
              `${d.age ? `${d.age} yrs old` : 'brand new'}`,
              `upkeep ${money(upkeepAt(k, d.age))}/yr`,
              d.reliability >= 1.15 ? 'very reliable' : d.reliability < 0.9 ? 'breaks down often' : '',
              `${d.seats} seats`,
              `lasts ~${d.lifespan} yrs`,
            ].filter(Boolean).join(' · ');
            return (
              <div key={k} className="buy-home">
                <div className="row"><strong>{d.icon} {d.label}</strong><span className="hint">{money(d.price)}</span></div>
                <div className="hint">{traits}</div>
                <div className="buy-options">
                  <Act g={g} action={{ kind: 'buyCar', car: k, financed: false }} label={`Buy: ${money(d.price)}`} />
                  {financeable(k) && (
                    <Act g={g} action={{ kind: 'buyCar', car: k, financed: true }} label={`Loan: ${money(d.price * 0.1)} down`}
                      hint={`${money(annuityPayment(d.price * 0.9, CAR_LOAN_RATE, CAR_LOAN_YEARS))}/yr for ${CAR_LOAN_YEARS} yrs`} />
                  )}
                </div>
              </div>
            );
          })}
          <p className="hint">Cars lose value every year, cost more to keep up as they age, and break down more often. Near the end of their life they can die for good. A garage space cuts breakdowns.</p>
        </div>
      )}
    </Section>
  );
}
