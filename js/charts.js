// Kevyet kaaviot (HTML + SVG) hover-tooltipeillä. Yksi akseli, ohuet merkit,
// kierrätetty harmaa ruudukko. Värit: --c1 (sininen) ja --c2 (vihreä).

import { esc, fmtNum } from './ui.js';

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/**
 * Pylväskaavio.
 * @param {Array<{label:string, v:number, tip:string, hi?:boolean, now?:boolean, tick?:string}>} data
 */
export function barChart(data, { height = 170, unit = '', digits = 0, legend = '', ariaLabel = '' } = {}) {
  if (!data.length) return '<p class="muted small">Ei dataa vielä.</p>';
  const minV = Math.min(0, ...data.map((d) => d.v));
  const max = niceMax(Math.max(...data.map((d) => d.v)));
  const span = max - minV || 1;
  const grid = [0, 0.5, 1].map((f) => minV + span * f);
  const y = (v) => ((v - minV) / span) * 100;
  return `<div class="chart" role="img" aria-label="${esc(ariaLabel)}">
    ${legend ? `<div class="chart-legend">${legend}</div>` : ''}
    <div class="chart-plot" style="height:${height}px">
      ${grid.map((g) => `<div class="gridline" style="bottom:${y(g)}%"><span>${fmtNum(g, digits)}${unit}</span></div>`).join('')}
      <div class="cbars">${data.map((d) => {
        const h = Math.max(d.hi ? 4 : 1.5, Math.abs(y(d.v) - y(0)));
        const neg = d.v < 0;
        return `<div class="bar-hit" data-tip="${esc(d.tip)}"><i class="cbar ${d.hi ? 'hi' : ''} ${neg ? 'neg' : ''} ${d.now ? 'now' : ''}" style="height:${h}%;${neg ? `bottom:${y(d.v)}%` : `bottom:${y(0)}%`}"></i></div>`;
      }).join('')}</div>
    </div>
    <div class="ticks">${data.map((d) => `<span>${esc(d.tick ?? '')}</span>`).join('')}</div>
  </div>`;
}

/**
 * Viivakaavio aikasarjalle (x = aikaleima ms).
 * @param {Array<{t:number, v:number}>} pts
 */
export function lineChart(pts, { height = 170, unit = '', min = null, max = null, fmtT = (t) => new Date(t).toLocaleString('fi-FI'), ariaLabel = '' } = {}) {
  if (pts.length < 2) return '<p class="muted small">Tarvitaan vähintään kaksi mittausta. Data kertyy, kun käytät sovellusta.</p>';
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const lo = min ?? Math.min(...pts.map((p) => p.v)), hi = max ?? niceMax(Math.max(...pts.map((p) => p.v)));
  const W = 1000, H = 100;
  const X = (t) => ((t - t0) / (t1 - t0 || 1)) * W;
  const Y = (v) => H - ((v - lo) / (hi - lo || 1)) * H;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)} ${Y(p.v).toFixed(1)}`).join('');
  const data = esc(JSON.stringify(pts.map((p) => [p.t, p.v])));
  const days = [];
  const day = new Date(t0); day.setHours(24, 0, 0, 0);
  for (let t = day.getTime(); t < t1; t += 86400000) days.push(t);
  const step = Math.ceil(days.length / 7) || 1;
  return `<div class="chart line" role="img" aria-label="${esc(ariaLabel)}" data-line="${data}" data-unit="${esc(unit)}" data-t0="${t0}" data-t1="${t1}">
    <div class="chart-plot" style="height:${height}px">
      ${[lo, (lo + hi) / 2, hi].map((g) => `<div class="gridline" style="bottom:${((g - lo) / (hi - lo || 1)) * 100}%"><span>${fmtNum(g)}${unit}</span></div>`).join('')}
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="var(--c2)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>
      <div class="crosshair hidden"><i></i><b></b></div>
    </div>
    <div class="ticks abs">${days.filter((_, i) => i % step === 0).map((t) => `<span style="left:${(X(t) / W) * 100}%">${new Date(t).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}</span>`).join('')}</div>
  </div>`;
}

// Yhteinen tooltip
let tipEl = null;
function tip() {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'chart-tip hidden'; document.body.appendChild(tipEl); }
  return tipEl;
}
function showTip(html, x, y) {
  const t = tip();
  t.innerHTML = html;
  t.classList.remove('hidden');
  const r = t.getBoundingClientRect();
  t.style.left = `${Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2))}px`;
  t.style.top = `${Math.max(8, y - r.height - 12)}px`;
}
const hideTip = () => tipEl?.classList.add('hidden');

document.addEventListener('pointermove', (e) => {
  const bar = e.target.closest?.('.bar-hit');
  if (bar) { const r = bar.getBoundingClientRect(); showTip(esc(bar.dataset.tip).replace(/\n/g, '<br>'), r.left + r.width / 2, r.top + 20); return; }
  const line = e.target.closest?.('.chart.line');
  if (line) {
    const plot = line.querySelector('.chart-plot');
    const r = plot.getBoundingClientRect();
    const pts = JSON.parse(line.dataset.line);
    const t0 = +line.dataset.t0, t1 = +line.dataset.t1;
    const t = t0 + ((e.clientX - r.left) / r.width) * (t1 - t0);
    let best = pts[0];
    for (const p of pts) if (Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p;
    const x = ((best[0] - t0) / (t1 - t0 || 1)) * r.width;
    const ch = line.querySelector('.crosshair');
    ch.classList.remove('hidden');
    ch.style.left = `${x}px`;
    const vals = pts.map((p) => p[1]);
    const lo = Math.min(...vals), hiV = Math.max(...vals);
    const grids = [...plot.querySelectorAll('.gridline span')].map((s) => parseFloat(s.textContent.replace(',', '.')));
    const gLo = Math.min(...grids), gHi = Math.max(...grids);
    ch.querySelector('b').style.bottom = `${((best[1] - gLo) / (gHi - gLo || 1)) * 100}%`;
    showTip(`<b>${fmtNum(best[1])}${esc(line.dataset.unit)}</b><br>${new Date(best[0]).toLocaleString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}`, r.left + x, r.top + 10);
    return;
  }
  hideTip();
  document.querySelectorAll('.crosshair:not(.hidden)').forEach((c) => c.classList.add('hidden'));
});
document.addEventListener('scroll', hideTip, { passive: true });
