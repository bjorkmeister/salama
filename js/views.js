// Datapohjaiset näkymät: Koti, Ilmasto, Lataus, Turva, Kartta-paneeli.

import { icon } from './icons.js';
import { esc, attr, fmtNum, fmtKm, fmtTemp, hhmm, duration, daysText, DAY_NAMES, km, MI } from './ui.js';
import { carHero } from './car.js';
import { scenesCard, spotCard } from './features.js';

// ---------- Rakennuspalikat ----------

function dataAttrs({ cmd, params, confirm, a, label, danger }) {
  let s = cmd ? `data-cmd="${cmd}"` : `data-act="${a}"`;
  if (params) s += ` data-params="${attr(params)}"`;
  if (confirm) s += ` data-confirm="${esc(confirm)}"`;
  if (danger) s += ' data-danger="1"';
  if (label) s += ` data-label="${esc(label)}"`;
  return s;
}

export function act({ ic, label, sub, on, kind = '', ...rest }) {
  return `<button class="act ${kind} ${on ? 'on' : ''}" ${dataAttrs({ label, ...rest })}>${icon(ic)}<span>${esc(label)}</span>${sub ? `<span class="state">${esc(sub)}</span>` : ''}</button>`;
}

export function btn(label, { ic, cls = '', ...rest } = {}) {
  return `<button class="btn ${cls}" ${dataAttrs({ label, ...rest })}>${ic ? icon(ic) : ''}${esc(label)}</button>`;
}

export function switchRow(title, desc, on, opts) {
  return `<div class="switch-row"><div><div class="t">${esc(title)}</div>${desc ? `<div class="d">${desc}</div>` : ''}</div>
    <button class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${!!on}" aria-label="${esc(title)}" ${dataAttrs({ label: title, ...opts })}></button></div>`;
}

export function seg(items, active, makeAttrs) {
  return `<div class="seg">${items.map(([v, l]) => `<button class="${v === active ? 'active' : ''}" ${makeAttrs(v)}>${esc(l)}</button>`).join('')}</div>`;
}

const card = (title, ic, body, { cls = '', extra = '' } = {}) =>
  `<section class="card ${cls}"><div class="card-head"><h2>${icon(ic)}${esc(title)}</h2>${extra}</div>${body}</section>`;

function daysPicker(name, mask = 127) {
  return `<div class="seg" data-days="${name}">${DAY_NAMES.map(([fi, en, b]) => `<button type="button" class="${mask & b ? 'active' : ''}" data-day="${en}" data-act="toggle-day">${fi}</button>`).join('')}</div>`;
}

// ---------- Auto ylhäältä ----------

