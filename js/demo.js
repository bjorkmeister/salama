// Demotila: simuloitu auto, jolla käyttöliittymää voi kokeilla ilman Tesla-tiliä.

import { daysMask } from './commands.js';

const VIN = 'DEMO0000000000001';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let asleep = false;

const s = {
  id: 1, vin: VIN, display_name: 'Salama', state: 'online',
  charge_state: {
    battery_level: 72, usable_battery_level: 71, battery_range: 213.4, est_battery_range: 188.2, ideal_battery_range: 240,
    charge_limit_soc: 80, charge_limit_soc_min: 50, charge_limit_soc_max: 100, charge_limit_soc_std: 80,
    charging_state: 'Charging', charger_power: 11, charger_voltage: 229, charger_actual_current: 16, charger_phases: 3,
    charge_current_request: 16, charge_current_request_max: 16, charge_energy_added: 14.6, charge_rate: 28.4,
    minutes_to_full_charge: 54, time_to_full_charge: 0.9, charge_port_door_open: true, charge_port_latch: 'Engaged',
    conn_charge_cable: 'IEC', fast_charger_present: false, scheduled_charging_mode: 'Off', scheduled_charging_pending: false,
    scheduled_departure_time_minutes: 450, preconditioning_enabled: false, off_peak_charging_enabled: false, off_peak_hours_end_time: 360,
  },
  climate_state: {
    inside_temp: 8.5, outside_temp: 2.0, driver_temp_setting: 21.5, passenger_temp_setting: 21.5, min_avail_temp: 15, max_avail_temp: 28,
    is_climate_on: false, is_preconditioning: false, is_front_defroster_on: false, is_rear_defroster_on: false, fan_status: 0,
    seat_heater_left: 0, seat_heater_right: 0, seat_heater_rear_left: 0, seat_heater_rear_center: 0, seat_heater_rear_right: 0,
    steering_wheel_heater: false, steering_wheel_heat_level: 0, auto_steering_wheel_heat: false,
    climate_keeper_mode: 'off', bioweapon_mode: false, cabin_overheat_protection: 'On', cop_activation_temperature: 'High',
    auto_seat_climate_left: true, auto_seat_climate_right: true, defrost_mode: 0,
  },
  drive_state: { latitude: 60.16952, longitude: 24.93545, heading: 38, speed: null, shift_state: null, power: 0, gps_as_of: Math.floor(Date.now() / 1000) },
  gui_settings: { gui_distance_units: 'km/hr', gui_temperature_units: 'C', gui_charge_rate_units: 'kW', gui_24_hour_time: true },
  vehicle_config: { car_type: 'modely', trim_badging: '74d', exterior_color: 'MidnightSilver', rear_seat_heaters: 1, can_actuate_trunks: true, has_seat_cooling: false, sun_roof_installed: null, plg: true, wheel_type: 'Induction20' },
  vehicle_state: {
    vehicle_name: 'Salama', locked: true, sentry_mode: false, sentry_mode_available: true, valet_mode: false, odometer: 21482.6,
    car_version: '2026.38.4 a1b2c3d4e5f6', df: 0, dr: 0, pf: 0, pr: 0, ft: 0, rt: 0,
    fd_window: 0, fp_window: 0, rd_window: 0, rp_window: 0, is_user_present: false, remote_start_enabled: false, homelink_nearby: true,
    tpms_pressure_fl: 2.9, tpms_pressure_fr: 2.9, tpms_pressure_rl: 2.8, tpms_pressure_rr: 2.6,
    media_info: { now_playing_title: 'Kesäyön valssi', now_playing_artist: 'Demo-orkesteri', now_playing_source: 'Spotify', audio_volume: 4.3, audio_volume_max: 10.333, media_playback_status: 'Playing' },
    software_update: { status: 'available', version: '2026.44.1', expected_duration_sec: 2700, download_perc: 100, install_perc: 1, scheduled_time_ms: 0 },
    speed_limit_mode: { active: false, current_limit_mph: 74.56, max_limit_mph: 120, min_limit_mph: 50, pin_code_set: false },
    guest_mode_enabled: false, center_display_state: 0, pin_to_drive_enabled: false,
  },
  charge_schedule_data: { charge_schedules: [{ id: 1730000000, name: 'Yösähkö', days_of_week: 62, start_enabled: true, start_time: 1380, end_enabled: true, end_time: 360, one_time: false, enabled: true, latitude: 60.16952, longitude: 24.93545 }] },
  preconditioning_schedule_data: { precondition_schedules: [{ id: 1730000001, name: 'Työmatka', days_of_week: 62, precondition_time: 450, one_time: false, enabled: true, latitude: 60.16952, longitude: 24.93545 }] },
};

