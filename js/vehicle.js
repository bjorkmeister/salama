// Ajoneuvorajapinta: REST-luku + komennot (allekirjoitettu tai REST).

import { get, post, api, ApiError } from './api.js';
import { store } from './store.js';
import { COMMANDS, navigationShareParams } from './commands.js';
import { VehicleCommander, DOMAIN_VCSEC, DOMAIN_INFOTAINMENT } from './vcp.js';
import { loadProtoBrowser, getTypes, encode } from './proto.js';
import { loadKey } from './keys.js';
import { toB64 } from './bytes.js';
import * as demo from './demo.js';

export const DATA_ENDPOINTS = 'charge_state;climate_state;closures_state;drive_state;gui_settings;location_data;charge_schedule_data;preconditioning_schedule_data;vehicle_config;vehicle_state;vehicle_data_combo';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let commander = null;

export const isDemo = () => !!store.demo;

export async function listVehicles() {
  if (isDemo()) return demo.list();
  const r = await get('/api/1/vehicles');
  return r.response || [];
}

export async function vehicleSummary(vin) {
  if (isDemo()) return demo.list()[0];
  return (await get(`/api/1/vehicles/${vin}`)).response;
}

export async function vehicleData(vin) {
  if (isDemo()) return demo.data();
  return (await get(`/api/1/vehicles/${vin}/vehicle_data?endpoints=${encodeURIComponent(DATA_ENDPOINTS)}`)).response;
}

export async function wake(vin, onProgress) {
  if (isDemo()) return demo.wake();
  await post(`/api/1/vehicles/${vin}/wake_up`);
  for (let i = 0; i < 20; i++) {
    await sleep(i < 3 ? 2000 : 3000);
    onProgress?.(i);
    const v = await vehicleSummary(vin);
    if (v?.state === 'online') return v;
  }
  throw new Error('Auto ei herännyt minuutissa. Yritä uudelleen.');
}

async function getCommander(vin) {
  if (commander && commander.vin === vin) return commander;
  const jwk = store.keyJwk;
  if (!jwk) throw new Error('Komentoavain puuttuu. Luo tai tuo avain Asetuksissa.');
  await loadProtoBrowser();
  const key = await loadKey(jwk);
  commander = new VehicleCommander({
    vin,
    key,
    transport: async (b64) => {
      const r = await post(`/api/1/vehicles/${vin}/signed_command`, { routable_message: b64 });
      return r.response;
    },
  });
  return commander;
}

export function resetCommander() { commander = null; }

async function restCommand(vin, name, params) {
  const body = name === 'navigation_request' && params.address ? navigationShareParams(params.address) : params;
  const r = await post(`/api/1/vehicles/${vin}/command/${name}`, body);
  const res = r.response;
  if (res && res.result === false) throw new Error(res.reason || 'Auto hylkäsi komennon');
  return res;
}

/** Suorittaa komennon. Allekirjoitetussa tilassa käytetään Vehicle Command Protocolia. */
export async function command(vin, name, params = {}) {
  if (isDemo()) return demo.command(name, params);
  const def = COMMANDS[name];
  if (!def) throw new Error(`Tuntematon komento: ${name}`);
  if (store.settings.commandMode !== 'signed' || def.rest) return restCommand(vin, name, params);
  const c = await getCommander(vin);
  const T = getTypes();
  try {
    if (def.vcsec) return await c.send(DOMAIN_VCSEC, encode(T.UnsignedMessage, def.vcsec(params)));
    return await c.send(DOMAIN_INFOTAINMENT, encode(T.Action, { vehicleAction: def.info(params) }));
  } catch (e) {
    if (e instanceof ApiError && e.status === 408) e.asleep = true;
    throw e;
  }
}

/** Raakakonsoli: mikä tahansa Fleet API -kutsu. */
export async function raw(method, path, body) {
  if (isDemo()) return { demo: true, note: 'Demotilassa konsoli ei tee oikeita kutsuja', method, path, body };
  return api(method, path, body);
}

export { toB64 };
