// Kipinä – Tesla-ohjain. Sovelluksen ydin: tila, päivitys, tapahtumat.

import { store } from './store.js';
import { handleCallback, isLoggedIn, logout } from './api.js';
import * as V from './vehicle.js';
import { icon } from './icons.js';
import { esc, toast, confirmModal, ago, fmtNum, parseHhmm, MI } from './ui.js';
import { homeView, climateView, chargeView, securityView, carSvg } from './views.js';
import { moreView, moreActions, mapPanel } from './more.js';
import * as demo from './demo.js';

const TABS = [
  ['home', 'Koti', 'home'], ['climate', 'Ilmasto', 'fan'], ['charge', 'Lataus', 'bolt'],
  ['map', 'Kartta', 'map'], ['security', 'Turva', 'shield'], ['more', 'Lisää', 'more'],
];
const LIVE_TABS = new Set(['home', 'climate', 'charge', 'security', 'map']);

export const state = {
  vin: null, summary: null, data: null, updatedAt: 0, loading: false, error: null,
  tab: store.tab, sub: 'setup', nearby: null, pendingTemp: null, interacting: false, info: {},
};

const $app = document.getElementById('app');
let pollTimer = null;
let map = null, mapEl = null, carMarker = null, chargerLayer = null, mapPickMode = false;

// ---------------- Teema ----------------

function applyTheme() {
  const t = store.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
}
export function isDark() {
  const t = store.theme;
  return t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
}

// ---------------- Renderöinti ----------------

function statusChip() {
  if (store.demo) return '<span class="chip demo"><span class="dot"></span>Demo</span>';
  const s = state.summary?.state;
  const map = { online: ['online', 'Hereillä'], asleep: ['asleep', 'Nukkuu'], offline: ['offline', 'Ei yhteyttä'] };
  const [cls, txt] = map[s] || ['', s || '…'];
  return `<span class="chip ${cls}"><span class="dot"></span>${txt}</span>`;
}

function renderTop() {
  const el = document.getElementById('topbar');
  if (!el) return;
  const name = state.data?.vehicle_state?.vehicle_name || state.data?.display_name || state.summary?.display_name || 'Teslasi';
  el.innerHTML = `
    <div class="brand" title="Kipinä">${logo()}</div>
    <div class="car-title"><div class="name">${esc(name)}</div>
      <div class="sub">${statusChip()}${state.updatedAt ? `<span>${ago(state.updatedAt)}</span>` : ''}${state.error ? `<span style="color:var(--danger)">${esc(state.error)}</span>` : ''}</div></div>
    ${state.summary && state.summary.state !== 'online' ? `<button class="btn sm primary" data-act="wake">${icon('power')}Herätä</button>` : ''}
    <button class="icon-btn ${state.loading ? 'spin' : ''}" data-act="refresh" aria-label="Päivitä">${icon('refresh')}</button>`;
}

function logo() {
  return `<svg viewBox="0 0 64 64"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3ddc97"/><stop offset="1" stop-color="#4cc3ff"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="var(--surface)" stroke="var(--line)"/><path d="M35 9 16 37h13l-3 18 22-30H34l1-16z" fill="url(#lg)"/></svg>`;
}

function renderNav() {
  return `<nav class="nav">${TABS.map(([id, label, ic]) => `<button data-tab="${id}" class="${state.tab === id ? 'active' : ''}">${icon(ic)}<span>${label}</span></button>`).join('')}</nav>`;
}

function banner() {
  const s = state.summary?.state;
  if (store.demo) {
    return `<div class="banner info">${icon('info')}<div class="grow small"><b>Demotila.</b> Kaikki toimii simuloidulla autolla – mitään ei lähetetä Teslalle.</div>
      <button class="btn sm" data-act="demo-sleep">Nukuta</button><button class="btn sm" data-act="exit-demo">Lopeta demo</button></div>`;
  }
  if (s && s !== 'online' && LIVE_TABS.has(state.tab)) {
    return `<div class="banner warn">${icon('moon')}<div class="grow small"><b>Auto ${s === 'asleep' ? 'nukkuu' : 'ei ole yhteydessä'}.</b> ${state.data ? `Näytetään viimeisimmät tiedot (${ago(state.updatedAt)}).` : ''} Komento herättää auton automaattisesti.</div><button class="btn sm primary" data-act="wake">Herätä</button></div>`;
  }
  return '';
}