const clone = (o) => JSON.parse(JSON.stringify(o));

export function list() {
  return [{ id: s.id, vin: VIN, display_name: s.vehicle_state.vehicle_name, state: asleep ? 'asleep' : 'online' }];
}

export function data() {
  if (asleep) { const e = new Error('Auto nukkuu (demo)'); e.status = 408; throw e; }
  // Lataus etenee hiljalleen
  const c = s.charge_state;
  if (c.charging_state === 'Charging' && c.battery_level < c.charge_limit_soc) {
    c.battery_level = Math.min(c.charge_limit_soc, c.battery_level + 0.2);
    c.usable_battery_level = Math.floor(c.battery_level);
    c.battery_range = c.battery_level * 2.96;
    c.est_battery_range = c.battery_range * 0.88;
    c.charge_energy_added += 0.15;
    c.minutes_to_full_charge = Math.max(0, Math.round((c.charge_limit_soc - c.battery_level) * 3.4));
  } else if (c.charging_state === 'Charging') {
    Object.assign(c, { charging_state: 'Complete', charger_power: 0, charger_actual_current: 0, minutes_to_full_charge: 0 });
  }
  const cl = s.climate_state;
  if (cl.is_climate_on) cl.inside_temp += (cl.driver_temp_setting - cl.inside_temp) * 0.15;
  s.drive_state.gps_as_of = Math.floor(Date.now() / 1000);
  return { ...clone(s), display_name: s.vehicle_state.vehicle_name };
}

export async function wake() {
  await sleep(1800);
  asleep = false;
  return list()[0];
}

export function setAsleep(v) { asleep = v; }

const SEAT_KEYS = ['seat_heater_left', 'seat_heater_right', 'seat_heater_rear_left', null, 'seat_heater_rear_center', 'seat_heater_rear_right'];

