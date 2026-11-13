import { useEffect, useRef, useState, type ReactNode } from 'react';
import { focusFirst } from './input';

export function StatBar({ label, value, invert = false, delta }: { label: string; value: number; invert?: boolean; delta?: number }) {
  const good = invert ? 100 - value : value;
  const tone = good >= 60 ? 'good' : good >= 35 ? 'mid' : 'bad';
  return (
    <div className="stat">
      <div className="stat-head">
        <span>{label}</span>
        <span className="stat-val">
          {value}
          {delta ? <Delta n={delta} invert={invert} /> : null}
        </span>
      </div>
      <div className="bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={label}>
        <div className={`fill ${tone}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function Delta({ n, invert = false, money = false }: { n: number; invert?: boolean; money?: boolean }) {
  if (!n) return null;
  const positive = invert ? n < 0 : n > 0;
  const txt = money ? `${n > 0 ? '+' : '-'}$${Math.abs(Math.round(n)).toLocaleString('en-US')}` : `${n > 0 ? '+' : ''}${n}`;
  return <span className={`delta ${positive ? 'pos' : 'neg'}`}> {txt}</span>;
}

export function Stepper({ label, icon, value, onChange, max, hint, disabledPlus }: {
  label: string;
  icon: string;
  value: number;
  onChange: (n: number) => void;
  max: number;
  hint?: string;
  disabledPlus?: boolean;
}) {
  return (
    <div className="stepper">
      <div className="stepper-label">
        <span className="icon" aria-hidden>{icon}</span>
        <div>
          <div>{label}</div>
          {hint && <div className="hint">{hint}</div>}
        </div>
      </div>
      <div className="stepper-ctrl">
        <button className="round" aria-label={`Less ${label}`} disabled={value <= 0} onClick={() => onChange(value - 1)}>−</button>
        <span className="stepper-val" aria-live="polite">{value}</span>
        <button className="round" aria-label={`More ${label}`} disabled={value >= max || disabledPlus} onClick={() => onChange(value + 1)}>+</button>
      </div>
    </div>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange, label }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ children, onClose, label }: { children: ReactNode; onClose?: () => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    focusFirst();
    if (!onClose) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label={label} data-focus-scope ref={ref}>
        {children}
      </div>
    </div>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Compact by default: a toggle button that reveals more (shopping lists, upgrades, details). */
export function Reveal({ label, openLabel, children, summary }: { label: string; openLabel?: string; children: ReactNode; summary?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="reveal">
      <div className="reveal-bar">
        <button className={`small${open ? ' primary' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? `▾ ${openLabel ?? label}` : `▸ ${label}`}
        </button>
        {!open && summary && <span className="hint">{summary}</span>}
      </div>
      {open && <div className="reveal-body">{children}</div>}
    </div>
  );
}