export function carSvg(d) {
  const v = d.vehicle_state || {}, c = d.charge_state || {};
  const open = (x) => x && x !== 0;
  const charging = c.charging_state === 'Charging';
  const doors = [
    ['df', 'M25 150 L-6 214'], ['dr', 'M24 236 L-4 296'],
    ['pf', 'M175 150 L206 214'], ['pr', 'M176 236 L204 296'],
  ];
  const windows = [['fd_window', 'M36 150 L34 226'], ['rd_window', 'M34 240 L36 300'], ['fp_window', 'M164 150 L166 226'], ['rp_window', 'M166 240 L164 300']];
  return `<svg class="car" viewBox="0 0 200 420" role="img" aria-label="Auton tila ylhäältä">
  <defs>
    <linearGradient id="cb" x1="0" x2="1"><stop offset="0" stop-color="var(--car-body-2)"/><stop offset=".5" stop-color="var(--car-body)"/><stop offset="1" stop-color="var(--car-body-2)"/></linearGradient>
    <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--car-glass)" stop-opacity=".95"/><stop offset="1" stop-color="var(--car-glass)" stop-opacity=".75"/></linearGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="var(--accent)" stop-opacity=".9"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></radialGradient>
  </defs>
  <g fill="#0b0d11">
    <rect x="11" y="68" width="17" height="58" rx="7"/><rect x="172" y="68" width="17" height="58" rx="7"/>
    <rect x="11" y="294" width="17" height="58" rx="7"/><rect x="172" y="294" width="17" height="58" rx="7"/>
  </g>
  <path d="M100 14C142 14 166 26 170 62L176 140C179 175 179 250 176 300L171 372C167 402 140 410 100 410C60 410 33 402 29 372L24 300C21 250 21 175 24 140L30 62C34 26 58 14 100 14Z" fill="url(#cb)" stroke="var(--car-line)" stroke-width="1.2"/>
  <ellipse cx="19" cy="146" rx="9" ry="5" fill="var(--car-body-2)" stroke="var(--car-line)"/>
  <ellipse cx="181" cy="146" rx="9" ry="5" fill="var(--car-body-2)" stroke="var(--car-line)"/>
  <path d="M44 26Q60 18 76 20M156 26Q140 18 124 20" stroke="var(--cool)" stroke-opacity=".7" stroke-width="3" stroke-linecap="round" fill="none"/>
  <path d="M46 404Q70 410 84 408M154 404Q130 410 116 408" stroke="var(--danger)" stroke-opacity=".75" stroke-width="3" stroke-linecap="round" fill="none"/>
  <path d="M62 44Q100 34 138 44M58 84Q100 76 142 84" stroke="var(--car-line)" fill="none"/>
  <path d="M46 128Q100 104 154 128L148 176Q100 166 52 176Z" fill="url(#cg)"/>
  <path d="M54 182Q100 174 146 182L146 290Q100 297 54 290Z" fill="url(#cg)" opacity=".8"/>
  <path d="M54 298Q100 305 146 298L152 336Q100 352 48 336Z" fill="url(#cg)"/>
  <path d="M24 232H40M160 232H176" stroke="var(--car-line)"/>
  ${windows.map(([k, p]) => `<path d="${p}" stroke="${open(v[k]) ? 'var(--cool)' : 'var(--car-glass)'}" stroke-width="5" stroke-linecap="round"/>`).join('')}
  ${doors.filter(([k]) => open(v[k])).map(([, p]) => `<path d="${p}" class="open-line" stroke-width="5" stroke-linecap="round"/>`).join('')}
  <g class="hot" data-act="frunk" data-label="Etuluukku"><path class="zone ${open(v.ft) ? 'open' : ''}" d="M40 40Q100 18 160 40L156 118Q100 100 44 118Z"/>
    ${open(v.ft) ? '<path d="M44 40Q100 2 156 40" stroke="var(--warn)" stroke-width="3" fill="none"/>' : ''}</g>
  <g class="hot" data-act="trunk" data-label="Takaluukku"><path class="zone ${open(v.rt) ? 'open' : ''}" d="M46 344Q100 362 154 344L150 400Q100 412 50 400Z"/>
    ${open(v.rt) ? '<path d="M48 404Q100 440 152 404" stroke="var(--warn)" stroke-width="3" fill="none"/>' : ''}</g>
  <g class="hot" data-act="chargeport" data-label="Latausluukku">
    ${charging ? '<circle cx="24" cy="334" r="22" fill="url(#glow)"><animate attributeName="r" values="14;24;14" dur="2s" repeatCount="indefinite"/></circle>' : ''}
    <circle cx="25" cy="334" r="7" fill="${c.charge_port_door_open ? (charging ? 'var(--accent)' : 'var(--warn)') : 'var(--car-body-2)'}" stroke="var(--car-line)"/>
    <circle cx="25" cy="334" r="14" fill="transparent"/>
  </g>
  <g class="hot" data-act="lock-toggle" data-label="${v.locked ? 'Avaa lukitus' : 'Lukitse'}" transform="translate(100 236)">
    <circle r="21" fill="var(--surface)" stroke="${v.locked ? 'var(--line)' : 'var(--warn)'}" stroke-width="1.5"/>
    <g transform="translate(-10 -11) scale(.85)" fill="none" stroke="${v.locked ? 'var(--accent)' : 'var(--warn)'}" stroke-width="2" stroke-linecap="round">
      <rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="${v.locked ? 'M8 11V8a4 4 0 0 1 8 0v3' : 'M8 11V8a4 4 0 0 1 7.5-2'}"/></g>
  </g>
  ${v.sentry_mode ? '<g transform="translate(100 150)"><circle r="6" fill="var(--danger)"><animate attributeName="opacity" values="1;.3;1" dur="1.6s" repeatCount="indefinite"/></circle></g>' : ''}
</svg>`;
}

function tires(v) {
  const t = (k, style) => {
    const p = v[k];
    if (p == null) return '';
    return `<span class="tire ${p < 2.5 ? 'low' : ''}" style="${style}">${fmtNum(p, 1)}</span>`;
  };
  return t('tpms_pressure_fl', 'left:-4%;top:21%') + t('tpms_pressure_fr', 'right:-4%;top:21%') + t('tpms_pressure_rl', 'left:-4%;top:75%') + t('tpms_pressure_rr', 'right:-4%;top:75%');
}

export function batteryRing(c) {
  const lvl = c.battery_level ?? 0, lim = c.charge_limit_soc ?? 80;
  const r = 62, C = 2 * Math.PI * r;
  const color = c.charging_state === 'Charging' ? 'var(--accent)' : lvl < 10 ? 'var(--danger)' : lvl < 20 ? 'var(--warn)' : 'var(--accent)';
  const a = (lim / 100) * 2 * Math.PI;
  const tick = (rr) => `${70 + rr * Math.cos(a)} ${70 + rr * Math.sin(a)}`;
  return `<div class="ring"><svg viewBox="0 0 140 140">
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="10"/>
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(C * lvl) / 100} ${C}"/>
    <path d="M${tick(52)}L${tick(72)}" stroke="var(--text)" stroke-opacity=".6" stroke-width="2"/>
  </svg><div class="center"><div class="pct num">${Math.round(lvl)}<small>%</small></div><div class="lbl">raja ${lim} %</div></div></div>`;
}

function chargingText(c) {
  switch (c.charging_state) {
    case 'Charging': return `Lataa ${fmtNum(c.charger_power)} kW · ${c.charger_actual_current ?? '–'} A · valmis ${duration(c.minutes_to_full_charge)}`;
    case 'Complete': return 'Lataus valmis';
    case 'Stopped': return 'Lataus keskeytetty';
    case 'Starting': return 'Lataus käynnistyy…';
    case 'NoPower': return 'Ei virtaa latauslaitteessa';
    case 'Disconnected': return '';
    default: return c.charging_state || '';
  }
}

// ---------- Koti ----------