export async function command(name, p = {}) {
  await sleep(350 + Math.random() * 500);
  if (asleep) { const e = new Error('Auto nukkuu (demo)'); e.status = 408; e.asleep = true; throw e; }
  const v = s.vehicle_state, c = s.charge_state, cl = s.climate_state;
  switch (name) {
    case 'door_lock': v.locked = true; break;
    case 'door_unlock': v.locked = false; break;
    case 'actuate_trunk': if (p.which_trunk === 'front') v.ft = 1; else v.rt = v.rt ? 0 : 1; break;
    case 'window_control': { const x = p.command === 'vent' ? 1 : 0; Object.assign(v, { fd_window: x, fp_window: x, rd_window: x, rp_window: x }); break; }
    case 'set_sentry_mode': v.sentry_mode = !!p.on; break;
    case 'set_valet_mode': v.valet_mode = !!p.on; break;
    case 'guest_mode': v.guest_mode_enabled = !!p.enable; break;
    case 'set_pin_to_drive': v.pin_to_drive_enabled = !!p.on; break;
    case 'speed_limit_activate': v.speed_limit_mode.active = true; v.speed_limit_mode.pin_code_set = true; break;
    case 'speed_limit_deactivate': v.speed_limit_mode.active = false; break;
    case 'speed_limit_set_limit': v.speed_limit_mode.current_limit_mph = +p.limit_mph; break;
    case 'remote_start_drive': v.remote_start_enabled = true; break;
    case 'auto_conditioning_start': cl.is_climate_on = true; cl.fan_status = 4; break;
    case 'auto_conditioning_stop': cl.is_climate_on = false; cl.fan_status = 0; cl.is_preconditioning = false; break;
    case 'set_temps': cl.driver_temp_setting = +p.driver_temp; cl.passenger_temp_setting = +(p.passenger_temp ?? p.driver_temp); break;
    case 'set_preconditioning_max': cl.is_front_defroster_on = !!p.on; cl.is_rear_defroster_on = !!p.on; if (p.on) cl.is_climate_on = true; cl.defrost_mode = p.on ? 2 : 0; break;
    case 'set_bioweapon_mode': cl.bioweapon_mode = !!p.on; break;
    case 'set_climate_keeper_mode': cl.climate_keeper_mode = ['off', 'on', 'dog', 'camp'][+p.climate_keeper_mode]; cl.is_climate_on = +p.climate_keeper_mode > 0; break;
    case 'set_cabin_overheat_protection': cl.cabin_overheat_protection = p.on ? (p.fan_only ? 'FanOnly' : 'On') : 'Off'; break;
    case 'set_cop_temp': cl.cop_activation_temperature = ['Low', 'Medium', 'High'][+p.cop_temp]; break;
    case 'remote_seat_heater_request': { const k = SEAT_KEYS[+p.seat_position]; if (k) cl[k] = +p.level; break; }
    case 'remote_steering_wheel_heater_request': cl.steering_wheel_heater = !!p.on; break;
    case 'remote_steering_wheel_heat_level_request': cl.steering_wheel_heat_level = +p.level; cl.steering_wheel_heater = +p.level > 0; break;
    case 'remote_auto_steering_wheel_heat_climate_request': cl.auto_steering_wheel_heat = !!p.on; break;
    case 'remote_auto_seat_climate_request': cl[+p.auto_seat_position === 1 ? 'auto_seat_climate_left' : 'auto_seat_climate_right'] = !!p.auto_climate_on; break;
    case 'charge_start': if (!c.charge_port_door_open) throw new Error('Latausjohto ei ole kytketty'); Object.assign(c, { charging_state: 'Charging', charger_power: 11, charger_actual_current: c.charge_current_request }); break;
    case 'charge_stop': Object.assign(c, { charging_state: 'Stopped', charger_power: 0, charger_actual_current: 0 }); break;
    case 'charge_port_door_open': c.charge_port_door_open = true; break;
    case 'charge_port_door_close': c.charge_port_door_open = false; c.charging_state = 'Disconnected'; break;
    case 'set_charge_limit': c.charge_limit_soc = +p.percent; break;
    case 'charge_max_range': c.charge_limit_soc = 100; break;
    case 'charge_standard': c.charge_limit_soc = 80; break;
    case 'set_charging_amps': c.charge_current_request = +p.charging_amps; if (c.charging_state === 'Charging') { c.charger_actual_current = +p.charging_amps; c.charger_power = Math.round(+p.charging_amps * 0.69); } break;
    case 'set_scheduled_departure': c.preconditioning_enabled = !!(p.enable && (p.preconditioning_enabled || p.preconditioning_weekdays_only)); c.off_peak_charging_enabled = !!(p.enable && (p.off_peak_charging_enabled || p.off_peak_charging_weekdays_only)); c.scheduled_departure_time_minutes = +(p.departure_time || 0); break;
    case 'add_charge_schedule': s.charge_schedule_data.charge_schedules.push({ id: p.id || Date.now(), name: p.name || '', days_of_week: daysMask(p.days_of_week || 'All'), start_enabled: !!p.start_enabled, start_time: +p.start_time || 0, end_enabled: !!p.end_enabled, end_time: +p.end_time || 0, one_time: !!p.one_time, enabled: true, latitude: p.lat, longitude: p.lon }); break;
    case 'remove_charge_schedule': s.charge_schedule_data.charge_schedules = s.charge_schedule_data.charge_schedules.filter((x) => x.id !== +p.id); break;
    case 'add_precondition_schedule': s.preconditioning_schedule_data.precondition_schedules.push({ id: p.id || Date.now(), name: p.name || '', days_of_week: daysMask(p.days_of_week || 'All'), precondition_time: +p.precondition_time, one_time: !!p.one_time, enabled: true, latitude: p.lat, longitude: p.lon }); break;
    case 'remove_precondition_schedule': s.preconditioning_schedule_data.precondition_schedules = s.preconditioning_schedule_data.precondition_schedules.filter((x) => x.id !== +p.id); break;
    case 'media_toggle_playback': v.media_info.media_playback_status = v.media_info.media_playback_status === 'Playing' ? 'Paused' : 'Playing'; break;
    case 'media_volume_up': v.media_info.audio_volume = Math.min(10.333, v.media_info.audio_volume + 0.333); break;
    case 'media_volume_down': v.media_info.audio_volume = Math.max(0, v.media_info.audio_volume - 0.333); break;
    case 'adjust_volume': v.media_info.audio_volume = +p.volume; break;
    case 'media_next_track': v.media_info.now_playing_title = 'Seuraava kappale'; break;
    case 'media_prev_track': v.media_info.now_playing_title = 'Edellinen kappale'; break;
    case 'set_vehicle_name': v.vehicle_name = p.vehicle_name; break;
    case 'schedule_software_update': v.software_update.status = 'scheduled'; v.software_update.scheduled_time_ms = Date.now() + (+p.offset_sec || 0) * 1000; break;
    case 'cancel_software_update': v.software_update.status = 'available'; v.software_update.scheduled_time_ms = 0; break;
    default: break; // muut komennot onnistuvat ilman tilamuutosta
  }
  return { result: true, reason: '' };
}