function renderView() {
  if (!isLoggedIn() && !store.demo) return renderWelcome();
  const el = document.getElementById('view');
  if (!el) return;
  const d = state.data;
  if (state.interacting) return;
  if (LIVE_TABS.has(state.tab) && !d) {
    el.innerHTML = banner() + `<div class="card" style="text-align:center;padding:40px 16px">
      ${state.loading ? '<p class="muted">Haetaan auton tietoja…</p>' : `<p class="muted">Ei tietoja vielä. ${state.summary?.state === 'asleep' ? 'Auto nukkuu – herätä se nähdäksesi tiedot.' : ''}</p>
      <div class="row" style="justify-content:center">${state.summary?.state === 'asleep' ? `<button class="btn primary" data-act="wake">${icon('power')}Herätä auto</button>` : `<button class="btn" data-act="refresh">${icon('refresh')}Yritä uudelleen</button>`}</div>`}</div>`;
    return;
  }
  const stale = state.summary && state.summary.state !== 'online' ? 'stale' : '';
  let html = '';
  switch (state.tab) {
    case 'home': html = homeView(d, state); break;
    case 'climate': html = climateView(d, state); break;
    case 'charge': html = chargeView(d, state); break;
    case 'security': html = securityView(d, state); break;
    case 'map': html = mapPanel(d, state); break;
    case 'more': html = moreView(state); break;
  }
  el.innerHTML = banner() + `<div class="${stale}">${html}</div>`;
  if (state.tab === 'map') mountMap();
}

export function render() {
  if (!isLoggedIn() && !store.demo) return renderWelcome();
  if (!document.getElementById('view')) {
    $app.innerHTML = `<header class="topbar" id="topbar"></header>${renderNav()}<main id="view"></main>`;
  } else {
    document.querySelector('.nav').outerHTML = renderNav();
  }
  renderTop();
  renderView();
}

function renderWelcome() {
  const setupOpen = state.tab === 'more';
  if (setupOpen) {
    $app.innerHTML = `<header class="topbar" id="topbar"><div class="brand">${logo()}<span>Kipinä</span></div><span class="grow" style="flex:1"></span><button class="btn sm" data-act="welcome">Takaisin</button></header><main id="view"></main>`;
    state.sub = 'setup';
    document.getElementById('view').innerHTML = moreView(state, { setupOnly: true });
    return;
  }
  $app.innerHTML = `<div class="welcome">
    <div class="logo">${logo()}</div>
    <h1>Kipinä</h1>
    <p>Oma Tesla-kojelauta ja kauko-ohjain selaimessa. Yhteys kulkee suoraan Teslan virallisen Fleet API:n kautta – tunnukset ja avaimet pysyvät vain tällä laitteella.</p>
    <div class="row"><button class="btn primary" data-act="login">${icon('key')}Kirjaudu Tesla-tilillä</button><button class="btn" data-act="setup">${icon('settings')}Käyttöönotto</button><button class="btn" data-act="demo">${icon('play')}Kokeile demoa</button></div>
    <div class="features">
      <div><b>Kojelauta</b>Akku, toimintamatka, lämpötilat, renkaat, ovet ja luukut yhdellä silmäyksellä.</div>
      <div><b>Kauko-ohjain</b>Lukitus, luukut, ikkunat, valot, äänimerkki, vartiotila ja paljon muuta.</div>
      <div><b>Ilmasto</b>Lämpötila, istuin- ja rattilämmitys, koira- ja leiritila, sulatus.</div>
      <div><b>Lataus</b>Raja, virta, aikataulut, ajastettu lähtö ja lähimmät Superchargerit.</div>
      <div><b>Kartta</b>Auton sijainti ja navigoinnin lähetys autoon.</div>
      <div><b>Turvallinen</b>Komennot allekirjoitetaan omalla avaimellasi Teslan komentoprotokollalla.</div>
    </div></div>`;
}

