// Uudet ominaisuudet: kohtaukset, pörssisähköllä ajastettu lataus, tilastot.

import { icon } from './icons.js';
import { esc, attr, fmtNum, hhmm, duration, MI } from './ui.js';
import { barChart, lineChart } from './charts.js';
import { computeStats, loadHistory, demoHistory } from './history.js';
import { cheapestWindow, nextTime } from './spot.js';
import { store } from './store.js';

// ---------------- Kohtaukset ----------------

export const SCENES = {
  lahto: {
    name: 'Lähtövalmis', ic: 'flame', desc: 'Lämmitys, istuin ja ratti – sulatus pakkasella',
    steps: (d) => {
      const out = d.climate_state?.outside_temp ?? 0;
      const s = [['auto_conditioning_start', {}, 'Ilmastointi päälle'], ['set_temps', { driver_temp: 21.5, passenger_temp: 21.5 }, 'Lämpötila 21,5 °C']];
      if (out < 10) s.push(['remote_seat_heater_request', { seat_position: 0, level: 3 }, 'Kuljettajan istuin 3'], ['remote_steering_wheel_heat_level_request', { level: 3 }, 'Ratin lämmitys']);
      if (out < 1) s.push(['set_preconditioning_max', { on: true, manual_override: true }, 'Max-sulatus']);
      return s;
    },
  },
  parkki: {
    name: 'Pysäköinti', ic: 'shield', desc: 'Ikkunat kiinni, lukitus ja vartiotila',
    steps: (d) => {
      const ds = d.drive_state || {};
      return [['window_control', { command: 'close', lat: ds.latitude, lon: ds.longitude }, 'Ikkunat kiinni'], ['door_lock', {}, 'Lukitus'], ['set_sentry_mode', { on: true }, 'Vartiotila']];
    },
  },
  matka: {
    name: 'Pitkälle matkalle', ic: 'nav', desc: 'Latausraja 100 % ja lataus käyntiin',
    steps: (d) => {
      const s = [['set_charge_limit', { percent: 100 }, 'Latausraja 100 %']];
      if (d.charge_state?.charging_state && d.charge_state.charging_state !== 'Disconnected') s.push(['charge_start', {}, 'Lataus käyntiin']);
      return s;
    },
  },
  koira: {
    name: 'Koira autoon', ic: 'dog', desc: 'Koiratila päälle ja ovet lukkoon',
    steps: () => [['set_climate_keeper_mode', { climate_keeper_mode: 2 }, 'Koiratila'], ['door_lock', {}, 'Lukitus']],
  },
};

export function scenesCard() {
  const base = location.origin + location.pathname;
  return `<section class="card span-12"><div class="card-head"><h2>${icon('spark')}Kohtaukset</h2><span class="muted small">useita komentoja yhdellä painalluksella</span></div>
    <div class="scenes">${Object.entries(SCENES).map(([id, s]) => `<button class="scene" data-act="scene" data-scene="${id}">${icon(s.ic)}<span><b>${esc(s.name)}</b><small>${esc(s.desc)}</small></span></button>`).join('')}</div>
    <details class="links"><summary class="small muted">Pikalinkit (kotinäyttö, iPhonen Pikakomennot)</summary>
      <div class="list">${Object.entries(SCENES).map(([id, s]) => `<div class="item">${icon('copy')}<div class="grow"><div class="t">${esc(s.name)}</div><div class="muted tiny">${esc(base)}?scene=${id}</div></div><button class="btn sm" data-act="copy-text" data-text="${esc(`${base}?scene=${id}`)}">Kopioi</button></div>`).join('')}</div>
      <p class="muted tiny" style="margin:6px 0 0">Linkki avaa sovelluksen ja kysyy vahvistuksen ennen kohtauksen suorittamista.</p></details>
  </section>`;
}

// ---------------- Pörssisähkö ----------------

export function chargePowerKw(c) {
  const amps = c.charge_current_request || c.charge_current_request_max || 16;
  const phases = c.charger_phases || 3;
  const volts = c.charger_voltage > 150 ? c.charger_voltage : 230;
  return (amps * volts * phases) / 1000;
}

