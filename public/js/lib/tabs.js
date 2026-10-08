// Accessible tab bar. `tabs` = [{ id, label }]; each panel is an element with id `panel-<id>`.
import { esc } from './dom.js';

export function mountTabs(host, tabs, onShow) {
  host.setAttribute('role', 'tablist');
  const draw = (active) => {
    host.innerHTML = tabs.map((t) =>
      `<button type="button" role="tab" id="tab-${esc(t.id)}" aria-controls="panel-${esc(t.id)}" aria-selected="${t.id === active}" data-tab="${esc(t.id)}">${esc(t.label)}${t.count ? `<span class="count">${esc(t.count)}</span>` : ''}</button>`
    ).join('');
    tabs.forEach((t) => document.getElementById(`panel-${t.id}`)?.classList.toggle('hidden', t.id !== active));
  };
  const show = (id, push = true) => {
    if (!tabs.some((t) => t.id === id)) id = tabs[0].id;
    draw(id);
    if (push) history.replaceState(null, '', `#${id}`);
    onShow?.(id);
  };
  host.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest('[data-tab]') : null;
    if (b) show(b.dataset.tab);
  });
  host.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const ids = tabs.map((t) => t.id);
    const cur = ids.indexOf(host.querySelector('[aria-selected=true]')?.dataset.tab);
    const next = ids[(cur + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
    show(next);
    host.querySelector(`[data-tab="${next}"]`)?.focus();
  });
  show(location.hash.slice(1), false);
  return { show, setCount(id, n) { const t = tabs.find((x) => x.id === id); if (t) { t.count = n; draw(host.querySelector('[aria-selected=true]')?.dataset.tab || tabs[0].id); } } };
}
