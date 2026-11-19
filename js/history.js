// Paikallinen ajo- ja lataushistoria. Jokaisesta tietohausta tallennetaan
// tiivis mittaus tämän selaimen localStorageen (vain kun sovellus on auki).

const KEY = 'tdash.hist';
const MAX = 6000;
const MI = 1.609344;

export function loadHistory() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function save(h) {
  try { localStorage.setItem(KEY, JSON.stringify(h.slice(-MAX))); } catch { /* täynnä */ }
}
export function clearHistory() { try { localStorage.removeItem(KEY); } catch { /* */ } }

/** Tallentaa mittauksen; harventaa (≥10 min väli), ellei tila muutu. */
export function record(vin, d) {
  const c = d.charge_state || {}, v = d.vehicle_state || {}, cl = d.climate_state || {}, ds = d.drive_state || {};
  if (v.odometer == null || c.battery_level == null) return;
  const s = {
    t: Date.now(), vin,
    km: +(v.odometer * MI).toFixed(1),
    soc: c.battery_level,
    rng: c.battery_range != null ? +(c.battery_range * MI).toFixed(1) : null,
    ea: c.charge_energy_added ?? null,
    cs: c.charging_state || null,
    kw: c.charger_power ?? null,
    it: cl.inside_temp ?? null, ot: cl.outside_temp ?? null,
    tp: [v.tpms_pressure_fl, v.tpms_pressure_fr, v.tpms_pressure_rl, v.tpms_pressure_rr],
    lat: ds.latitude != null ? +ds.latitude.toFixed(4) : null, lon: ds.longitude != null ? +ds.longitude.toFixed(4) : null,
  };
  const h = loadHistory();
  const last = h[h.length - 1];
  if (last && last.vin === vin && s.t - last.t < 10 * 60 * 1000 && last.cs === s.cs && Math.abs(last.km - s.km) < 1) return;
  h.push(s);
  save(h);
}

const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

/** Laskee tilastot historiasta. capacityKwh = akun käytettävä kapasiteetti. */
export function computeStats(hist, vin, capacityKwh = 75) {
  const h = hist.filter((s) => s.vin === vin).sort((a, b) => a.t - b.t);
  const now = Date.now();
  const since = (days) => h.filter((s) => s.t >= now - days * 86400000);
  const driven = (arr) => (arr.length > 1 ? Math.max(0, arr[arr.length - 1].km - arr[0].km) : 0);

  // Ajetut km per päivä (14 pv)
  const perDay = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const start = d.getTime(), end = start + 86400000;
    const before = [...h].reverse().find((s) => s.t < start);
    const inDay = h.filter((s) => s.t >= start && s.t < end);
    const pts = before ? [before, ...inDay] : inDay;
    perDay.push({ t: start, km: pts.length > 1 ? Math.max(0, pts[pts.length - 1].km - pts[0].km) : 0, has: inDay.length > 0 });
  }

  // Kulutus: peräkkäiset mittaukset, joiden välillä ajettu ≥ 3 km eikä ladattu
  let usedKwh = 0, usedKm = 0;
  for (let i = 1; i < h.length; i++) {
    const a = h[i - 1], b = h[i];
    const dkm = b.km - a.km, dsoc = a.soc - b.soc;
    if (dkm >= 3 && dsoc > 0 && b.t - a.t < 36 * 3600000 && a.cs !== 'Charging' && b.cs !== 'Charging') {
      usedKwh += (dsoc / 100) * capacityKwh;
      usedKm += dkm;
    }
  }

  // Seisontakulutus (vampire drain): ei ajoa, ei latausta, ≥ 3 h väli
  let idleSoc = 0, idleH = 0;
  for (let i = 1; i < h.length; i++) {
    const a = h[i - 1], b = h[i];
    const hours = (b.t - a.t) / 3600000;
    if (hours >= 3 && hours < 72 && Math.abs(b.km - a.km) < 0.5 && b.soc <= a.soc && a.cs !== 'Charging' && b.cs !== 'Charging') {
      idleSoc += a.soc - b.soc; idleH += hours;
    }
  }

  // Lataukset: Charging-jaksot, energia = jakson suurin charge_energy_added
  const sessions = [];
  let cur = null;
  for (const s of h) {
    if (s.cs === 'Charging') {
      if (!cur) cur = { start: s.t, soc0: s.soc, kwh: 0, maxKw: 0 };
      cur.end = s.t; cur.soc1 = s.soc; cur.kwh = Math.max(cur.kwh, s.ea || 0); cur.maxKw = Math.max(cur.maxKw, s.kw || 0);
    } else if (cur) {
      if (s.ea != null) cur.kwh = Math.max(cur.kwh, s.ea);
      cur.soc1 = Math.max(cur.soc1, s.soc);
      sessions.push(cur); cur = null;
    }
  }
  if (cur) sessions.push({ ...cur, ongoing: true });

  // Akun kunto: arvioitu toimintamatka 100 %:lla (nimellinen)
  const full = h.filter((s) => s.rng && s.soc >= 20).map((s) => ({ t: s.t, v: (s.rng / s.soc) * 100 }));
  const fullNow = full.length ? full.slice(-5).reduce((a, b) => a + b.v, 0) / Math.min(5, full.length) : null;
  const fullMax = full.length ? Math.max(...full.map((f) => f.v)) : null;

  return {
    count: h.length,
    first: h[0]?.t, last: h[h.length - 1]?.t,
    km7: driven(since(7)), km30: driven(since(30)),
    whPerKm: usedKm >= 10 ? (usedKwh * 1000) / usedKm : null,
    drainPerDay: idleH >= 6 ? (idleSoc / idleH) * 24 : null,
    sessions: sessions.slice(-12).reverse(),
    kwh30: sessions.filter((s) => s.start >= now - 30 * 86400000).reduce((a, s) => a + s.kwh, 0),
    perDay,
    soc: since(7).map((s) => ({ t: s.t, v: s.soc })),
    full100: fullNow, full100Max: fullMax,
    tires: h.filter((s) => s.tp?.[0] != null).slice(-1)[0]?.tp,
    days: new Set(h.map((s) => dayKey(s.t))).size,
  };
}

