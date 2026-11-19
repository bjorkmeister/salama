// Auto ylhäältä päin: auton oma väri, kiiltävä pinta, lasikaton läpi näkyvä
// sisätila (istuinlämmitys hehkuu), latauskaapeli, tilasymbolit.

import { icon } from './icons.js';
import { esc, fmtNum, fmtTemp } from './ui.js';
import { store } from './store.js';

// Teslan värikoodit → maalin perussävy
export const PAINTS = {
  PearlWhite: ['#e9eaeb', 'Helmiäisvalkoinen'],
  SolidBlack: ['#1c1e22', 'Musta'],
  ObsidianBlack: ['#1a1b20', 'Obsidiaaninmusta'],
  MidnightSilver: ['#5a5f67', 'Keskiyön hopea'],
  StealthGrey: ['#4a4e55', 'Stealth Grey'],
  Quicksilver: ['#a7acb2', 'Quicksilver'],
  SilverMetallic: ['#b9bdc2', 'Hopea'],
  DeepBlue: ['#233f78', 'Syvänsininen'],
  MarineBlue: ['#1d3a6b', 'Marine Blue'],
  RedMulticoat: ['#a1161f', 'Punainen'],
  UltraRed: ['#b3131c', 'Ultra Red'],
  MidnightCherryRed: ['#5a1219', 'Kirsikanpunainen'],
  Stainless: ['#b4b7b9', 'Ruostumaton teräs'],
};

function paintOf(cfg) {
  const pick = store.settings.carColor;
  const key = pick && pick !== 'auto' ? pick : cfg.exterior_color;
  if (!key) return null;
  const hit = PAINTS[key] || PAINTS[Object.keys(PAINTS).find((k) => key.toLowerCase().includes(k.toLowerCase().replace(/metallic$/, '')))];
  return hit ? hit[0] : null;
}

function mix(hex, to, f) {
  const a = hex.match(/\w\w/g).map((x) => parseInt(x, 16));
  const b = to.match(/\w\w/g).map((x) => parseInt(x, 16));
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * f).toString(16).padStart(2, '0')).join('');
}

const open = (x) => x && x !== 0;

