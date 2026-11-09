import type { GameState } from '../../engine/types';
import { estimateYear, type BudgetLine } from '../../engine/budget';
import { TIME_BUDGET } from '../../content/actions';
import { money } from '../../engine/util';
import { useGame } from '../../store/gameStore';
import { Modal } from '../components';
import { TimeDonut, splitTime } from '../TimeDonut';

const signed = (n: number) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`;

function Lines({ title, lines, sign }: { title: string; lines: BudgetLine[]; sign: 1 | -1 }) {
  if (!lines.length) return null;
  return (
    <>
      <tr className="fin-group"><th colSpan={2}>{title}</th></tr>
      {lines.map((l) => (
        <tr key={l.label}>
          <td>{l.label}</td>
          <td className="num">{signed(sign * l.amount)}</td>
        </tr>
      ))}
    </>
  );
}

/** "End 20xx?" confirmation with a time split and a money estimate for the year. */
export function EndYearDialog({ g }: { g: GameState }) {
  const endYear = useGame((s) => s.endYear);
  const ask = useGame((s) => s.askEndYear);
  const split = splitTime(g.plan);
  const unused = TIME_BUDGET - split.work - split.self - split.family;
  const est = estimateYear(g);

  return (
    <Modal label={`End ${g.year}?`} onClose={() => ask(false)}>
      <h2>End {g.year}?</h2>
      <p className="muted">Choices are locked once the year resolves.</p>

      <section className="summary-block" aria-label="Time this year">
        <div className="label">Time</div>
        <TimeDonut split={split} />
        {unused > 0 && <p className="hint">{unused} block{unused > 1 ? 's' : ''} unused. You could still spend {unused > 1 ? 'them' : 'it'}.</p>}
      </section>

      <section className="summary-block" aria-label="Money estimate">
        <div className="label">Money (estimate)</div>
        <div className="fin-totals">
          <div><span className="hint">Income</span><strong>{money(est.totalIncome)}</strong></div>
          <div><span className="hint">Expenses</span><strong>{money(est.totalExpenses)}</strong></div>
          <div className={est.net >= 0 ? 'net pos' : 'net neg'}>
            <span className="hint">Net</span>
            <strong>{signed(est.net)}</strong>
          </div>
        </div>
        <details className="fin-details">
          <summary>Breakdown</summary>
          <table className="fin-table">
            <tbody>
              <Lines title="Income" lines={est.income} sign={1} />
              <Lines title="Expenses" lines={est.expenses} sign={-1} />
            </tbody>
          </table>
        </details>
        <p className="hint">
          Before interest and surprise events.
          {est.pendingApplications > 0 && ' Pay from job applications is not counted until you are hired.'}
        </p>
      </section>

      <div className="choices">
        <button className="primary big" onClick={endYear}>Live the year</button>
        <button className="big" onClick={() => ask(false)}>Keep planning</button>
      </div>
    </Modal>
  );
}
