/** Imperative one-shot effects via the Web Animations API, so callers need no state or re-render. */

function target(el?: Element | null): Element | null {
  return el ?? document.getElementById('root');
}

/** Shakes the whole app (or `el`); `strength` in px. */
export function shake(strength = 16, durationMs = 500, el?: Element | null) {
  const node = target(el);
  if (!node?.animate) return;
  const s = strength;
  node.animate(
    [
      { transform: 'translate(0,0) rotate(0)' },
      { transform: `translate(${-s}px,${s / 2}px) rotate(-1deg)` },
      { transform: `translate(${s}px,${-s / 2}px) rotate(1deg)` },
      { transform: `translate(${-s * 0.7}px,${-s / 3}px) rotate(-0.6deg)` },
      { transform: `translate(${s * 0.5}px,${s / 3}px) rotate(0.4deg)` },
      { transform: `translate(${-s * 0.2}px,0) rotate(0)` },
      { transform: 'translate(0,0) rotate(0)' },
    ],
    { duration: durationMs, easing: 'ease-out' },
  );
}

/** A full-screen color flash on top of everything. */
export function flash(color = '#ffffff', durationMs = 450) {
  const div = document.createElement('div');
  div.style.cssText = `position:fixed;inset:0;z-index:9999;pointer-events:none;background:${color};`;
  document.body.appendChild(div);
  const a = div.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: durationMs, easing: 'ease-out' });
  a.onfinish = () => div.remove();
}