export function carSvg(d) {
  const v = d.vehicle_state || {}, c = d.charge_state || {}, cl = d.climate_state || {}, cfg = d.vehicle_config || {};
  const charging = c.charging_state === 'Charging';
  const plugged = c.charging_state && c.charging_state !== 'Disconnected';
  const paint = paintOf(cfg);
  const base = paint || 'var(--car-body)';
  const dark = paint ? mix(paint, '#000000', 0.45) : 'var(--car-body-2)';
  const light = paint ? mix(paint, '#ffffff', 0.35) : 'var(--car-body)';
  const isLight = paint && parseInt(paint.slice(1, 3), 16) > 150;
  const line = isLight ? mix(paint, '#000000', 0.25) : 'var(--car-line)';
  const heating = cl.is_climate_on && (cl.driver_temp_setting ?? 21) >= (cl.inside_temp ?? 21);
  const cabin = cl.is_climate_on ? (heating ? '#ff8a3d' : '#4cc3ff') : null;
  const seats = [
    ['seat_heater_left', 'M64 196h26a5 5 0 0 1 5 5v30a5 5 0 0 1-5 5H64a5 5 0 0 1-5-5v-30a5 5 0 0 1 5-5z', 77, 216],
    ['seat_heater_right', 'M110 196h26a5 5 0 0 1 5 5v30a5 5 0 0 1-5 5h-26a5 5 0 0 1-5-5v-30a5 5 0 0 1 5-5z', 123, 216],
    ['seat_heater_rear_left', 'M60 258h24a4 4 0 0 1 4 4v24H56v-24a4 4 0 0 1 4-4z', 72, 272],
    ['seat_heater_rear_center', 'M90 258h20a4 4 0 0 1 4 4v24H86v-24a4 4 0 0 1 4-4z', 100, 272],
    ['seat_heater_rear_right', 'M116 258h24a4 4 0 0 1 4 4v24h-32v-24a4 4 0 0 1 4-4z', 128, 272],
  ];
  const doors = [['df', 'M25 150 L-6 214'], ['dr', 'M24 236 L-4 296'], ['pf', 'M175 150 L206 214'], ['pr', 'M176 236 L204 296']];
  const windows = [['fd_window', 'M36 150 L34 226'], ['rd_window', 'M34 240 L36 300'], ['fp_window', 'M164 150 L166 226'], ['rp_window', 'M166 240 L164 300']];
  const rim = (x, y) => `<g><rect x="${x}" y="${y}" width="17" height="58" rx="7" fill="#0a0b0e"/><rect x="${x + 4}" y="${y + 6}" width="9" height="46" rx="4" fill="#2a2e35"/><path d="M${x + 4} ${y + 18}h9M${x + 4} ${y + 29}h9M${x + 4} ${y + 40}h9" stroke="#3b414a" stroke-width="1.2"/></g>`;

  return `<svg class="car" viewBox="0 0 200 420" role="img" aria-label="Auto ylhäältä">
  <defs>
    <linearGradient id="cb" x1="0" x2="1"><stop offset="0" stop-color="${dark}"/><stop offset=".22" stop-color="${base}"/><stop offset=".5" stop-color="${light}"/><stop offset=".78" stop-color="${base}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
    <linearGradient id="gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9fb4c8" stop-opacity=".28"/><stop offset=".45" stop-color="#0b0e13" stop-opacity=".55"/><stop offset="1" stop-color="#0b0e13" stop-opacity=".75"/></linearGradient>
    <radialGradient id="heat"><stop offset="0" stop-color="#ff7a2f" stop-opacity=".95"/><stop offset="1" stop-color="#ff7a2f" stop-opacity="0"/></radialGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="var(--accent)" stop-opacity=".9"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></radialGradient>
    <radialGradient id="beam" cx=".5" cy="1" r="1"><stop offset="0" stop-color="#e8f6ff" stop-opacity=".35"/><stop offset="1" stop-color="#e8f6ff" stop-opacity="0"/></radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
    <clipPath id="cabin"><path d="M46 128Q100 104 154 128L146 182L146 290L152 336Q100 352 48 336L54 290L54 182Z"/></clipPath>
  </defs>
  <ellipse cx="100" cy="214" rx="86" ry="200" fill="#000" opacity=".45" filter="url(#soft)"/>
  ${v.locked === false ? '<path d="M40 22 L20 -40 L180 -40 L160 22Z" fill="url(#beam)"/>' : ''}
  ${rim(11, 68)}${rim(172, 68)}${rim(11, 294)}${rim(172, 294)}
  <path d="M100 14C142 14 166 26 170 62L176 140C179 175 179 250 176 300L171 372C167 402 140 410 100 410C60 410 33 402 29 372L24 300C21 250 21 175 24 140L30 62C34 26 58 14 100 14Z" fill="url(#cb)" stroke="${line}" stroke-width="1.2"/>
  <path d="M100 18C130 18 152 26 160 48" stroke="#fff" stroke-opacity=".18" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M70 30Q100 24 130 30M64 92Q100 84 136 92" stroke="${line}" stroke-opacity=".7" fill="none"/>
  <path d="M100 40V100" stroke="#fff" stroke-opacity=".08" stroke-width="10" stroke-linecap="round"/>
  <ellipse cx="19" cy="146" rx="9" ry="5" fill="${dark}" stroke="${line}"/><ellipse cx="181" cy="146" rx="9" ry="5" fill="${dark}" stroke="${line}"/>
  <path d="M44 26Q60 18 76 20M156 26Q140 18 124 20" stroke="#bfe8ff" stroke-width="3.2" stroke-linecap="round" fill="none"/>
  <path d="M46 404Q70 410 84 408M154 404Q130 410 116 408" stroke="#ff4848" stroke-width="3.2" stroke-linecap="round" fill="none" opacity=".9"/>
  <!-- sisätila -->
  <g clip-path="url(#cabin)">
    <rect x="40" y="110" width="120" height="250" fill="#101318"/>
    ${cabin ? `<rect x="40" y="110" width="120" height="250" fill="${cabin}" opacity=".16"><animate attributeName="opacity" values=".1;.24;.1" dur="3s" repeatCount="indefinite"/></rect>` : ''}
    <path d="M58 168Q100 160 142 168V182H58Z" fill="#1b1f26"/>
    <ellipse cx="77" cy="186" rx="11" ry="4" fill="none" stroke="#454c57" stroke-width="2.5"/>
    <rect x="94" y="200" width="12" height="44" rx="4" fill="#1b1f26"/>
    ${seats.map(([k, p, cx, cy]) => {
      const lvl = cl[k] || 0;
      return `<path d="${p}" fill="#272c35" stroke="#353b46"/>${lvl ? `<circle cx="${cx}" cy="${cy}" r="${10 + lvl * 4}" fill="url(#heat)" opacity="${0.35 + lvl * 0.2}"/>` : ''}`;
    }).join('')}
    <rect x="66" y="194" width="22" height="5" rx="2.5" fill="#323843"/><rect x="112" y="194" width="22" height="5" rx="2.5" fill="#323843"/>
  </g>
  <path d="M46 128Q100 104 154 128L148 176Q100 166 52 176Z" fill="url(#gl)"/>
  <path d="M54 182Q100 174 146 182L146 290Q100 297 54 290Z" fill="url(#gl)" opacity=".75"/>
  <path d="M54 298Q100 305 146 298L152 336Q100 352 48 336Z" fill="url(#gl)"/>
  <path d="M60 186L80 186L66 286L56 286Z" fill="#fff" opacity=".05"/>
  <path d="M24 232H40M160 232H176" stroke="${line}"/>
  ${windows.map(([k, p]) => `<path d="${p}" stroke="${open(v[k]) ? 'var(--cool)' : '#0e1116'}" stroke-width="5" stroke-linecap="round"/>`).join('')}
  ${doors.filter(([k]) => open(v[k])).map(([, p]) => `<path d="${p}" class="open-line" stroke-width="5" stroke-linecap="round"/>`).join('')}
  <g class="hot" data-act="frunk" data-label="Etuluukku"><path class="zone ${open(v.ft) ? 'open' : ''}" d="M40 40Q100 18 160 40L156 118Q100 100 44 118Z"/>
    ${open(v.ft) ? '<path d="M44 40Q100 2 156 40" stroke="var(--warn)" stroke-width="3" fill="none"/>' : ''}</g>
  <g class="hot" data-act="trunk" data-label="Takaluukku"><path class="zone ${open(v.rt) ? 'open' : ''}" d="M46 344Q100 362 154 344L150 400Q100 412 50 400Z"/>
    ${open(v.rt) ? '<path d="M48 404Q100 440 152 404" stroke="var(--warn)" stroke-width="3" fill="none"/>' : ''}</g>
  ${plugged ? `<path d="M22 338C2 352 -14 372 -18 420" stroke="#2c3138" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M22 338C2 352 -14 372 -18 420" stroke="${charging ? 'var(--accent)' : '#5a6270'}" stroke-width="2" fill="none" stroke-linecap="round" stroke-dasharray="${charging ? '4 7' : 'none'}">${charging ? '<animate attributeName="stroke-dashoffset" from="22" to="0" dur=".8s" repeatCount="indefinite"/>' : ''}</path>` : ''}
  <g class="hot" data-act="chargeport" data-label="Latausluukku">
    ${charging ? '<circle cx="24" cy="334" r="22" fill="url(#glow)"><animate attributeName="r" values="14;24;14" dur="2s" repeatCount="indefinite"/></circle>' : ''}
    <circle cx="25" cy="334" r="6.5" fill="${c.charge_port_door_open ? (charging ? 'var(--accent)' : 'var(--warn)') : dark}" stroke="${line}"/>
    <circle cx="25" cy="334" r="14" fill="transparent"/>
  </g>
  <g class="hot" data-act="lock-toggle" data-label="${v.locked ? 'Avaa lukitus' : 'Lukitse'}" transform="translate(100 236)">
    <circle r="19" fill="var(--surface)" fill-opacity=".92" stroke="${v.locked ? 'var(--line)' : 'var(--warn)'}" stroke-width="1.5"/>
    <g transform="translate(-10 -11) scale(.85)" fill="none" stroke="${v.locked ? 'var(--accent)' : 'var(--warn)'}" stroke-width="2" stroke-linecap="round">
      <rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="${v.locked ? 'M8 11V8a4 4 0 0 1 8 0v3' : 'M8 11V8a4 4 0 0 1 7.5-2'}"/></g>
  </g>
  ${v.sentry_mode ? `<g transform="translate(100 138)"><circle r="9" fill="#ff3b3b" opacity=".25"><animate attributeName="r" values="6;13;6" dur="1.8s" repeatCount="indefinite"/></circle><circle r="4" fill="#ff3b3b"/></g>` : ''}
</svg>`;
}

function tires(v) {
  const t = (k, style) => {
    const p = v[k];
    if (p == null) return '';
    return `<span class="tire ${p < 2.5 ? 'low' : ''}" style="${style}">${fmtNum(p, 1)}</span>`;
  };
  return t('tpms_pressure_fl', 'left:-6%;top:21%') + t('tpms_pressure_fr', 'right:-6%;top:21%') + t('tpms_pressure_rl', 'left:-6%;top:75%') + t('tpms_pressure_rr', 'right:-6%;top:75%');
}

/** Aktiiviset tilasymbolit autokuvan alle. */
export function statusChips(d) {
  const v = d.vehicle_state || {}, c = d.charge_state || {}, cl = d.climate_state || {}, su = v.software_update || {};
  const chips = [];
  const add = (ic, text, kind = '') => chips.push(`<span class="schip ${kind}">${icon(ic)}${esc(text)}</span>`);
  add(v.locked ? 'lock' : 'unlock', v.locked ? 'Lukittu' : 'Auki', v.locked ? 'ok' : 'warn');
  if (v.sentry_mode) add('eye', 'Vartiotila', 'alert');
  if (cl.is_climate_on) add('fan', `${cl.climate_keeper_mode && cl.climate_keeper_mode !== 'off' ? { dog: 'Koiratila', camp: 'Leiritila', on: 'Pidä päällä' }[cl.climate_keeper_mode] : 'Ilmastointi'} ${fmtTemp(cl.driver_temp_setting)}`, 'cool');
  if (cl.is_preconditioning) add('thermo', 'Esilämmitys', 'cool');
  if (c.charging_state === 'Charging') add('bolt', `Lataa ${fmtNum(c.charger_power)} kW`, 'ok');
  else if (c.charging_state && c.charging_state !== 'Disconnected') add('plug', c.charging_state === 'Complete' ? 'Ladattu' : 'Kytketty', '');
  if ([v.fd_window, v.fp_window, v.rd_window, v.rp_window].some(open)) add('window', 'Ikkunat auki', 'warn');
  if ([v.df, v.dr, v.pf, v.pr, v.ft, v.rt].some(open)) add('car', 'Ovi tai luukku auki', 'warn');
  if (['tpms_pressure_fl', 'tpms_pressure_fr', 'tpms_pressure_rl', 'tpms_pressure_rr'].some((k) => v[k] != null && v[k] < 2.5)) add('alert', 'Matala rengaspaine', 'warn');
  if (v.is_user_present) add('user', 'Joku autossa', '');
  if (v.valet_mode) add('key', 'Valet-tila', 'warn');
  if (v.speed_limit_mode?.active) add('speed', 'Nopeusrajoitin', '');
  if (su.status && su.status !== '') add('update', su.status === 'available' ? 'Päivitys saatavilla' : 'Päivitys', '');
  if ((c.battery_level ?? 100) < 20) add('battery', 'Akku vähissä', 'alert');
  return `<div class="schips">${chips.join('')}</div>`;
}

export function carHero(d) {
  return `<div class="car-col"><div class="car-wrap">${carSvg(d)}${tires(d.vehicle_state || {})}</div>${statusChips(d)}</div>`;
}