export function homeView(d, st) {
  const v = d.vehicle_state || {}, c = d.charge_state || {}, cl = d.climate_state || {}, ds = d.drive_state || {}, cfg = d.vehicle_config || {};
  const anyWindow = [v.fd_window, v.fp_window, v.rd_window, v.rp_window].some((x) => x);
  const plugged = c.charging_state && c.charging_state !== 'Disconnected';
  const charging = c.charging_state === 'Charging';
  const m = v.media_info || {};
  const ct = chargingText(c);
  const actions = [
    act({ ic: v.locked ? 'lock' : 'unlock', label: v.locked ? 'Lukittu' : 'Auki', sub: v.locked ? 'Avaa' : 'Lukitse', on: v.locked, cmd: v.locked ? 'door_unlock' : 'door_lock', confirm: v.locked ? 'Avataanko auton lukitus?' : '' }),
    act({ ic: 'fan', label: 'Ilmastointi', sub: cl.is_climate_on ? `Päällä · ${fmtTemp(cl.driver_temp_setting)}` : 'Pois', on: cl.is_climate_on, kind: 'cool', cmd: cl.is_climate_on ? 'auto_conditioning_stop' : 'auto_conditioning_start' }),
    act({ ic: 'frunk', label: 'Etuluukku', sub: v.ft ? 'Auki' : 'Kiinni', on: !!v.ft, kind: 'warn', a: 'frunk' }),
    act({ ic: 'trunk', label: 'Takaluukku', sub: v.rt ? 'Auki' : 'Kiinni', on: !!v.rt, kind: 'warn', a: 'trunk' }),
    act({ ic: 'plug', label: 'Latausluukku', sub: c.charge_port_door_open ? 'Auki' : 'Kiinni', on: c.charge_port_door_open, a: 'chargeport' }),
    plugged ? act({ ic: 'bolt', label: charging ? 'Lopeta lataus' : 'Aloita lataus', sub: charging ? `${fmtNum(c.charger_power)} kW` : c.charging_state === 'Complete' ? 'Valmis' : '', on: charging, cmd: charging ? 'charge_stop' : 'charge_start' }) : '',
    act({ ic: 'eye', label: 'Vartiotila', sub: v.sentry_mode ? 'Päällä' : 'Pois', on: v.sentry_mode, kind: 'warn', cmd: 'set_sentry_mode', params: { on: !v.sentry_mode } }),
    act({ ic: 'window', label: 'Ikkunat', sub: anyWindow ? 'Sulje' : 'Tuuleta', on: anyWindow, kind: 'cool', a: anyWindow ? 'windows-close' : 'windows-vent' }),
    act({ ic: 'light', label: 'Vilkuta valoja', cmd: 'flash_lights' }),
    act({ ic: 'horn', label: 'Äänimerkki', cmd: 'honk_horn' }),
  ].join('');

  const kv = [
    c.est_battery_range != null ? ['Toimintamatka (arvio)', `${fmtKm(c.est_battery_range)} km`] : ['Käytettävä akku', `${c.usable_battery_level ?? '–'} %`],
    ['Sisälämpötila', fmtTemp(cl.inside_temp)],
    ['Ulkolämpötila', fmtTemp(cl.outside_temp)],
    ['Matkamittari', `${fmtKm(v.odometer)} km`],
    ['Ohjelmisto', (v.car_version || '–').split(' ')[0]],
    ['Ajotila', ds.shift_state ? `${ds.shift_state}${ds.speed != null ? ` · ${fmtNum(km(ds.speed))} km/h` : ''}` : 'Pysäköity'],
  ];

  return `<div class="grid">
  <section class="card span-7 live"><div class="hero">
    ${carHero(d)}
    <div class="stats">
      <div class="battery">${batteryRing(c)}
        <div><div class="range-big num">${fmtKm(c.battery_range)} <small>km</small></div>
        <div class="muted small">nimellinen toimintamatka</div>
        ${ct ? `<div class="charging-line">${icon('bolt')}${esc(ct)}</div>` : ''}</div>
      </div>
      <div class="kv">${kv.map(([k, val]) => `<div><div class="k">${k}</div><div class="v num">${esc(val)}</div></div>`).join('')}</div>
    </div>
  </div></section>
  <section class="card span-5 live"><div class="card-head"><h2>${icon('spark')}Pikatoiminnot</h2></div><div class="actions">${actions}</div></section>
  ${scenesCard()}
  <section class="card span-6 live"><div class="card-head"><h2>${icon('music')}Media</h2><span class="muted small">${esc(m.now_playing_source || '')}</span></div>
    <div class="media"><div class="art">${icon('music')}</div><div class="meta">
      <div class="t">${esc(m.now_playing_title || 'Ei toistoa')}</div><div class="muted small">${esc(m.now_playing_artist || '')}</div>
      <div class="bar" style="margin-top:10px;height:6px"><i style="width:${Math.round(((m.audio_volume || 0) / (m.audio_volume_max || 11)) * 100)}%"></i></div></div></div>
    <div class="media-ctrl">
      <button class="round" data-cmd="media_volume_down" data-label="Hiljemmalle" aria-label="Hiljemmalle">${icon('minus')}</button>
      <button class="round" data-cmd="media_prev_track" data-label="Edellinen" aria-label="Edellinen">${icon('prev')}</button>
      <button class="round" data-cmd="media_toggle_playback" data-label="Toista/tauko" aria-label="Toista tai tauko" style="width:60px;height:60px">${icon(m.media_playback_status === 'Playing' ? 'pause' : 'play')}</button>
      <button class="round" data-cmd="media_next_track" data-label="Seuraava" aria-label="Seuraava">${icon('next')}</button>
      <button class="round" data-cmd="media_volume_up" data-label="Kovemmalle" aria-label="Kovemmalle">${icon('plus')}</button>
    </div>
    <div class="row" style="justify-content:center;margin-top:10px">${btn('Edellinen suosikki', { cls: 'sm ghost', cmd: 'media_prev_fav' })}${btn('Seuraava suosikki', { cls: 'sm ghost', cmd: 'media_next_fav' })}</div>
  </section>
  <section class="card span-6 live"><div class="card-head"><h2>${icon('map')}Sijainti</h2>${btn('Avaa kartta', { cls: 'sm', a: 'goto-map' })}</div>
    ${ds.latitude != null ? `<div class="kv">
      <div class="wide"><div class="k">Koordinaatit</div><div class="v num small">${fmtNum(ds.latitude, 5)}, ${fmtNum(ds.longitude, 5)}</div></div>
      <div><div class="k">Suunta</div><div class="v num">${ds.heading ?? '–'}°</div></div>
      <div><div class="k">Päivitetty</div><div class="v small">${ds.gps_as_of ? new Date(ds.gps_as_of * 1000).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }) : '–'}</div></div>
    </div>
    <div class="row" style="margin-top:12px">
      <a class="btn sm" href="https://www.openstreetmap.org/?mlat=${ds.latitude}&mlon=${ds.longitude}#map=17/${ds.latitude}/${ds.longitude}" target="_blank" rel="noopener">${icon('globe')}OpenStreetMap</a>
      <a class="btn sm" href="https://www.google.com/maps/search/?api=1&query=${ds.latitude},${ds.longitude}" target="_blank" rel="noopener">${icon('nav')}Google Maps</a>
      ${v.homelink_nearby ? btn('Kotiovi', { cls: 'sm', ic: 'garage', a: 'homelink' }) : ''}
    </div>` : '<p class="muted small">Sijainti ei saatavilla. Varmista, että kirjautuessa sallittiin sijaintioikeus (vehicle_location).</p>'}
  </section>
  ${softwareCard(v)}
  </div>`;
}

