// Kaikki Fleet API:n ajoneuvokomennot.
//
// Jokainen komento ottaa parametrit Teslan REST-muodossa (samat nimet kuin
// developer.tesla.com-dokumentaatiossa). Allekirjoitetussa tilassa parametrit
// muunnetaan Vehicle Command Protocolin protobuf-viestiksi:
//   vcsec(p)  -> VCSEC.UnsignedMessage   (lukot, luukut, etäkäynnistys)
//   info(p)   -> CarServer.VehicleAction (kaikki muu)
// rest: true tarkoittaa, että komento lähetetään aina REST-rajapintaan
// (Teslan oma vehicle-command-proxy toimii samoin näiden kanssa).

const SEATS = ['CAR_SEAT_FRONT_LEFT', 'CAR_SEAT_FRONT_RIGHT', 'CAR_SEAT_REAR_LEFT', 'CAR_SEAT_REAR_LEFT_BACK', 'CAR_SEAT_REAR_CENTER', 'CAR_SEAT_REAR_RIGHT', 'CAR_SEAT_REAR_RIGHT_BACK', 'CAR_SEAT_THIRD_ROW_LEFT', 'CAR_SEAT_THIRD_ROW_RIGHT'];
const HEAT = ['SEAT_HEATER_OFF', 'SEAT_HEATER_LOW', 'SEAT_HEATER_MED', 'SEAT_HEATER_HIGH'];
const STW_LEVEL = { 0: 1, 1: 2, 3: 3 }; // REST 0/1/3 -> StwHeatLevel Off/Low/High
const DAYS = { SUN: 1, SUNDAY: 1, MON: 2, MONDAY: 2, TUE: 4, TUES: 4, TUESDAY: 4, WED: 8, WEDNESDAY: 8, THU: 16, THURS: 16, THURSDAY: 16, FRI: 32, FRIDAY: 32, SAT: 64, SATURDAY: 64, ALL: 127, WEEKDAYS: 62 };

export function daysMask(v) {
  if (typeof v === 'number') return v;
  return String(v || '').split(',').reduce((m, d) => {
    const k = d.trim().toUpperCase();
    if (!k) return m;
    if (!(k in DAYS)) throw new Error(`Tuntematon viikonpäivä: ${d}`);
    return m | DAYS[k];
  }, 0);
}

const req = (p, k) => {
  if (p[k] === undefined || p[k] === null || p[k] === '') throw new Error(`Parametri puuttuu: ${k}`);
  return p[k];
};
const pin4 = (v) => {
  if (!/^\d{4}$/.test(String(v))) throw new Error('PIN-koodin pitää olla 4 numeroa');
  return String(v);
};
const policy = (enabled, weekdays) => (weekdays ? { weekdays: {} } : enabled ? { all_week: {} } : undefined);