export function spotCard(d, st) {
  const c = d.charge_state || {};
  const s = store.settings;
  const cap = +s.batteryKwh || 75;
  const kw = +s.chargeKw || +chargePowerKw(c).toFixed(1);
  const target = st.spotTarget ?? c.charge_limit_soc ?? 80;
  const depMin = st.spotDeparture ?? c.scheduled_departure_time_minutes ?? 420;
  const kwh = Math.max(0, ((target - (c.battery_level ?? 0)) / 100) * cap);
  const sp = st.spot;
  let body;
  if (!sp || sp.loading) body = `<p class="muted small">${sp?.loading ? 'Haetaan pörssisähkön hintoja…' : 'Lasketaan halvin latausaika.'}</p>`;
  else if (sp.error) body = `<p class="small" style="color:var(--warn)">${esc(sp.error)}</p>`;
  else {
    const deadline = nextTime(depMin);
    const win = kwh > 0 ? cheapestWindow(sp.hours, { kwh, kw, deadline }) : null;
    const curHour = Math.floor(Date.now() / 3600000) * 3600000;
    const shown = sp.hours.filter((h) => h.start >= curHour).slice(0, 36);
    const nowH = sp.hours.find((h) => h.start === curHour);
    const data = shown.map((h) => {
      const dt = new Date(h.start);
      return {
        v: h.c, hi: win && h.start >= win.start && h.start < win.end, now: h.start === curHour,
        tick: dt.getHours() % 3 === 0 ? String(dt.getHours()).padStart(2, '0') : '',
        tip: `${dt.toLocaleDateString('fi-FI', { weekday: 'short' })} klo ${String(dt.getHours()).padStart(2, '0')}–${String((dt.getHours() + 1) % 24).padStart(2, '0')}\n${fmtNum(h.c, 2)} snt/kWh`,
      };
    });
    const saving = win && win.nowAvg != null ? ((win.nowAvg - win.avg) / 100) * (kwh / 0.9) : 0;
    const fmtH = (t) => new Date(t).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
    const day = (t) => (new Date(t).toDateString() === new Date().toDateString() ? 'tänään' : 'huomenna');
    body = `
      <div class="kv" style="margin-bottom:12px">
        <div><div class="k">Hinta nyt</div><div class="v num">${nowH ? fmtNum(nowH.c, 2) : '–'} <small class="muted">snt/kWh</small></div></div>
        <div><div class="k">Tarvitaan</div><div class="v num">${fmtNum(kwh, 1)} kWh</div></div>
        <div><div class="k">Latausaika</div><div class="v num">${win ? `${win.needH} h` : '–'}</div></div>
        <div><div class="k">Säästö vs. heti</div><div class="v num">${win ? `${fmtNum(Math.max(0, saving), 2)} €` : '–'}</div></div>
      </div>
      ${barChart(data, { unit: '', digits: 0, height: 150, ariaLabel: 'Pörssisähkön tuntihinnat', legend: `<span><i class="sw c1"></i>Tuntihinta (snt/kWh, sis. alv)</span><span><i class="sw c2"></i>Halvin latausikkuna</span>` })}
      ${kwh <= 0 ? '<p class="small muted">Akku on jo tavoitetasolla.</p>' : win ? `
        <div class="banner info" style="margin:14px 0 0">${icon('bolt')}<div class="grow small">Halvin aika: <b>${day(win.start)} klo ${fmtH(win.start)}–${fmtH(win.end)}</b>, keskihinta <b>${fmtNum(win.avg, 2)} snt/kWh</b>${win.fits ? '' : ' <span style="color:var(--warn)">(ei ehdi ennen lähtöä – hinnat eivät vielä riitä)</span>'}.</div>
        <button class="btn sm primary" data-act="spot-schedule" data-start="${win.start}" data-end="${win.end}">Ajasta lataus</button></div>` : ''}
      <p class="muted tiny" style="margin:8px 0 0">Lähde: ${esc(sp.source)}. Siirtomaksu ja marginaali eivät sisälly. Ajastus tallentuu autoon, joten selain saa olla kiinni.</p>`;
  }
  return `<section class="card span-12 live"><div class="card-head"><h2>${icon('leaf')}Älylataus pörssisähköllä</h2>${'<button class="btn sm" data-act="spot-load">' + icon('refresh') + 'Päivitä</button>'}</div>
    <form class="row" data-form="spot" style="margin-bottom:12px">
      <label class="field">Valmis klo<input class="input" type="time" name="dep" value="${hhmm(depMin)}" style="width:120px"></label>
      <label class="field">Tavoite %<input class="input" type="number" name="target" min="50" max="100" value="${target}" style="width:90px"></label>
      <label class="field">Akku kWh<input class="input" type="number" name="cap" min="30" max="130" value="${cap}" style="width:90px"></label>
      <label class="field">Teho kW<input class="input" type="number" name="kw" min="1" max="22" step="0.1" value="${kw}" style="width:90px"></label>
      <button class="btn" type="submit" style="align-self:flex-end">Laske</button>
    </form>${body}</section>`;
}