function softwareCard(v) {
  const su = v.software_update || {};
  if (!su.status) return '';
  const when = su.scheduled_time_ms ? new Date(su.scheduled_time_ms).toLocaleString('fi-FI', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const st = { available: 'Päivitys saatavilla', scheduled: `Ajastettu ${when}`, installing: `Asennetaan ${su.install_perc ?? 0} %`, downloading: `Ladataan ${su.download_perc ?? 0} %`, downloading_wifi_wait: 'Odottaa WiFi-yhteyttä' }[su.status] || su.status;
  return `<section class="card span-12 live"><div class="card-head"><h2>${icon('update')}Ohjelmistopäivitys ${esc(su.version || '')}</h2><span class="chip">${esc(st)}</span></div>
    <p class="muted small" style="margin:0 0 12px">Arvioitu kesto ${duration((su.expected_duration_sec || 0) / 60)}. Autoa ei voi käyttää asennuksen aikana.</p>
    <div class="row">${su.status === 'scheduled' ? btn('Peru ajastus', { cmd: 'cancel_software_update' }) : `${btn('Asenna nyt', { cls: 'primary', cmd: 'schedule_software_update', params: { offset_sec: 0 }, confirm: 'Aloitetaanko ohjelmistopäivitys heti? Autoa ei voi käyttää asennuksen aikana.' })}${btn('Asenna 2 h päästä', { cmd: 'schedule_software_update', params: { offset_sec: 7200 } })}${btn('Ajasta yöksi…', { a: 'update-at' })}`}</div>
  </section>`;
}

// ---------- Ilmasto ----------

const SEAT_DEFS = [['seat_heater_left', 0, 'Kuljettaja'], null, ['seat_heater_right', 1, 'Matkustaja'], ['seat_heater_rear_left', 2, 'Taka V'], ['seat_heater_rear_center', 4, 'Taka K'], ['seat_heater_rear_right', 5, 'Taka O']];

export function climateView(d, st) {
  const cl = d.climate_state || {}, cfg = d.vehicle_config || {};
  const t = st.pendingTemp ?? cl.driver_temp_setting ?? 21;
  const keeper = cl.climate_keeper_mode || 'off';
  const seats = SEAT_DEFS.map((s, i) => {
    if (!s || (i >= 3 && !cfg.rear_seat_heaters && cl[s[0]] == null)) return '<div class="seat empty"></div>';
    const lvl = cl[s[0]] || 0;
    return `<button class="seat l${lvl}" data-act="seat-heat" data-seat="${s[1]}" data-level="${lvl}" data-label="${s[2]}">${icon('seat')}<span>${s[2]}</span><span class="bars"><i></i><i></i><i></i></span></button>`;
  }).join('');
  const stw = cl.steering_wheel_heat_level ?? (cl.steering_wheel_heater ? 3 : 0);
  const cop = cl.cabin_overheat_protection || 'Off';
  const copT = cl.cop_activation_temperature || 'High';
  const pre = (d.preconditioning_schedule_data?.precondition_schedules) || [];

  return `<div class="grid">
  <section class="card span-6 live"><div class="card-head"><h2>${icon('fan')}Ilmastointi</h2>
    <button class="switch ${cl.is_climate_on ? 'on' : ''}" role="switch" aria-label="Ilmastointi" data-cmd="${cl.is_climate_on ? 'auto_conditioning_stop' : 'auto_conditioning_start'}" data-label="Ilmastointi"></button></div>
    <div class="temp">
      <button class="round" data-act="temp" data-delta="-0.5" aria-label="Viileämmäksi">${icon('minus')}</button>
      <div class="val num" id="temp-val">${fmtNum(t, 1)}<small>°C</small></div>
      <button class="round" data-act="temp" data-delta="0.5" aria-label="Lämpimämmäksi">${icon('plus')}</button>
    </div>
    <div class="temps-io"><span>Sisällä <b>${fmtTemp(cl.inside_temp)}</b></span><span>Ulkona <b>${fmtTemp(cl.outside_temp)}</b></span>${cl.is_preconditioning ? '<span style="color:var(--accent)">Esilämmitys käynnissä</span>' : ''}</div>
    <div class="actions" style="margin-top:16px">
      ${act({ ic: 'defrost', label: 'Max-sulatus', on: cl.defrost_mode === 2 || cl.is_front_defroster_on, kind: 'warn', cmd: 'set_preconditioning_max', params: { on: !(cl.defrost_mode === 2 || cl.is_front_defroster_on) } })}
      ${act({ ic: 'fan', label: 'Pidä päällä', on: keeper === 'on', kind: 'cool', cmd: 'set_climate_keeper_mode', params: { climate_keeper_mode: keeper === 'on' ? 0 : 1 } })}
      ${act({ ic: 'dog', label: 'Koiratila', on: keeper === 'dog', kind: 'cool', cmd: 'set_climate_keeper_mode', params: { climate_keeper_mode: keeper === 'dog' ? 0 : 2 } })}
      ${act({ ic: 'tent', label: 'Leiritila', on: keeper === 'camp', kind: 'cool', cmd: 'set_climate_keeper_mode', params: { climate_keeper_mode: keeper === 'camp' ? 0 : 3 } })}
      ${act({ ic: 'biohazard', label: 'Bioase-suoja', on: cl.bioweapon_mode, kind: 'warn', cmd: 'set_bioweapon_mode', params: { on: !cl.bioweapon_mode, manual_override: true } })}
    </div>
  </section>
  <section class="card span-6 live"><div class="card-head"><h2>${icon('seat')}Istuimet ja ratti</h2><span class="muted small">napauta: pois → 1 → 2 → 3</span></div>
    <div class="seats">${seats}</div>
    ${cfg.has_seat_cooling ? `<p class="muted small" style="margin:14px 0 6px">Istuinten tuuletus</p><div class="seats">
      ${[['seat_fan_front_left', 1, 'Kuljettaja'], null, ['seat_fan_front_right', 2, 'Matkustaja']].map((s) => s ? `<button class="seat cool l${cl[s[0]] || 0}" data-act="seat-cool" data-seat="${s[1]}" data-level="${cl[s[0]] || 0}" data-label="${s[2]}">${icon('fan')}<span>${s[2]}</span><span class="bars"><i></i><i></i><i></i></span></button>` : '<div class="seat empty"></div>').join('')}</div>` : ''}
    <div style="margin-top:14px">
      <div class="switch-row"><div><div class="t">Ratin lämmitys</div><div class="d">${stw ? (stw >= 3 ? 'Korkea' : 'Matala') : 'Pois'}</div></div>
        ${seg([[0, 'Pois'], [1, 'Matala'], [3, 'Korkea']], stw >= 3 ? 3 : stw ? 1 : 0, (lv) => `data-act="stw" data-level="${lv}"`)}</div>
      ${switchRow('Automaattinen istuinilmastointi (kuljettaja)', '', cl.auto_seat_climate_left, { cmd: 'remote_auto_seat_climate_request', params: { auto_seat_position: 1, auto_climate_on: !cl.auto_seat_climate_left } })}
      ${switchRow('Automaattinen istuinilmastointi (matkustaja)', '', cl.auto_seat_climate_right, { cmd: 'remote_auto_seat_climate_request', params: { auto_seat_position: 2, auto_climate_on: !cl.auto_seat_climate_right } })}
      ${switchRow('Automaattinen ratin lämmitys', '', cl.auto_steering_wheel_heat, { cmd: 'remote_auto_steering_wheel_heat_climate_request', params: { on: !cl.auto_steering_wheel_heat } })}
    </div>
  </section>
  <section class="card span-6 live"><div class="card-head"><h2>${icon('sun')}Ylikuumenemissuoja</h2></div>
    <div class="stack">
      ${seg([['Off', 'Pois'], ['On', 'Ilmastointi'], ['FanOnly', 'Vain puhallin']], cop, (v) => `data-act="cop" data-mode="${v}"`)}
      <div class="muted small">Käynnistyy kun matkustamo lämpenee yli:</div>
      ${seg([['Low', '30 °C'], ['Medium', '35 °C'], ['High', '40 °C']], copT, (v) => `data-cmd="set_cop_temp" data-params="${attr({ cop_temp: ['Low', 'Medium', 'High'].indexOf(v) })}" data-label="Aktivointilämpötila"`)}
    </div>
  </section>
  <section class="card span-6 live"><div class="card-head"><h2>${icon('clock')}Esilämmitysaikataulut</h2></div>
    <div class="list">${pre.length ? pre.map((p) => `<div class="item">${icon('calendar')}<div class="grow"><div class="t">${hhmm(p.precondition_time)} ${esc(p.name || '')}</div>
      <div class="muted small">${daysText(p.days_of_week)}${p.one_time ? ' · kerran' : ''}${p.enabled === false ? ' · pois käytöstä' : ''}</div></div>
      ${btn('Poista', { cls: 'sm danger', ic: 'trash', cmd: 'remove_precondition_schedule', params: { id: p.id }, confirm: 'Poistetaanko aikataulu?' })}</div>`).join('') : '<p class="muted small">Ei aikatauluja.</p>'}</div>
    <form class="stack" data-form="add-precondition" style="margin-top:12px">
      <div class="row"><input class="input" type="time" name="time" value="07:30" style="max-width:130px" required>${daysPicker('pre', 62)}</div>
      <div class="row"><label class="row small"><input type="checkbox" name="one_time"> Vain kerran</label><span class="grow"></span><button class="btn sm primary" type="submit">${icon('plus')}Lisää aikataulu</button></div>
    </form>
  </section>
  </div>`;
}

// ---------- Lataus ----------

export function chargeView(d, st) {
  const c = d.charge_state || {};
  const ct = chargingText(c) || (c.charging_state === 'Disconnected' ? 'Latausjohto ei ole kytketty' : '');
  const charging = c.charging_state === 'Charging';
  const plugged = c.charging_state && c.charging_state !== 'Disconnected';
  const maxA = c.charge_current_request_max || 32;
  const sch = d.charge_schedule_data?.charge_schedules || [];
  const dep = c.scheduled_departure_time_minutes ?? 450;
  return `<div class="grid">
  <section class="card span-7 live"><div class="card-head"><h2>${icon('bolt')}Lataus</h2><span class="chip">${esc(c.fast_charger_present ? `Pikalataus ${c.fast_charger_type || ''}` : c.conn_charge_cable || (plugged ? 'Kytketty' : 'Ei kytketty'))}</span></div>
    <div class="battery">${batteryRing(c)}<div style="flex:1;min-width:0">
      <div class="range-big num">${fmtKm(c.battery_range)} <small>km</small></div>
      <div class="muted small">arvio ${fmtKm(c.est_battery_range)} km</div>
      ${ct ? `<div class="charging-line">${icon('bolt')}${esc(ct)}</div>` : ''}
    </div></div>
    <div class="kv" style="margin-top:14px">
      <div><div class="k">Teho</div><div class="v num">${fmtNum(c.charger_power ?? 0)} kW</div></div>
      <div><div class="k">Virta / jännite</div><div class="v num">${c.charger_actual_current ?? 0} A · ${c.charger_voltage ?? 0} V</div></div>
      <div><div class="k">Lisätty energia</div><div class="v num">${fmtNum(c.charge_energy_added, 1)} kWh</div></div>
      <div><div class="k">Latausnopeus</div><div class="v num">${fmtNum(km(c.charge_rate))} km/h</div></div>
      <div><div class="k">Aikaa jäljellä</div><div class="v num">${charging ? duration(c.minutes_to_full_charge) : '–'}</div></div>
      <div><div class="k">Käytettävä akku</div><div class="v num">${c.usable_battery_level ?? '–'} %</div></div>
    </div>
    <div class="row" style="margin-top:14px">
      ${plugged ? btn(charging ? 'Lopeta lataus' : 'Aloita lataus', { cls: charging ? '' : 'primary', ic: 'bolt', cmd: charging ? 'charge_stop' : 'charge_start' }) : ''}
      ${btn(c.charge_port_door_open ? 'Sulje latausluukku' : 'Avaa latausluukku', { ic: 'plug', cmd: c.charge_port_door_open ? 'charge_port_door_close' : 'charge_port_door_open' })}
    </div>
  </section>
  <section class="card span-5 live"><div class="card-head"><h2>${icon('battery')}Latausraja</h2></div>
    <div class="slider-head"><span class="big num" id="lim-val">${c.charge_limit_soc ?? 80} %</span><span class="muted small">päivittäinen 80–90 %</span></div>
    <input class="slider" type="range" min="${c.charge_limit_soc_min ?? 50}" max="${c.charge_limit_soc_max ?? 100}" step="1" value="${c.charge_limit_soc ?? 80}" data-slider="limit" aria-label="Latausraja">
    <div class="row">${btn('Vakio', { cls: 'sm', cmd: 'charge_standard' })}${btn('80 %', { cls: 'sm', cmd: 'set_charge_limit', params: { percent: 80 } })}${btn('90 %', { cls: 'sm', cmd: 'set_charge_limit', params: { percent: 90 } })}${btn('Maksimi', { cls: 'sm', cmd: 'charge_max_range', confirm: 'Ladataanko 100 %:iin? Suositeltavaa vain pitkille matkoille.' })}</div>
    <div class="card-head" style="margin-top:20px"><h2>${icon('plug')}Latausvirta</h2></div>
    <div class="slider-head"><span class="big num" id="amp-val">${c.charge_current_request ?? maxA} A</span><span class="muted small">max ${maxA} A${c.charger_phases ? ` · ${c.charger_phases}-vaihe` : ''}</span></div>
    <input class="slider" type="range" min="1" max="${maxA}" step="1" value="${c.charge_current_request ?? maxA}" data-slider="amps" aria-label="Latausvirta">
  </section>
  <section class="card span-6 live"><div class="card-head"><h2>${icon('clock')}Ajastettu lähtö</h2></div>
    <form class="stack" data-form="departure">
      <label class="field">Lähtöaika<input class="input" type="time" name="departure" value="${hhmm(dep)}" style="max-width:140px"></label>
      <div class="switch-row"><div><div class="t">Esilämmitys lähtöön</div><div class="d">Akku ja matkustamo valmiiksi</div></div>
        <select class="input" name="precond" style="max-width:160px"><option value="off">Pois</option><option value="all" ${c.preconditioning_enabled && !c.preconditioning_weekdays_only ? 'selected' : ''}>Joka päivä</option><option value="weekdays" ${c.preconditioning_weekdays_only ? 'selected' : ''}>Arkisin</option></select></div>
      <div class="switch-row"><div><div class="t">Edullinen yösähkö</div><div class="d">Lataa halvan jakson aikana</div></div>
        <select class="input" name="offpeak" style="max-width:160px"><option value="off">Pois</option><option value="all" ${c.off_peak_charging_enabled && !c.off_peak_charging_weekdays_only ? 'selected' : ''}>Joka päivä</option><option value="weekdays" ${c.off_peak_charging_weekdays_only ? 'selected' : ''}>Arkisin</option></select></div>
      <label class="field">Edullinen jakso päättyy<input class="input" type="time" name="offpeak_end" value="${hhmm(c.off_peak_hours_end_time ?? 360)}" style="max-width:140px"></label>
      <div class="row end"><button type="button" class="btn sm" data-cmd="set_scheduled_departure" data-params="${attr({ enable: false })}" data-label="Ajastettu lähtö pois">Poista käytöstä</button><button class="btn sm primary" type="submit">Tallenna</button></div>
    </form>
  </section>
  <section class="card span-6 live"><div class="card-head"><h2>${icon('calendar')}Latausaikataulut</h2></div>
    <div class="list">${sch.length ? sch.map((s) => `<div class="item">${icon('bolt')}<div class="grow"><div class="t">${s.start_enabled ? hhmm(s.start_time) : '–'} → ${s.end_enabled ? hhmm(s.end_time) : '–'} ${esc(s.name || '')}</div>
      <div class="muted small">${daysText(s.days_of_week)}${s.one_time ? ' · kerran' : ''}${s.enabled === false ? ' · pois käytöstä' : ''}</div></div>
      ${btn('Poista', { cls: 'sm danger', ic: 'trash', cmd: 'remove_charge_schedule', params: { id: s.id }, confirm: 'Poistetaanko latausaikataulu?' })}</div>`).join('') : '<p class="muted small">Ei aikatauluja.</p>'}</div>
    <form class="stack" data-form="add-charge" style="margin-top:12px">
      <div class="row"><label class="field">Alku<input class="input" type="time" name="start" value="23:00" style="max-width:130px"></label><label class="field">Loppu<input class="input" type="time" name="end" value="06:00" style="max-width:130px"></label></div>
      ${daysPicker('chg', 127)}
      <div class="row"><label class="row small"><input type="checkbox" name="one_time"> Vain kerran</label><span class="grow"></span><button class="btn sm primary" type="submit">${icon('plus')}Lisää</button></div>
      <p class="muted tiny" style="margin:0">Aikataulu sidotaan auton nykyiseen sijaintiin.</p>
    </form>
  </section>
  ${spotCard(d, st)}
  ${nearbyCard(st)}
  </div>`;
}

export function nearbyCard(st) {
  const n = st.nearby;
  const rows = n ? [...(n.superchargers || []).map((x) => ({ ...x, sc: true })), ...(n.destination_charging || [])] : [];
  return `<section class="card span-12"><div class="card-head"><h2>${icon('plug')}Lähimmät latauspaikat</h2>${btn(n ? 'Päivitä' : 'Hae', { cls: 'sm', ic: 'refresh', a: 'nearby' })}</div>
    ${n ? `<div class="list">${rows.map((x) => `<div class="item">${icon(x.sc ? 'bolt' : 'plug')}<div class="grow"><div class="t">${esc(x.name)}</div>
      <div class="muted small">${fmtNum((x.distance_miles || 0) * MI, 1)} km${x.sc ? ` · vapaana ${x.available_stalls}/${x.total_stalls}` : ' · kohdelataus'}${x.site_closed ? ' · suljettu' : ''}</div></div>
      ${btn('Navigoi', { cls: 'sm', ic: 'nav', cmd: 'navigation_gps_request', params: { lat: x.location.lat, lon: x.location.long, order: 0 }, label: `Navigointi: ${x.name}` })}</div>`).join('') || '<p class="muted small">Ei latauspaikkoja lähistöllä.</p>'}</div>`
      : '<p class="muted small">Hakee Teslan latauspaikat auton lähistöltä (vaatii hereillä olevan auton).</p>'}
  </section>`;
}

// ---------- Turva ----------

export function securityView(d, st) {
  const v = d.vehicle_state || {}, cfg = d.vehicle_config || {}, c = d.charge_state || {};
  const sl = v.speed_limit_mode || {};
  const anyWindow = [v.fd_window, v.fp_window, v.rd_window, v.rp_window].some((x) => x);
  const isCT = cfg.car_type === 'cybertruck';
  const limitKmh = Math.round(km(sl.current_limit_mph || 74.56));
  return `<div class="grid">
  <section class="card span-6 live"><div class="card-head"><h2>${icon('lock')}Lukitus ja luukut</h2></div>
    ${switchRow('Ovet lukittu', v.locked ? 'Auto on lukittu' : '<span style="color:var(--warn)">Auto on auki</span>', v.locked, { cmd: v.locked ? 'door_unlock' : 'door_lock', confirm: v.locked ? 'Avataanko auton lukitus?' : '' })}
    <div class="actions" style="margin-top:8px">
      ${act({ ic: 'frunk', label: 'Etuluukku', sub: v.ft ? 'Auki' : 'Avaa', on: !!v.ft, kind: 'warn', a: 'frunk' })}
      ${act({ ic: 'trunk', label: 'Takaluukku', sub: v.rt ? 'Sulje' : 'Avaa', on: !!v.rt, kind: 'warn', a: 'trunk' })}
      ${act({ ic: 'window', label: 'Tuuleta ikkunat', on: anyWindow, kind: 'cool', a: 'windows-vent' })}
      ${act({ ic: 'window', label: 'Sulje ikkunat', a: 'windows-close' })}
      ${act({ ic: 'plug', label: 'Latausluukku', sub: c.charge_port_door_open ? 'Sulje' : 'Avaa', on: c.charge_port_door_open, a: 'chargeport' })}
      ${cfg.sun_roof_installed ? act({ ic: 'sun', label: 'Kattoluukku', sub: 'Tuuleta', cmd: 'sun_roof_control', params: { state: 'vent' } }) + act({ ic: 'sun', label: 'Kattoluukku', sub: 'Sulje', cmd: 'sun_roof_control', params: { state: 'close' } }) : ''}
      ${isCT ? act({ ic: 'tonneau', label: 'Lavakate', sub: 'Avaa', cmd: 'open_tonneau' }) + act({ ic: 'tonneau', label: 'Lavakate', sub: 'Sulje', cmd: 'close_tonneau' }) + act({ ic: 'tonneau', label: 'Lavakate', sub: 'Pysäytä', cmd: 'stop_tonneau' }) : ''}
    </div>
  </section>
  <section class="card span-6 live"><div class="card-head"><h2>${icon('shield')}Valvonta</h2></div>
    ${switchRow('Vartiotila', 'Kamerat valvovat pysäköityä autoa', v.sentry_mode, { cmd: 'set_sentry_mode', params: { on: !v.sentry_mode } })}
    ${switchRow('Vierastila', 'Rajoittaa auton asetuksia vieraalle kuljettajalle', v.guest_mode_enabled, { cmd: 'guest_mode', params: { enable: !v.guest_mode_enabled } })}
    ${switchRow('Pysäköintipalvelutila (valet)', 'Rajoittaa nopeutta ja piilottaa henkilötiedot', v.valet_mode, { a: 'valet' })}
    ${switchRow('PIN ajamiseen', 'Vaatii PIN-koodin ennen ajoa', v.pin_to_drive_enabled, { a: 'pin-to-drive' })}
    <div class="row" style="margin-top:10px">${btn('Nollaa valet-PIN', { cls: 'sm', cmd: 'reset_valet_pin', confirm: 'Nollataanko valet-tilan PIN-koodi?' })}${btn('Nollaa ajo-PIN', { cls: 'sm', cmd: 'reset_pin_to_drive_pin', confirm: 'Nollataanko PIN ajamiseen -koodi?' })}${btn('Poista ajo-PIN (admin)', { cls: 'sm', cmd: 'clear_pin_to_drive_admin', confirm: 'Poistetaanko PIN ajamiseen -koodi omistajan oikeuksin?' })}</div>
  </section>
  <section class="card span-6 live"><div class="card-head"><h2>${icon('speed')}Nopeusrajoitin</h2><span class="chip">${sl.active ? 'Käytössä' : 'Pois'}</span></div>
    <div class="slider-head"><span class="big num" id="speed-val">${limitKmh} km/h</span><span class="muted small">${Math.round(km(sl.min_limit_mph || 50))}–${Math.round(km(sl.max_limit_mph || 120))} km/h</span></div>
    <input class="slider" type="range" min="${Math.round(km(sl.min_limit_mph || 50))}" max="${Math.round(km(sl.max_limit_mph || 120))}" step="1" value="${limitKmh}" data-slider="speed" aria-label="Nopeusrajoitus">
    <div class="row">${btn(sl.active ? 'Poista käytöstä' : 'Ota käyttöön', { cls: sl.active ? '' : 'primary', a: sl.active ? 'speed-off' : 'speed-on' })}${btn('Tyhjennä PIN', { cls: 'sm', a: 'speed-clear' })}${btn('Tyhjennä PIN (admin)', { cls: 'sm', cmd: 'speed_limit_clear_pin_admin', confirm: 'Tyhjennetäänkö nopeusrajoittimen PIN omistajan oikeuksin?' })}</div>
  </section>
  <section class="card span-6 live"><div class="card-head"><h2>${icon('key')}Etäkäyttö</h2></div>
    <p class="muted small" style="margin:0 0 12px">Avaimeton ajo sallii auton käynnistämisen ilman puhelinta tai avainkorttia kahden minuutin ajan.</p>
    <div class="row">${btn('Salli avaimeton ajo', { ic: 'key', cmd: 'remote_start_drive', confirm: 'Sallitaanko auton ajaminen ilman avainta seuraavat 2 minuuttia?' })}
    ${v.homelink_nearby ? btn('Avaa kotiovi (HomeLink)', { ic: 'garage', a: 'homelink' }) : ''}</div>
  </section>
  </div>`;
}
