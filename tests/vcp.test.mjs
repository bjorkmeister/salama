import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = new URL('..', import.meta.url).pathname;
const P = ROOT + 'js/';
const { initProto, getTypes, encode } = await import(P + 'proto.js');
const { generateKeyPair, loadKey, publicKeyPem, privateKeyPem, importPrivatePem } = await import(P + 'keys.js');
const { VehicleCommander, DOMAIN_VCSEC, DOMAIN_INFOTAINMENT } = await import(P + 'vcp.js');
const { COMMANDS } = await import(P + 'commands.js');
initProto(require('protobufjs'), require(ROOT + 'proto/tesla.json'));
const T = getTypes();
const VIN = '5YJ3E1EA7KF000001';
const PORT = process.env.PORT;
const jwk = await generateKeyPair();
// PEM-kierrätys
const pemPriv = await privateKeyPem(jwk); const jwk2 = await importPrivatePem(pemPriv);
if (jwk2.d !== jwk.d) throw new Error('PEM roundtrip failed');
console.log((await publicKeyPem(jwk)).split('\n')[0]);
const key = await loadKey(jwk);
let calls = 0;
const c = new VehicleCommander({ vin: VIN, key, transport: async (b64) => {
  calls++;
  const r = await fetch(`http://127.0.0.1:${PORT}/api/1/vehicles/${VIN}/signed_command`, { method: 'POST', body: JSON.stringify({ routable_message: b64 }) });
  return (await r.json()).response;
}});
const send = (name, p={}) => { const d = COMMANDS[name]; return d.vcsec ? c.send(DOMAIN_VCSEC, encode(T.UnsignedMessage, d.vcsec(p))) : c.send(DOMAIN_INFOTAINMENT, encode(T.Action, { vehicleAction: d.info(p) })); };
console.log('honk', JSON.stringify(await send('honk_horn')));
console.log('lock', JSON.stringify(await send('door_lock')));
// replay: pakota laskuri taaksepäin -> auto antaa INVALID_TOKEN_OR_COUNTER + session info -> uusinta
c.sessions[DOMAIN_INFOTAINMENT].counter = 0;
console.log('after counter reset', JSON.stringify(await send('flash_lights')));
// epoch reset: pilaa epoch
c.sessions[DOMAIN_INFOTAINMENT].epoch = new Uint8Array(16);
console.log('after epoch corrupt', JSON.stringify(await send('charge_start')));
const params = {
  actuate_trunk: { which_trunk: 'front' }, window_control: { command: 'vent' }, sun_roof_control: { state: 'vent' },
  trigger_homelink: { lat: 60.17, lon: 24.94 }, remote_boombox: { sound: 2000 }, set_temps: { driver_temp: 21.5, passenger_temp: 20 },
  set_preconditioning_max: { on: true }, set_bioweapon_mode: { on: true, manual_override: true }, set_climate_keeper_mode: { climate_keeper_mode: 2 },
  set_cabin_overheat_protection: { on: true, fan_only: false }, set_cop_temp: { cop_temp: 1 }, remote_seat_heater_request: { seat_position: 1, level: 3 },
  remote_seat_cooler_request: { seat_position: 1, seat_cooler_level: 2 }, remote_auto_seat_climate_request: { auto_seat_position: 1, auto_climate_on: true },
  remote_steering_wheel_heater_request: { on: true }, remote_steering_wheel_heat_level_request: { level: 3 }, remote_auto_steering_wheel_heat_climate_request: { on: true },
  set_charge_limit: { percent: 80 }, set_charging_amps: { charging_amps: 16 }, set_scheduled_charging: { enable: true, time: 120 },
  set_scheduled_departure: { enable: true, departure_time: 450, preconditioning_enabled: true, off_peak_charging_weekdays_only: true, end_off_peak_time: 360 },
  add_charge_schedule: { days_of_week: 'Mon,Tue', start_enabled: true, start_time: 60, lat: 60.1, lon: 24.9, id: 123 }, remove_charge_schedule: { id: 123 },
  batch_remove_charge_schedules: { home: true }, add_precondition_schedule: { days_of_week: 'All', precondition_time: 450, lat: 60.1, lon: 24.9, id: 5 },
  remove_precondition_schedule: { id: 5 }, batch_remove_precondition_schedules: { work: true }, set_sentry_mode: { on: true }, set_valet_mode: { on: true, password: '1234' },
  set_pin_to_drive: { on: true, password: '1234' }, speed_limit_activate: { pin: '1234' }, speed_limit_deactivate: { pin: '1234' }, speed_limit_set_limit: { limit_mph: 70 },
  speed_limit_clear_pin: { pin: '1234' }, guest_mode: { enable: true }, parental_controls_activate: { pin: '1234' }, parental_controls_deactivate: { pin: '1234' },
  parental_controls_set_speed_limit: { limit_mph: 60 }, adjust_volume: { volume: 5.5 }, navigation_gps_request: { lat: 60.1, lon: 24.9 }, navigation_sc_request: { id: 1 },
  navigation_waypoints_request: { waypoints: 'refId:1' }, schedule_software_update: { offset_sec: 7200 }, set_vehicle_name: { vehicle_name: 'Salama' },
  set_low_power_mode: { enable: true }, keep_accessory_power_mode: { enable: true },
};
let n = 0;
for (const [name, def] of Object.entries(COMMANDS)) {
  if (def.rest) continue;
  await send(name, params[name] || {}); n++;
}
console.log('ALL OK commands:', n, 'http calls:', calls);