// ---------------- Tilastot ----------------

export function statsView(d, st) {
  const cap = +store.settings.batteryKwh || 75;
  const hist = store.demo ? demoHistory(st.vin) : loadHistory();
  const s = computeStats(hist, st.vin, cap);
  const tile = (k, v, sub = '') => `<div class="tile"><div class="k">${k}</div><div class="v num">${v}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
  const degr = s.full100 && s.full100Max ? (1 - s.full100 / s.full100Max) * 100 : null;
  const perDay = s.perDay.map((p) => {
    const dt = new Date(p.t);
    return { v: p.km, tick: dt.getDate() + '.', tip: `${dt.toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric' })}\n${fmtNum(p.km)} km${p.has ? '' : ' (ei mittauksia)'}` };
  });
  const sc = st.scHistory;
  return `<div class="grid">
  ${s.count < 3 && !store.demo ? `<div class="banner info span-12">${icon('info')}<div class="grow small"><b>Tilastot kertyvät käytön myötä.</b> Sovellus tallentaa mittauksen aina kun haet auton tiedot (vain tähän selaimeen). Mitä useammin avaat sovelluksen, sitä tarkempi kuva.</div></div>` : ''}
  <section class="card span-12"><div class="tiles">
    ${tile('Ajettu 7 pv', `${fmtNum(s.km7)} km`)}
    ${tile('Ajettu 30 pv', `${fmtNum(s.km30)} km`)}
    ${tile('Kulutus', s.whPerKm ? `${fmtNum(s.whPerKm)} Wh/km` : '–', s.whPerKm ? `≈ ${fmtNum(s.whPerKm / 10, 1)} kWh/100 km` : 'tarvitsee ajomittauksia')}
    ${tile('Seisontakulutus', s.drainPerDay != null ? `${fmtNum(s.drainPerDay, 1)} %/vrk` : '–', 'kun auto on pysäköity')}
    ${tile('Ladattu 30 pv', `${fmtNum(s.kwh30)} kWh`, `${s.sessions.length} latausta tallessa`)}
    ${tile('Toimintamatka 100 %:lla', s.full100 ? `${fmtNum(s.full100)} km` : '–', degr != null && degr > 0.5 ? `${fmtNum(degr, 1)} % alle havaitun huipun` : 'nimellinen arvio')}
  </div></section>
  <section class="card span-6"><div class="card-head"><h2>${icon('car')}Ajetut kilometrit / päivä</h2><span class="muted small">14 pv</span></div>
    ${barChart(perDay, { unit: '', height: 170, ariaLabel: 'Ajetut kilometrit päivittäin' })}</section>
  <section class="card span-6"><div class="card-head"><h2>${icon('battery')}Akun varaus</h2><span class="muted small">7 pv</span></div>
    ${lineChart(s.soc, { unit: ' %', min: 0, max: 100, height: 170, ariaLabel: 'Akun varaustaso ajan funktiona' })}</section>
  <section class="card span-6"><div class="card-head"><h2>${icon('bolt')}Lataukset</h2></div>
    <div class="list">${s.sessions.length ? s.sessions.map((x) => `<div class="item">${icon('bolt')}<div class="grow"><div class="t">${new Date(x.start).toLocaleString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}${x.ongoing ? ' · käynnissä' : ''}</div>
      <div class="muted small">${x.soc0 ?? '–'} → ${x.soc1 ?? '–'} % · ${fmtNum(x.kwh, 1)} kWh${x.maxKw ? ` · max ${fmtNum(x.maxKw)} kW` : ''}</div></div></div>`).join('') : '<p class="muted small">Ei vielä havaittuja latauksia.</p>'}</div></section>
  <section class="card span-6"><div class="card-head"><h2>${icon('plug')}Supercharger-historia</h2><button class="btn sm" data-act="sc-history">${icon('refresh')}${sc ? 'Päivitä' : 'Hae'}</button></div>
    ${scHistoryHtml(sc)}</section>
  <section class="card span-12"><div class="card-head"><h2>${icon('download')}Data</h2></div>
    <p class="muted small" style="margin:0 0 10px">${s.count} mittausta${s.first ? ` · ${new Date(s.first).toLocaleDateString('fi-FI')} alkaen` : ''}. Data on vain tässä selaimessa. Kattavampi, jatkuva tallennus vaatisi Teslan Fleet Telemetry -suoratoiston ja oman palvelimen.</p>
    <div class="row">${store.demo ? '<span class="muted small">Demotilassa näytetään keksitty historia.</span>' : `<button class="btn sm" data-act="hist-export">${icon('download')}Vie CSV</button><button class="btn sm danger" data-act="hist-clear">${icon('trash')}Tyhjennä</button>`}</div>
  </section>
  </div>`;
}

