// Käyttöliittymän apurit: muotoilu, toastit, vahvistusikkuna, JSON-näkymä.

import { icon } from './icons.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const attr = (o) => esc(JSON.stringify(o));

export const MI = 1.609344;
export const km = (mi) => (mi == null ? null : mi * MI);
export function fmtNum(v, d = 0) {
  if (v == null || Number.isNaN(+v)) return '–';
  return (+v).toLocaleString('fi-FI', { minimumFractionDigits: d, maximumFractionDigits: d });
}
export const fmtKm = (mi) => (mi == null ? '–' : fmtNum(km(mi)));
export const fmtTemp = (c, d = 1) => (c == null ? '–' : `${fmtNum(c, d)}°`);
export function hhmm(minutes) {
  if (minutes == null) return '–';
  const m = ((+minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
export function parseHhmm(s) {
  const [h, m] = String(s || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
export function duration(min) {
  if (min == null) return '–';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}
export function ago(ts) {
  if (!ts) return '';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 10) return 'juuri nyt';
  if (s < 60) return `${s} s sitten`;
  if (s < 3600) return `${Math.round(s / 60)} min sitten`;
  if (s < 86400) return `${Math.round(s / 3600)} h sitten`;
  return new Date(ts).toLocaleString('fi-FI', { dateStyle: 'short', timeStyle: 'short' });
}

export const DAY_NAMES = [['Ma', 'Mon', 2], ['Ti', 'Tue', 4], ['Ke', 'Wed', 8], ['To', 'Thu', 16], ['Pe', 'Fri', 32], ['La', 'Sat', 64], ['Su', 'Sun', 1]];
export const daysText = (mask) => {
  if (mask === 127) return 'Joka päivä';
  if (mask === 62) return 'Arkisin';
  if (mask === 65) return 'Viikonloppuisin';
  return DAY_NAMES.filter(([, , b]) => mask & b).map(([fi]) => fi).join(' ') || '–';
};

export function toast(msg, kind = 'ok', ms = 3800) {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(kind === 'ok' ? 'check' : kind === 'err' ? 'alert' : 'info')}<div>${esc(msg)}</div>`;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, ms);
}

/** Vahvistusikkuna. Palauttaa true/false, tai syötteen arvon jos input annettu. */
export function confirmModal({ title, text = '', ok = 'Jatka', danger = false, input = null }) {
  return new Promise((resolve) => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}
      ${input ? `<label class="field">${esc(input.label || '')}<input class="input" id="modal-input" type="${input.type || 'text'}" inputmode="${input.inputmode || 'text'}" maxlength="${input.maxlength || 200}" value="${esc(input.value || '')}" placeholder="${esc(input.placeholder || '')}" autocomplete="off"></label>` : ''}
      <div class="row"><button class="btn ghost" data-r="0">Peruuta</button><button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(ok)}</button></div>
    </div>`;
    const close = (v) => { bg.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const value = () => (input ? bg.querySelector('#modal-input').value : true);
    const onKey = (e) => { if (e.key === 'Escape') close(false); if (e.key === 'Enter') close(value()); };
    bg.addEventListener('click', (e) => {
      if (e.target === bg) return close(false);
      const r = e.target.closest('[data-r]');
      if (r) close(r.dataset.r === '1' ? value() : false);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(bg);
    (bg.querySelector('#modal-input') || bg.querySelector('[data-r="1"]')).focus();
  });
}

export function jsonHtml(obj) {
  const s = esc(JSON.stringify(obj, null, 2));
  return s.replace(/(&quot;(?:\\.|[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, (m, str, colon, bool, num) => {
    if (str) return colon ? `<span class="k">${str}</span>${colon}` : `<span class="s">${str}</span>`;
    if (bool) return `<span class="b">${bool}</span>`;
    return `<span class="n">${num}</span>`;
  });
}

export async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('Kopioitu leikepöydälle'); } catch { toast('Kopiointi ei onnistunut', 'err'); }
}

export function download(name, text, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
