// Pörssisähkö (Suomi) ja halvimman latausikkunan laskenta.
// Lähteet: api.porssisahko.net ja api.spot-hinta.fi (avoimet, ilmaiset).
// Jos selain estää suoran haun, käytetään omaa CORS-Workeria.

import { store } from './store.js';

const SOURCES = [
  { url: 'https://api.porssisahko.net/v2/latest-prices.json', unit: 'c' },
  { url: 'https://api.porssisahko.net/v1/latest-prices.json', unit: 'c' },
  { url: 'https://api.spot-hinta.fi/TodayAndDayForward', unit: 'eur' },
];
let cache = null;

async function tryFetch(url) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (r.ok) return r.json();
  } catch { /* CORS tai verkko */ }
  const proxy = store.settings.proxyUrl.trim().replace(/\/+$/, '');
  if (!proxy) return null;
  try {
    const u = new URL(url);
    const r = await fetch(`${proxy}/${u.host}${u.pathname}${u.search}`, { cache: 'no-store' });
    if (r.ok) return r.json();
  } catch { /* */ }
  return null;
}

/** Muuntaa eri lähteiden vastaukset muotoon [{start, end, c}] (c = snt/kWh sis. alv). */
function normalize(json, unit) {
  const arr = Array.isArray(json) ? json : json?.prices || json?.data || [];
  const rows = arr.map((p) => {
    const start = Date.parse(p.startDate ?? p.DateTime ?? p.start ?? p.timestamp);
    const end = p.endDate ? Date.parse(p.endDate) : null;
    let v = p.price ?? p.PriceWithTax ?? p.value;
    if (v == null || Number.isNaN(start)) return null;
    v = +v;
    if (unit === 'eur') v *= 100;
    return { start, end, c: v };
  }).filter(Boolean).sort((a, b) => a.start - b.start);
  rows.forEach((r, i) => { if (!r.end) r.end = rows[i + 1]?.start ?? r.start + (rows[1] ? rows[1].start - rows[0].start : 3600000); });
  return rows;
}

/** Tuntikeskiarvot. */
function hourly(slots) {
  const m = new Map();
  for (const s of slots) {
    const h = Math.floor(s.start / 3600000) * 3600000;
    const e = m.get(h) || { start: h, end: h + 3600000, sum: 0, n: 0 };
    e.sum += s.c; e.n += 1; m.set(h, e);
  }
  return [...m.values()].map((e) => ({ start: e.start, end: e.end, c: e.sum / e.n })).sort((a, b) => a.start - b.start);
}

export async function getPrices({ force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < 30 * 60 * 1000) return cache;
  for (const src of SOURCES) {
    const json = await tryFetch(src.url);
    if (!json) continue;
    const slots = normalize(json, src.unit);
    if (slots.length < 6) continue;
    cache = { at: Date.now(), source: new URL(src.url).host, hours: hourly(slots) };
    return cache;
  }
  throw new Error('Pörssisähkön hintoja ei saatu. Jos käytät CORS-Workeria, päivitä sen koodi uusimpaan versioon (sallii hintapalvelut).');
}

/** Seuraava kellonaika (minuutit keskiyöstä) nykyhetken jälkeen. */
export function nextTime(minutes) {
  const d = new Date();
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  if (d.getTime() <= Date.now() + 15 * 60000) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/**
 * Halvin yhtenäinen ikkuna, joka päättyy ennen deadlinea.
 * @returns {{start, end, hours, avg, nowAvg, kwh, needH, fits}}
 */
export function cheapestWindow(hours, { kwh, kw, deadline }) {
  const now = Date.now();
  const curHour = Math.floor(now / 3600000) * 3600000;
  const avail = hours.filter((h) => h.start >= curHour && h.end <= deadline);
  const needH = Math.max(1, Math.ceil(kwh / Math.max(1, kw * 0.9)));
  const pool = avail.length >= needH ? avail : hours.filter((h) => h.start >= curHour);
  const fits = avail.length >= needH;
  let best = null;
  for (let i = 0; i + needH <= pool.length; i++) {
    const w = pool.slice(i, i + needH);
    if (w[w.length - 1].start - w[0].start !== (needH - 1) * 3600000) continue; // aukko datassa
    const avg = w.reduce((a, h) => a + h.c, 0) / needH;
    if (!best || avg < best.avg) best = { start: w[0].start, end: w[w.length - 1].end, avg };
  }
  const first = pool.slice(0, needH);
  const nowAvg = first.length ? first.reduce((a, h) => a + h.c, 0) / first.length : null;
  return best ? { ...best, nowAvg, kwh, needH, fits } : null;
}