function scHistoryHtml(sc) {
  if (!sc) return '<p class="muted small">Teslan tallentamat Supercharger-lataukset ja niiden hinnat (Fleet API).</p>';
  if (sc.loading) return '<p class="muted small">Haetaan…</p>';
  if (sc.error) return `<p class="small" style="color:var(--warn)">${esc(sc.error)}</p>`;
  const rows = (sc.data || []).map((r) => {
    const fees = r.fees || [];
    const kwh = fees.filter((f) => /charg/i.test(f.feeType || '')).reduce((a, f) => a + (+f.usageBase || 0) + (+f.usageTier2 || 0) + (+f.usageTier3 || 0) + (+f.usageTier4 || 0), 0);
    const cost = fees.reduce((a, f) => a + (+f.totalDue || 0), 0);
    return { t: Date.parse(r.chargeStartDateTime || r.unlatchDateTime), site: r.siteLocationName || '–', kwh, cost, cur: fees[0]?.currencyCode || 'EUR' };
  }).filter((r) => !Number.isNaN(r.t)).sort((a, b) => b.t - a.t);
  if (!rows.length) return '<p class="muted small">Ei Supercharger-latauksia.</p>';
  const months = new Map();
  for (const r of rows) {
    const d = new Date(r.t); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const m = months.get(k) || { k, cost: 0, kwh: 0, n: 0 }; m.cost += r.cost; m.kwh += r.kwh; m.n++; months.set(k, m);
  }
  const ms = [...months.values()].sort((a, b) => a.k.localeCompare(b.k)).slice(-12);
  const total = rows.reduce((a, r) => a + r.cost, 0), totalKwh = rows.reduce((a, r) => a + r.kwh, 0);
  return `<div class="kv" style="margin-bottom:12px"><div><div class="k">Yhteensä</div><div class="v num">${fmtNum(total, 2)} ${esc(rows[0].cur)}</div></div><div><div class="k">Energia</div><div class="v num">${fmtNum(totalKwh)} kWh</div></div><div><div class="k">Keskihinta</div><div class="v num">${totalKwh ? fmtNum(total / totalKwh, 2) : '–'} /kWh</div></div></div>
    ${barChart(ms.map((m) => ({ v: m.cost, tick: m.k.slice(5) + '/' + m.k.slice(2, 4), tip: `${m.k}\n${fmtNum(m.cost, 2)} ${rows[0].cur} · ${fmtNum(m.kwh)} kWh · ${m.n} kertaa` })), { height: 120, ariaLabel: 'Supercharger-kulut kuukausittain' })}
    <div class="list" style="margin-top:10px">${rows.slice(0, 8).map((r) => `<div class="item">${icon('bolt')}<div class="grow"><div class="t">${esc(r.site)}</div><div class="muted small">${new Date(r.t).toLocaleDateString('fi-FI')} · ${fmtNum(r.kwh)} kWh</div></div><b class="num">${fmtNum(r.cost, 2)} ${esc(r.cur)}</b></div>`).join('')}</div>`;
}
