/**
 * Keyboard + controller navigation.
 *  - Arrow keys / D-pad move focus spatially among focusable controls.
 *  - Enter / Space / A activate (native button behavior; A clicks).
 *  - Esc / B go back (dispatched as Escape).
 *  - Start is dispatched as the "e" key (End Year shortcut).
 * Focus is confined to the top-most element marked [data-focus-scope] (modals).
 */
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex="0"]';

function scope(): ParentNode {
  const scopes = document.querySelectorAll('[data-focus-scope]');
  return scopes.length ? scopes[scopes.length - 1] : document;
}

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function focusFirst() {
  const el = scope().querySelector<HTMLElement>(FOCUSABLE);
  el?.focus({ preventScroll: true });
}

function move(dir: 'up' | 'down' | 'left' | 'right') {
  const root = scope();
  const els = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
  if (!els.length) return;
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || !els.includes(cur)) {
    els[0].focus();
    return;
  }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best: HTMLElement | undefined;
  let bestScore = Infinity;
  for (const el of els) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const primary = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
    if (primary <= 1) continue;
    const secondary = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
    const score = primary + secondary * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (best) {
    best.focus();
    best.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

const KEY_DIR: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

function onKey(e: KeyboardEvent) {
  const dir = KEY_DIR[e.key];
  if (!dir) return;
  const t = e.target as HTMLElement;
  const typing = t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && (t as HTMLInputElement).type === 'text');
  if (typing && (dir === 'left' || dir === 'right')) return;
  e.preventDefault();
  move(dir);
}

function key(k: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
}

/** Poll the Gamepad API and translate buttons into the same intents. */
function pollGamepads() {
  const held = new Map<number, number>();
  const BUTTONS: Record<number, () => void> = {
    0: () => (document.activeElement as HTMLElement | null)?.click(),
    1: () => key('Escape'),
    9: () => key('e'),
    12: () => move('up'),
    13: () => move('down'),
    14: () => move('left'),
    15: () => move('right'),
  };
  const tick = (t: number) => {
    const pad = navigator.getGamepads?.().find(Boolean);
    if (pad) {
      for (const [idx, fn] of Object.entries(BUTTONS)) {
        const i = Number(idx);
        const pressed = pad.buttons[i]?.pressed;
        const since = held.get(i);
        if (pressed && since === undefined) {
          held.set(i, t);
          fn();
        } else if (pressed && since !== undefined && i >= 12 && t - since > 350) {
          held.set(i, t - 250); // auto-repeat for the D-pad
          fn();
        } else if (!pressed) held.delete(i);
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

let installed = false;
export function installInput() {
  if (installed) return;
  installed = true;
  window.addEventListener('keydown', onKey);
  window.addEventListener('gamepadconnected', () => undefined);
  pollGamepads();
}