export function historyCsv(hist) {
  const head = 'aika,vin,matkamittari_km,akku_pct,toimintamatka_km,lisatty_kwh,lataustila,teho_kw,sisalla_c,ulkona_c,rengas_fl,rengas_fr,rengas_rl,rengas_rr,lat,lon';
  const rows = hist.map((s) => [new Date(s.t).toISOString(), s.vin, s.km, s.soc, s.rng, s.ea, s.cs, s.kw, s.it, s.ot, ...(s.tp || []), s.lat, s.lon].map((x) => x ?? '').join(','));
  return [head, ...rows].join('\n');
}

/** Demotilaan synteettinen kahden viikon historia. */
export function demoHistory(vin) {
  const out = [];
  let km = 34200, soc = 80;
  const start = Date.now() - 14 * 86400000;
  for (let day = 0; day < 14; day++) {
    const base = start + day * 86400000;
    const trips = [[7.5, 18 + (day % 3) * 9], [16.5, 22 + (day % 4) * 6]];
    if (day % 7 === 5) trips.push([12, 85]);
    out.push({ t: base + 6 * 3600000, vin, km, soc, rng: soc * 4.6, cs: 'Complete', ea: 0, it: 4, ot: -3 + (day % 5), tp: [2.9, 2.9, 2.8, 2.8] });
    for (const [hr, dist] of trips) {
      out.push({ t: base + hr * 3600000, vin, km, soc, rng: soc * 4.6, cs: 'Disconnected', it: 6, ot: -1 + (day % 5), tp: [2.9, 2.9, 2.8, 2.8] });
      km += dist; soc -= dist * 0.165 * 100 / 75;
      out.push({ t: base + (hr + 0.6) * 3600000, vin, km: +km.toFixed(1), soc: Math.round(soc), rng: +(soc * 4.6).toFixed(1), cs: 'Disconnected', it: 19, ot: 1 + (day % 5), tp: [2.95, 2.95, 2.85, 2.8] });
    }
    if (soc < 55 || day % 3 === 2) {
      const s0 = Math.round(soc);
      out.push({ t: base + 22 * 3600000, vin, km: +km.toFixed(1), soc: s0, rng: s0 * 4.6, cs: 'Charging', ea: 1, kw: 11, it: 8, ot: -2, tp: [2.9, 2.9, 2.8, 2.8] });
      const added = ((80 - s0) / 100) * 75 / 0.92;
      soc = 80;
      out.push({ t: base + 23.9 * 3600000, vin, km: +km.toFixed(1), soc: 80, rng: 368, cs: 'Complete', ea: +added.toFixed(1), kw: 0, it: 7, ot: -2, tp: [2.9, 2.9, 2.8, 2.8] });
    } else {
      soc -= 0.8;
    }
  }
  return out;
}