export const COMMANDS = {
  // --- Lukot, luukut, valot ---
  door_lock: { vcsec: () => ({ RKEAction: 1 }) },
  door_unlock: { vcsec: () => ({ RKEAction: 0 }) },
  actuate_trunk: { vcsec: (p) => ({ closureMoveRequest: { [p.which_trunk === 'front' ? 'frontTrunk' : 'rearTrunk']: 1 } }) },
  open_tonneau: { vcsec: () => ({ closureMoveRequest: { tonneau: 3 } }) },
  close_tonneau: { vcsec: () => ({ closureMoveRequest: { tonneau: 4 } }) },
  stop_tonneau: { vcsec: () => ({ closureMoveRequest: { tonneau: 2 } }) },
  remote_start_drive: { vcsec: () => ({ RKEAction: 20 }) },
  honk_horn: { info: () => ({ vehicleControlHonkHornAction: {} }) },
  flash_lights: { info: () => ({ vehicleControlFlashLightsAction: {} }) },
  window_control: {
    info: (p) => {
      const c = req(p, 'command');
      if (c !== 'vent' && c !== 'close') throw new Error("command: 'vent' tai 'close'");
      return { vehicleControlWindowAction: { [c]: {} } };
    },
  },
  sun_roof_control: { info: (p) => ({ vehicleControlSunroofOpenCloseAction: { [req(p, 'state') === 'close' ? 'close' : 'vent']: {} } }) },
  trigger_homelink: { info: (p) => ({ vehicleControlTriggerHomelinkAction: { location: { latitude: +req(p, 'lat'), longitude: +req(p, 'lon') } } }) },
  remote_boombox: { info: (p) => ({ boomboxAction: { sound: +(p.sound ?? 0) } }) },
  ping: { info: () => ({ ping: { ping_id: 1 } }) },

  // --- Ilmastointi ---
  auto_conditioning_start: { info: () => ({ hvacAutoAction: { power_on: true } }) },
  auto_conditioning_stop: { info: () => ({ hvacAutoAction: { power_on: false } }) },
  set_temps: {
    info: (p) => ({
      hvacTemperatureAdjustmentAction: {
        driver_temp_celsius: +req(p, 'driver_temp'),
        passenger_temp_celsius: +(p.passenger_temp ?? p.driver_temp),
        level: { TEMP_MAX: {} },
      },
    }),
  },
  set_preconditioning_max: { info: (p) => ({ hvacSetPreconditioningMaxAction: { on: !!p.on, manual_override: !!p.manual_override } }) },
  set_bioweapon_mode: { info: (p) => ({ hvacBioweaponModeAction: { on: !!p.on, manual_override: !!p.manual_override } }) },
  set_climate_keeper_mode: { info: (p) => ({ hvacClimateKeeperAction: { ClimateKeeperAction: +req(p, 'climate_keeper_mode'), manual_override: !!p.manual_override } }) },
  set_cabin_overheat_protection: { info: (p) => ({ setCabinOverheatProtectionAction: { on: !!p.on, fan_only: !!p.fan_only } }) },
  set_cop_temp: { info: (p) => ({ setCopTempAction: { copActivationTemp: +req(p, 'cop_temp') + 1 } }) },
  remote_seat_heater_request: {
    info: (p) => {
      const pos = SEATS[+req(p, 'seat_position')];
      const lvl = HEAT[+req(p, 'level')];
      if (!pos || !lvl) throw new Error('Virheellinen istuin tai taso');
      return { hvacSeatHeaterActions: { hvacSeatHeaterAction: [{ [pos]: {}, [lvl]: {} }] } };
    },
  },
  remote_seat_cooler_request: {
    info: (p) => ({
      hvacSeatCoolerActions: {
        hvacSeatCoolerAction: [{ seat_position: +req(p, 'seat_position'), seat_cooler_level: +req(p, 'seat_cooler_level') + 1 }],
      },
    }),
  },
  remote_auto_seat_climate_request: {
    info: (p) => ({ autoSeatClimateAction: { carseat: [{ on: !!p.auto_climate_on, seat_position: +req(p, 'auto_seat_position') }] } }),
  },
  remote_steering_wheel_heater_request: { info: (p) => ({ hvacSteeringWheelHeaterAction: { power_on: !!p.on } }) },
  remote_steering_wheel_heat_level_request: {
    info: (p) => {
      const l = STW_LEVEL[+req(p, 'level')];
      if (!l) throw new Error('Ratin lämmitys: taso 0, 1 tai 3');
      return { stwHeatLevelAction: { stw_heat_level: l } };
    },
  },
  remote_auto_steering_wheel_heat_climate_request: { info: (p) => ({ autoStwHeatAction: { on: !!p.on } }) },

  // --- Lataus ---
  charge_start: { info: () => ({ chargingStartStopAction: { start: {} } }) },
  charge_stop: { info: () => ({ chargingStartStopAction: { stop: {} } }) },
  charge_max_range: { info: () => ({ chargingStartStopAction: { start_max_range: {} } }) },
  charge_standard: { info: () => ({ chargingStartStopAction: { start_standard: {} } }) },
  charge_port_door_open: { info: () => ({ chargePortDoorOpen: {} }) },
  charge_port_door_close: { info: () => ({ chargePortDoorClose: {} }) },
  set_charge_limit: { info: (p) => ({ chargingSetLimitAction: { percent: Math.round(+req(p, 'percent')) } }) },
  set_charging_amps: { info: (p) => ({ setChargingAmpsAction: { charging_amps: Math.round(+req(p, 'charging_amps')) } }) },
  set_scheduled_charging: { info: (p) => ({ scheduledChargingAction: { enabled: !!p.enable, charging_time: +(p.time || 0) } }) },
  set_scheduled_departure: {
    info: (p) => {
      if (!p.enable) return { scheduledDepartureAction: { enabled: false } };
      return {
        scheduledDepartureAction: {
          enabled: true,
          departure_time: +(p.departure_time || 0),
          preconditioning_times: policy(p.preconditioning_enabled, p.preconditioning_weekdays_only),
          off_peak_charging_times: policy(p.off_peak_charging_enabled, p.off_peak_charging_weekdays_only),
          off_peak_hours_end_time: +(p.end_off_peak_time || 0),
        },
      };
    },
  },
  add_charge_schedule: {
    info: (p) => ({
      addChargeScheduleAction: {
        id: +(p.id || Math.floor(Date.now() / 1000)),
        name: p.name || undefined,
        days_of_week: daysMask(req(p, 'days_of_week')),
        start_enabled: !!p.start_enabled,
        start_time: +(p.start_time || 0),
        end_enabled: !!p.end_enabled,
        end_time: +(p.end_time || 0),
        one_time: !!p.one_time,
        enabled: p.enabled !== false,
        latitude: +req(p, 'lat'),
        longitude: +req(p, 'lon'),
      },
    }),
  },
  remove_charge_schedule: { info: (p) => ({ removeChargeScheduleAction: { id: +req(p, 'id') } }) },
  batch_remove_charge_schedules: { info: (p) => ({ batchRemoveChargeSchedulesAction: { home: !!p.home, work: !!p.work, other: !!p.other } }) },
  add_precondition_schedule: {
    info: (p) => ({
      addPreconditionScheduleAction: {
        id: +(p.id || Math.floor(Date.now() / 1000)),
        name: p.name || undefined,
        days_of_week: daysMask(req(p, 'days_of_week')),
        precondition_time: +req(p, 'precondition_time'),
        one_time: !!p.one_time,
        enabled: p.enabled !== false,
        latitude: +req(p, 'lat'),
        longitude: +req(p, 'lon'),
      },
    }),
  },
  remove_precondition_schedule: { info: (p) => ({ removePreconditionScheduleAction: { id: +req(p, 'id') } }) },
  batch_remove_precondition_schedules: { info: (p) => ({ batchRemovePreconditionSchedulesAction: { home: !!p.home, work: !!p.work, other: !!p.other } }) },
  set_managed_charge_current_request: { rest: true },
  set_managed_charger_location: { rest: true },
  set_managed_scheduled_charging_time: { rest: true },

  // --- Turvallisuus ---
  set_sentry_mode: { info: (p) => ({ vehicleControlSetSentryModeAction: { on: !!p.on } }) },
  set_valet_mode: { info: (p) => ({ vehicleControlSetValetModeAction: p.on ? { on: true, password: pin4(p.password) } : { on: false } }) },
  reset_valet_pin: { info: () => ({ vehicleControlResetValetPinAction: {} }) },
  set_pin_to_drive: { info: (p) => ({ vehicleControlSetPinToDriveAction: { on: !!p.on, password: p.on ? pin4(p.password) : String(p.password || '') } }) },
  reset_pin_to_drive_pin: { info: () => ({ vehicleControlResetPinToDriveAction: {} }) },
  clear_pin_to_drive_admin: { info: () => ({ vehicleControlResetPinToDriveAdminAction: {} }) },
  speed_limit_activate: { info: (p) => ({ drivingSpeedLimitAction: { activate: true, pin: pin4(req(p, 'pin')) } }) },
  speed_limit_deactivate: { info: (p) => ({ drivingSpeedLimitAction: { activate: false, pin: pin4(req(p, 'pin')) } }) },
  speed_limit_set_limit: { info: (p) => ({ drivingSetSpeedLimitAction: { limit_mph: +req(p, 'limit_mph') } }) },
  speed_limit_clear_pin: { info: (p) => ({ drivingClearSpeedLimitPinAction: { pin: pin4(req(p, 'pin')) } }) },
  speed_limit_clear_pin_admin: { info: () => ({ drivingClearSpeedLimitPinAdminAction: {} }) },
  guest_mode: { info: (p) => ({ guestModeAction: { GuestModeActive: !!p.enable } }) },
  erase_user_data: { info: () => ({ eraseUserDataAction: {} }) },
  parental_controls_activate: { info: (p) => ({ parentalControlsAction: { activate: true, pin: pin4(req(p, 'pin')) } }) },
  parental_controls_deactivate: { info: (p) => ({ parentalControlsAction: { activate: false, pin: pin4(req(p, 'pin')) } }) },
  parental_controls_set_speed_limit: { info: (p) => ({ parentalControlsSetSpeedLimitAction: { limit_mph: +req(p, 'limit_mph') } }) },
  parental_controls_clear_pin_admin: { info: () => ({ parentalControlsClearPinAdminAction: {} }) },

  // --- Media ---
  media_toggle_playback: { info: () => ({ mediaPlayAction: {} }) },
  media_next_track: { info: () => ({ mediaNextTrack: {} }) },
  media_prev_track: { info: () => ({ mediaPreviousTrack: {} }) },
  media_next_fav: { info: () => ({ mediaNextFavorite: {} }) },
  media_prev_fav: { info: () => ({ mediaPreviousFavorite: {} }) },
  media_volume_up: { info: () => ({ mediaUpdateVolume: { volume_delta: 1 } }) },
  media_volume_down: { info: () => ({ mediaUpdateVolume: { volume_delta: -1 } }) },
  adjust_volume: {
    info: (p) => {
      const v = +req(p, 'volume');
      if (v < 0 || v > 11) throw new Error('Äänenvoimakkuus 0–11');
      return { mediaUpdateVolume: { volume_absolute_float: v } };
    },
  },

  // --- Navigointi ---
  navigation_request: { rest: true },
  navigation_gps_request: { info: (p) => ({ navigationGpsRequest: { lat: +req(p, 'lat'), lon: +req(p, 'lon'), order: +(p.order || 0) } }) },
  navigation_sc_request: { info: (p) => ({ navigationSuperchargerRequest: { id: +(p.id || 0), remote_nav_trip_order: +(p.order || 0) } }) },
  navigation_waypoints_request: { info: (p) => ({ navigationWaypointsRequest: { waypoints: String(req(p, 'waypoints')) } }) },

  // --- Ohjelmisto, virta, muut ---
  schedule_software_update: { info: (p) => ({ vehicleControlScheduleSoftwareUpdateAction: { offset_sec: +(p.offset_sec || 0) } }) },
  cancel_software_update: { info: () => ({ vehicleControlCancelSoftwareUpdateAction: {} }) },
  set_vehicle_name: { info: (p) => ({ setVehicleNameAction: { vehicleName: String(req(p, 'vehicle_name')) } }) },
  set_low_power_mode: { info: (p) => ({ setLowPowerModeAction: { low_power_mode: !!p.enable } }) },
  keep_accessory_power_mode: { info: (p) => ({ setKeepAccessoryPowerModeAction: { keep_accessory_power_mode: !!p.enable } }) },
  upcoming_calendar_entries: { rest: true },
  take_drivenote: { rest: true },
};

/** Navigointipyyntö osoitteeseen REST-muodossa (jaa-toiminto). */
export function navigationShareParams(address) {
  return {
    type: 'share_ext_content_raw',
    locale: 'fi-FI',
    timestamp_ms: String(Date.now()),
    value: { 'android.intent.extra.TEXT': address },
  };
}