// ---------------- Kartta ----------------

function mountMap() {
  const slot = document.getElementById('map-slot');
  if (!slot || !window.L) { if (slot) slot.innerHTML = '<p class="muted small" style="padding:20px">Karttakirjasto latautuu…</p>'; setTimeout(() => state.tab === 'map' && renderView(), 600); return; }
  const ds = state.data?.drive_state || {};
  const pos = [ds.latitude ?? 60.1699, ds.longitude ?? 24.9384];
  if (!map) {
    mapEl = document.createElement('div');
    mapEl.id = 'map';
    slot.replaceWith(mapEl);
    map = L.map(mapEl, { zoomControl: true, attributionControl: true }).setView(pos, 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
    chargerLayer = L.layerGroup().addTo(map);
    map.on('click', onMapClick);
  } else {
    slot.replaceWith(mapEl);
    setTimeout(() => map.invalidateSize(), 0);
  }
  mapEl.classList.toggle('dark-tiles', isDark());
  const html = `<div class="car-marker" style="transform:rotate(${ds.heading || 0}deg)"><svg viewBox="0 0 34 34"><circle cx="17" cy="17" r="15" fill="#3ddc97" fill-opacity=".25"/><path d="M17 5 26 27 17 22 8 27z" fill="#3ddc97" stroke="#04150d" stroke-width="1.5" stroke-linejoin="round"/></svg></div>`;
  const ic = L.divIcon({ html, className: '', iconSize: [34, 34], iconAnchor: [17, 17] });
  if (ds.latitude != null) {
    if (!carMarker) carMarker = L.marker(pos, { icon: ic }).addTo(map).bindPopup('Auto');
    else carMarker.setLatLng(pos).setIcon(ic);
  }
  chargerLayer.clearLayers();
  for (const x of state.nearby?.superchargers || []) {
    L.circleMarker([x.location.lat, x.location.long], { radius: 8, color: '#ff5f5f', weight: 2, fillOpacity: 0.6 })
      .bindPopup(`<b>${esc(x.name)}</b><br>${x.available_stalls}/${x.total_stalls} vapaana`).addTo(chargerLayer);
  }
}

async function onMapClick(e) {
  if (!mapPickMode) return;
  mapPickMode = false;
  document.querySelector('[data-act="map-pick"]')?.classList.remove('primary');
  const { lat, lng } = e.latlng;
  const ok = await confirmModal({ title: 'Lähetetäänkö määränpää autoon?', text: `${fmtNum(lat, 5)}, ${fmtNum(lng, 5)}`, ok: 'Lähetä' });
  if (ok) runCmd('navigation_gps_request', { lat, lon: lng, order: 0 }, { label: 'Määränpää lähetetty' });
}

// ---------------- Datan haku ----------------

async function loadVehicles() {
  const list = await V.listVehicles();
  if (!list.length) throw new Error('Tililtä ei löytynyt autoja');
  const pick = list.find((v) => v.vin === store.vin) || list[0];
  state.vin = pick.vin;
  store.vin = pick.vin;
  state.summary = pick;
  state.vehicles = list;
}

export async function refresh({ force = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  state.error = null;
  renderTop();
  try {
    if (!state.vin || !state.summary) await loadVehicles();
    else if (force || state.summary?.state !== 'online') state.summary = await V.vehicleSummary(state.vin);
    if (state.summary?.state === 'online') {
      try {
        state.data = await V.vehicleData(state.vin);
        state.updatedAt = Date.now();
        if (!store.demo) store.cache = { vin: state.vin, data: state.data, at: state.updatedAt };
      } catch (e) {
        if (e.status === 408) state.summary = { ...state.summary, state: 'asleep' };
        else throw e;
      }
    }
  } catch (e) {
    state.error = e.message;
    if (e.status === 401) { logout(); toast('Istunto vanhentui – kirjaudu uudelleen', 'err'); }
  } finally {
    state.loading = false;
    render();
    schedule();
  }
}

function schedule() {
  clearTimeout(pollTimer);
  const s = store.settings;
  if (!s.refreshInterval && !store.demo) return;
  const online = state.summary?.state === 'online';
  const ms = store.demo ? 8000 : online ? s.refreshInterval * 1000 : 5 * 60 * 1000;
  pollTimer = setTimeout(() => { if (document.visibilityState === 'visible') refresh(); else schedule(); }, ms);
}

async function ensureAwake() {
  if (state.summary?.state === 'online') return;
  toast('Herätetään autoa…', 'info', 2500);
  state.summary = await V.wake(state.vin);
  renderTop();
}

// ---------------- Komennot ----------------

const busy = (el, on) => el && el.classList.toggle('busy', on);

export async function runCmd(name, params = {}, { label, confirm, danger, el, after } = {}) {
  if (confirm && !(await confirmModal({ title: confirm, ok: 'Kyllä', danger }))) return false;
  busy(el, true);
  try {
    await ensureAwake();
    try {
      await V.command(state.vin, name, params);
    } catch (e) {
      if (e.status === 408 || e.asleep) {
        state.summary = { ...state.summary, state: 'asleep' };
        await ensureAwake();
        await V.command(state.vin, name, params);
      } else throw e;
    }
    toast(label || 'Valmis');
    after?.();
    setTimeout(() => refresh(), store.demo ? 300 : 2500);
    return true;
  } catch (e) {
    toast(e.message || String(e), 'err', 6000);
    return false;
  } finally {
    busy(el, false);
  }
}

// ---------------- Tapahtumat ----------------

let tempTimer = null;

const ACTIONS = {
  refresh: () => refresh({ force: true }),
  async wake(el) {
    busy(el, true);
    try { state.summary = await V.wake(state.vin); toast('Auto on hereillä'); await refresh(); } catch (e) { toast(e.message, 'err'); } finally { busy(el, false); }
  },
  login: async () => {
    if (!store.settings.clientId) { toast('Aloita käyttöönotosta: lisää Client ID', 'info'); state.tab = 'more'; state.sub = 'setup'; return render(); }
    const { startLogin } = await import('./api.js');
    try { await startLogin(); } catch (e) { toast(e.message, 'err'); }
  },
  setup: () => { state.tab = 'more'; state.sub = 'setup'; render(); },
  welcome: () => { state.tab = 'home'; render(); },
  demo: () => { store.demo = true; state.vin = null; state.data = null; state.tab = 'home'; store.tab = 'home'; render(); refresh(); },
  'exit-demo': () => { store.demo = false; state.vin = null; state.data = null; state.summary = null; state.nearby = null; render(); if (isLoggedIn()) refresh(); },
  'demo-sleep': () => { demo.setAsleep(true); state.summary = { ...state.summary, state: 'asleep' }; render(); toast('Demo-auto nukahti'); },
  'goto-map': () => switchTab('map'),
  frunk: (el) => runCmd('actuate_trunk', { which_trunk: 'front' }, { el, label: 'Etuluukku auki', confirm: 'Avataanko etuluukku?' }),
  trunk: (el) => {
    const open = state.data?.vehicle_state?.rt;
    runCmd('actuate_trunk', { which_trunk: 'rear' }, { el, label: open ? 'Takaluukku sulkeutuu' : 'Takaluukku auki', confirm: open ? '' : 'Avataanko takaluukku?' });
  },
  chargeport: (el) => {
    const open = state.data?.charge_state?.charge_port_door_open;
    runCmd(open ? 'charge_port_door_close' : 'charge_port_door_open', {}, { el, label: open ? 'Latausluukku suljettu' : 'Latausluukku auki' });
  },
  'lock-toggle': (el) => {
    const locked = state.data?.vehicle_state?.locked;
    runCmd(locked ? 'door_unlock' : 'door_lock', {}, { el, label: locked ? 'Lukitus avattu' : 'Lukittu', confirm: locked ? 'Avataanko auton lukitus?' : '' });
  },
  'windows-vent': (el) => runCmd('window_control', { command: 'vent', ...latlon() }, { el, label: 'Ikkunat tuuletusasentoon' }),
  'windows-close': (el) => runCmd('window_control', { command: 'close', ...latlon() }, { el, label: 'Ikkunat suljettu' }),
  homelink: (el) => { const ll = latlon(); if (ll.lat == null) return toast('Auton sijainti puuttuu', 'err'); runCmd('trigger_homelink', ll, { el, label: 'HomeLink', confirm: 'Avataanko/suljetaanko kotiovi?' }); },
  async nearby(el) {
    busy(el, true);
    try {
      state.nearby = store.demo ? demo.demoInfo.nearby_charging_sites : (await (await import('./api.js')).get(`/api/1/vehicles/${state.vin}/nearby_charging_sites?detail=true`)).response;
      renderView();
    } catch (e) { toast(e.message, 'err'); } finally { busy(el, false); }
  },
  temp(el) {
    const cl = state.data?.climate_state || {};
    const min = cl.min_avail_temp ?? 15, max = cl.max_avail_temp ?? 28;
    const t = Math.min(max, Math.max(min, (state.pendingTemp ?? cl.driver_temp_setting ?? 21) + +el.dataset.delta));
    state.pendingTemp = t;
    const v = document.getElementById('temp-val');
    if (v) v.innerHTML = `${fmtNum(t, 1)}<small>°C</small>`;
    clearTimeout(tempTimer);
    tempTimer = setTimeout(async () => {
      const ok = await runCmd('set_temps', { driver_temp: t, passenger_temp: t }, { label: `Lämpötila ${fmtNum(t, 1)} °C` });
      if (ok && state.data) { state.data.climate_state.driver_temp_setting = t; state.data.climate_state.passenger_temp_setting = t; }
      state.pendingTemp = null;
    }, 900);
  },
  'seat-heat': (el) => {
    const next = (+el.dataset.level + 1) % 4;
    runCmd('remote_seat_heater_request', { seat_position: +el.dataset.seat, level: next }, { el, label: `${el.dataset.label}: ${['pois', 'taso 1', 'taso 2', 'taso 3'][next]}` });
  },
  'seat-cool': (el) => {
    const next = (+el.dataset.level + 1) % 4;
    runCmd('remote_seat_cooler_request', { seat_position: +el.dataset.seat, seat_cooler_level: next }, { el, label: `${el.dataset.label}: tuuletus ${next || 'pois'}` });
  },
  stw: (el) => {
    const lv = +el.dataset.level;
    runCmd('remote_steering_wheel_heat_level_request', { level: lv }, { el, label: 'Ratin lämmitys' });
  },
  cop: (el) => {
    const m = el.dataset.mode;
    runCmd('set_cabin_overheat_protection', { on: m !== 'Off', fan_only: m === 'FanOnly' }, { el, label: 'Ylikuumenemissuoja' });
  },
  async valet(el) {
    const on = state.data?.vehicle_state?.valet_mode;
    if (on) return runCmd('set_valet_mode', { on: false }, { el, label: 'Valet-tila pois' });
    const pin = await confirmModal({ title: 'Valet-tila päälle', text: 'Anna 4-numeroinen PIN, jolla tila poistetaan autosta.', ok: 'Ota käyttöön', input: { label: 'PIN', type: 'password', inputmode: 'numeric', maxlength: 4 } });
    if (pin) runCmd('set_valet_mode', { on: true, password: pin }, { el, label: 'Valet-tila päällä' });
  },
  async 'pin-to-drive'(el) {
    const on = state.data?.vehicle_state?.pin_to_drive_enabled;
    const pin = await confirmModal({ title: on ? 'PIN ajamiseen pois' : 'PIN ajamiseen päälle', text: on ? 'Anna nykyinen PIN.' : 'Valitse 4-numeroinen PIN.', ok: 'Tallenna', input: { label: 'PIN', type: 'password', inputmode: 'numeric', maxlength: 4 } });
    if (pin) runCmd('set_pin_to_drive', { on: !on, password: pin }, { el, label: on ? 'PIN ajamiseen pois' : 'PIN ajamiseen päällä' });
  },
  async 'speed-on'(el) {
    const pin = await confirmModal({ title: 'Nopeusrajoitin päälle', text: 'Anna 4-numeroinen PIN (asetetaan ensimmäisellä kerralla).', ok: 'Ota käyttöön', input: { label: 'PIN', type: 'password', inputmode: 'numeric', maxlength: 4 } });
    if (pin) runCmd('speed_limit_activate', { pin }, { el, label: 'Nopeusrajoitin päällä' });
  },
  async 'speed-off'(el) {
    const pin = await confirmModal({ title: 'Nopeusrajoitin pois', ok: 'Poista', input: { label: 'PIN', type: 'password', inputmode: 'numeric', maxlength: 4 } });
    if (pin) runCmd('speed_limit_deactivate', { pin }, { el, label: 'Nopeusrajoitin pois' });
  },
  async 'speed-clear'(el) {
    const pin = await confirmModal({ title: 'Tyhjennä nopeusrajoittimen PIN', ok: 'Tyhjennä', input: { label: 'Nykyinen PIN', type: 'password', inputmode: 'numeric', maxlength: 4 } });
    if (pin) runCmd('speed_limit_clear_pin', { pin }, { el, label: 'PIN tyhjennetty' });
  },
  async 'update-at'(el) {
    const t = await confirmModal({ title: 'Ajasta ohjelmistopäivitys', text: 'Valitse kellonaika (seuraavan 24 h sisällä).', ok: 'Ajasta', input: { label: 'Kellonaika', type: 'time', value: '02:00' } });
    if (!t) return;
    const now = new Date(), at = new Date();
    const m = parseHhmm(t);
    at.setHours(Math.floor(m / 60), m % 60, 0, 0);
    if (at <= now) at.setDate(at.getDate() + 1);
    runCmd('schedule_software_update', { offset_sec: Math.round((at - now) / 1000) }, { el, label: `Päivitys ajastettu klo ${t}` });
  },
  'map-pick': (el) => { mapPickMode = !mapPickMode; el.classList.toggle('primary', mapPickMode); if (mapPickMode) toast('Napauta karttaa valitaksesi määränpään', 'info'); },
  'map-center': () => { const ds = state.data?.drive_state; if (map && ds?.latitude != null) map.setView([ds.latitude, ds.longitude], 16); },
  'toggle-day': (el) => el.classList.toggle('active'),
  theme: (el) => { store.theme = el.dataset.theme; applyTheme(); render(); },
  sub: (el) => { state.sub = el.dataset.sub; renderView(); },
  logout: async () => { if (await confirmModal({ title: 'Kirjaudutaanko ulos?', text: 'Tunnukset poistetaan tältä laitteelta. Komentoavain ja asetukset säilyvät.', ok: 'Kirjaudu ulos', danger: true })) { logout(); state.vin = null; state.data = null; state.summary = null; V.resetCommander(); render(); } },
  'pick-vehicle': (el) => { store.vin = el.dataset.vin; state.vin = el.dataset.vin; state.data = null; state.summary = state.vehicles?.find((v) => v.vin === el.dataset.vin); V.resetCommander(); refresh({ force: true }); },
};

function latlon() {
  const ds = state.data?.drive_state || {};
  return ds.latitude != null ? { lat: ds.latitude, lon: ds.longitude } : {};
}

function switchTab(tab) {
  state.tab = tab;
  store.tab = tab;
  render();
  window.scrollTo({ top: 0 });
}

document.addEventListener('click', async (e) => {
  const tabEl = e.target.closest('[data-tab]');
  if (tabEl) return switchTab(tabEl.dataset.tab);
  const cmdEl = e.target.closest('[data-cmd]');
  if (cmdEl) {
    e.preventDefault();
    const params = cmdEl.dataset.params ? JSON.parse(cmdEl.dataset.params) : {};
    return runCmd(cmdEl.dataset.cmd, params, { el: cmdEl, label: cmdEl.dataset.label, confirm: cmdEl.dataset.confirm, danger: !!cmdEl.dataset.danger });
  }
  const actEl = e.target.closest('[data-act]');
  if (actEl) {
    e.preventDefault();
    const name = actEl.dataset.act;
    const fn = ACTIONS[name] || moreActions[name];
    if (fn) return fn(actEl, { state, render, renderView, runCmd, refresh });
  }
});

// Liukusäätimet: päivitä luku vedon aikana, lähetä komento kun päästetään irti.
document.addEventListener('input', (e) => {
  const s = e.target.closest('[data-slider]');
  if (!s) return;
  state.interacting = true;
  const v = +s.value;
  const out = { limit: ['lim-val', `${v} %`], amps: ['amp-val', `${v} A`], speed: ['speed-val', `${v} km/h`] }[s.dataset.slider];
  if (out) document.getElementById(out[0]).textContent = out[1];
});
document.addEventListener('change', async (e) => {
  const s = e.target.closest('[data-slider]');
  if (!s) return;
  state.interacting = false;
  const v = +s.value;
  if (s.dataset.slider === 'limit') await runCmd('set_charge_limit', { percent: v }, { label: `Latausraja ${v} %` });
  if (s.dataset.slider === 'amps') await runCmd('set_charging_amps', { charging_amps: v }, { label: `Latausvirta ${v} A` });
  if (s.dataset.slider === 'speed') await runCmd('speed_limit_set_limit', { limit_mph: Math.round((v / MI) * 10) / 10 }, { label: `Nopeusrajoitus ${v} km/h` });
});
document.addEventListener('pointerup', () => { if (state.interacting) setTimeout(() => { state.interacting = false; }, 50); });

// Lomakkeet
const days = (form, name) => [...form.querySelectorAll(`[data-days="${name}"] button.active`)].map((b) => b.dataset.day).join(',');
const FORMS = {
  'add-precondition': (f, fd) => {
    const d = days(f, 'pre');
    if (!d) return toast('Valitse vähintään yksi päivä', 'err');
    runCmd('add_precondition_schedule', { precondition_time: parseHhmm(fd.get('time')), days_of_week: d, one_time: !!fd.get('one_time'), enabled: true, ...latlon() }, { label: 'Esilämmitysaikataulu lisätty' });
  },
  'add-charge': (f, fd) => {
    const d = days(f, 'chg');
    if (!d) return toast('Valitse vähintään yksi päivä', 'err');
    runCmd('add_charge_schedule', { start_time: parseHhmm(fd.get('start')), start_enabled: true, end_time: parseHhmm(fd.get('end')), end_enabled: true, days_of_week: d, one_time: !!fd.get('one_time'), enabled: true, ...latlon() }, { label: 'Latausaikataulu lisätty' });
  },
  departure: (f, fd) => {
    const pc = fd.get('precond'), op = fd.get('offpeak');
    runCmd('set_scheduled_departure', {
      enable: true,
      departure_time: parseHhmm(fd.get('departure')),
      preconditioning_enabled: pc !== 'off', preconditioning_weekdays_only: pc === 'weekdays',
      off_peak_charging_enabled: op !== 'off', off_peak_charging_weekdays_only: op === 'weekdays',
      end_off_peak_time: parseHhmm(fd.get('offpeak_end')),
    }, { label: 'Ajastettu lähtö tallennettu' });
  },
};
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const fn = FORMS[f.dataset.form] || moreActions[`form:${f.dataset.form}`];
  if (fn) fn(f, new FormData(f), { state, render, renderView, runCmd, refresh });
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (isLoggedIn() || store.demo) && Date.now() - state.updatedAt > 30_000) refresh();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => store.theme === 'auto' && render());

// ---------------- Käynnistys ----------------

async function boot() {
  applyTheme();
  try {
    if (await handleCallback()) { toast('Kirjautuminen onnistui'); store.demo = false; state.tab = 'home'; }
  } catch (e) {
    toast(e.message, 'err', 8000);
  }
  if (!isLoggedIn() && !store.demo) { if (state.tab !== 'more') state.tab = 'home'; return render(); }
  const cache = store.cache;
  if (!store.demo && cache?.vin) { state.vin = cache.vin; state.data = cache.data; state.updatedAt = cache.at; }
  render();
  refresh();
}

boot();
