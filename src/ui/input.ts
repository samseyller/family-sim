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
  const root = scope();
  const el = root.querySelector<HTMLElement>("[data-autofocus]") ?? root.querySelector<HTMLElement>(FOCUSABLE);
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
  if (isTyping(t)) return; // arrows move the caret while typing
  e.preventDefault();
  move(dir);
}

function key(k: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
}

/** Standard-mapping gamepad buttons → intents. Directions auto-repeat while held. */
const PAD_BUTTONS: Record<number, { run: () => void; repeat?: boolean }> = {
  0: { run: () => (document.activeElement as HTMLElement | null)?.click() }, // A / Cross
  1: { run: () => key('Escape') }, //  B / Circle: back
  4: { run: () => key('[') }, //       LB: previous tab
  5: { run: () => key(']') }, //       RB: next tab
  8: { run: () => key('m') }, //       Select / View: menu
  9: { run: () => key('e') }, //       Start / Menu: end year
  12: { run: () => move('up'), repeat: true },
  13: { run: () => move('down'), repeat: true },
  14: { run: () => move('left'), repeat: true },
  15: { run: () => move('right'), repeat: true },
};

/** Left stick deflection beyond this acts like the D-pad. */
const STICK = 0.6;

/** Show focus rings while a controller is in use; hide them again on mouse/touch. */
function usingPad(on: boolean) {
  document.documentElement.classList.toggle('using-pad', on);
}

/** Poll the Gamepad API and translate buttons (and the left stick) into the same intents as keys. */
function pollGamepads() {
  const held = new Map<number, number>();
  const press = (id: number, down: boolean, t: number, run: () => void, repeat: boolean) => {
    const since = held.get(id);
    if (down && since === undefined) {
      held.set(id, t);
      usingPad(true);
      run();
    } else if (down && since !== undefined && repeat && t - since > 350) {
      held.set(id, t - 250); // repeat every ~100ms after a short delay
      run();
    } else if (!down) held.delete(id);
  };
  const tick = (t: number) => {
    const pad = navigator.getGamepads?.().find(Boolean);
    if (pad) {
      for (const [idx, b] of Object.entries(PAD_BUTTONS)) press(Number(idx), !!pad.buttons[Number(idx)]?.pressed, t, b.run, !!b.repeat);
      const [x = 0, y = 0] = pad.axes;
      press(100, y < -STICK, t, () => move('up'), true);
      press(101, y > STICK, t, () => move('down'), true);
      press(102, x < -STICK, t, () => move('left'), true);
      press(103, x > STICK, t, () => move('right'), true);
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
  window.addEventListener('pointerdown', () => usingPad(false));
  pollGamepads();
}

/** True when the user is typing into a text field, so shortcuts and arrow navigation stand down. */
export function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  if (!t) return false;
  if (t.tagName === 'TEXTAREA' || t.isContentEditable) return true;
  return t.tagName === 'INPUT' && ['text', 'search', 'email', 'number', 'url', 'tel'].includes((t as HTMLInputElement).type);
}