export function demoPrices() {
  const h0 = Math.floor(Date.now() / 3600000) * 3600000 - 3 * 3600000;
  const hours = [];
  for (let i = 0; i < 40; i++) {
    const t = h0 + i * 3600000, hr = new Date(t).getHours();
    const base = 7 + 6 * Math.sin(((hr - 4) / 24) * 2 * Math.PI) + (hr >= 7 && hr <= 9 ? 6 : 0) + (hr >= 17 && hr <= 20 ? 8 : 0);
    hours.push({ start: t, end: t + 3600000, c: Math.max(0.4, +(base + Math.sin(i * 1.7) * 1.5).toFixed(2)) });
  }
  return { at: Date.now(), source: 'demo (keksityt hinnat)', hours };
}

export function demoSuperchargerHistory() {
  const sites = ['Helsinki – Pasila', 'Espoo – Kehä I', 'Lahti', 'Tampere – Lielahti', 'Oulu'];
  return Array.from({ length: 14 }, (_, i) => {
    const t = Date.now() - (i * 23 + 3) * 86400000;
    const kwh = 25 + ((i * 17) % 40);
    return { siteLocationName: sites[i % sites.length], chargeStartDateTime: new Date(t).toISOString(), fees: [{ feeType: 'CHARGING', currencyCode: 'EUR', usageBase: kwh, totalDue: +(kwh * 0.39).toFixed(2) }] };
  });
}

export const demoInfo = {
  nearby_charging_sites: {
    congestion_sync_time_utc_secs: Math.floor(Date.now() / 1000),
    destination_charging: [{ location: { lat: 60.1712, long: 24.9415 }, name: 'Hotelli Keskusta', type: 'destination', distance_miles: 0.4, amenities: 'lodging' }],
    superchargers: [
      { location: { lat: 60.2055, long: 24.9550 }, name: 'Helsinki – Pasila', type: 'supercharger', distance_miles: 2.3, available_stalls: 7, total_stalls: 12, site_closed: false },
      { location: { lat: 60.2190, long: 25.0790 }, name: 'Helsinki – Itäkeskus', type: 'supercharger', distance_miles: 6.1, available_stalls: 3, total_stalls: 16, site_closed: false },
      { location: { lat: 60.2160, long: 24.7330 }, name: 'Espoo – Kehä I', type: 'supercharger', distance_miles: 8.4, available_stalls: 10, total_stalls: 20, site_closed: false },
    ],
  },
};
