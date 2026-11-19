// Fleet API -asiakas (REST) + valtuutus (OAuth 2.0 + PKCE).

import { store, defaultRedirectUri } from './store.js';
import { randomBytes, toB64Url, enc } from './bytes.js';
import { sha256 } from './keys.js';

export const SERVERS = {
  eu: 'https://fleet-api.prd.eu.vn.cloud.tesla.com',
  na: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
  cn: 'https://fleet-api.prd.cn.vn.cloud.tesla.cn',
};
const TOKEN_URL = {
  eu: 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token',
  na: 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token',
  cn: 'https://auth.tesla.cn/oauth2/v3/token',
};
const AUTH_URL = {
  eu: 'https://auth.tesla.com/oauth2/v3/authorize',
  na: 'https://auth.tesla.com/oauth2/v3/authorize',
  cn: 'https://auth.tesla.cn/oauth2/v3/authorize',
};
export const SCOPES = 'openid offline_access user_data vehicle_device_data vehicle_location vehicle_cmds vehicle_charging_cmds';

export class ApiError extends Error {
  constructor(message, status, body) { super(message); this.name = 'ApiError'; this.status = status; this.body = body; }
}

/** Ohjaa pyynnön valinnaisen CORS-välityspalvelimen kautta: https://proxy/<host>/<polku> */
function viaProxy(url) {
  const proxy = store.settings.proxyUrl.trim().replace(/\/+$/, '');
  if (!proxy) return url;
  const u = new URL(url);
  return `${proxy}/${u.host}${u.pathname}${u.search}`;
}

async function doFetch(url, init) {
  try {
    return await fetch(viaProxy(url), init);
  } catch (e) {
    const hint = store.settings.proxyUrl
      ? 'Tarkista CORS-välityspalvelimen osoite.'
      : 'Selain esti pyynnön (todennäköisesti CORS). Ota käyttöön CORS-välityspalvelin Asetuksissa.';
    throw new ApiError(`Yhteysvirhe: ${e.message}. ${hint}`, 0);
  }
}

// ---------------- OAuth ----------------

export async function startLogin() {
  const s = store.settings;
  if (!s.clientId) throw new Error('Client ID puuttuu (Asetukset)');
  const verifier = toB64Url(randomBytes(48));
  const challenge = toB64Url(await sha256(enc.encode(verifier)));
  const state = toB64Url(randomBytes(16));
  const redirectUri = s.redirectUri || defaultRedirectUri();
  store.pending = { verifier, state, redirectUri, at: Date.now() };
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: s.clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt_missing_scopes: 'true',
    locale: 'fi-FI',
  });
  location.assign(`${AUTH_URL[s.region] || AUTH_URL.eu}?${q}`);
}

async function tokenRequest(region, params) {
  const s = store.settings;
  const body = new URLSearchParams({ client_id: s.clientId, ...params });
  if (s.clientSecret && params.grant_type !== 'refresh_token') body.set('client_secret', s.clientSecret);
  const res = await doFetch(TOKEN_URL[region] || TOKEN_URL.eu, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(`Kirjautuminen epäonnistui: ${data.error_description || data.error || res.status}`, res.status, data);
  return data;
}

function saveTokens(region, data, prev) {
  store.tokens = {
    region,
    access_token: data.access_token,
    refresh_token: data.refresh_token || prev?.refresh_token,
    expires_at: Date.now() + (data.expires_in || 28800) * 1000,
  };
}

/** Käsittelee paluun Teslan kirjautumissivulta (?code=...&state=...). Palauttaa true jos kirjautui. */
export async function handleCallback() {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  const err = url.searchParams.get('error');
  if (!code && !err) return false;
  const pending = store.pending;
  history.replaceState(null, '', url.pathname + url.hash);
  if (err) throw new Error(`Tesla palautti virheen: ${url.searchParams.get('error_description') || err}`);
  if (!pending || pending.state !== url.searchParams.get('state')) throw new Error('Kirjautumisen tila ei täsmää – yritä uudelleen.');
  store.pending = null;
  // Koodin etuliite kertoo käyttäjän alueen (esim. "EU_...").
  const prefix = code.split('_')[0].toLowerCase();
  const region = SERVERS[prefix] ? prefix : store.settings.region;
  const data = await tokenRequest(region, {
    grant_type: 'authorization_code',
    code,
    code_verifier: pending.verifier,
    redirect_uri: pending.redirectUri,
    audience: SERVERS[region],
  });
  saveTokens(region, data);
  if (region !== store.settings.region) store.patchSettings({ region });
  return true;
}

let refreshing = null;
async function accessToken() {
  const t = store.tokens;
  if (!t) throw new ApiError('Ei kirjautunut', 401);
  if (t.expires_at - Date.now() > 60_000) return t.access_token;
  refreshing ||= (async () => {
    try {
      const data = await tokenRequest(t.region, { grant_type: 'refresh_token', refresh_token: t.refresh_token });
      saveTokens(t.region, data, t);
    } finally { refreshing = null; }
  })();
  await refreshing;
  return store.tokens.access_token;
}

export function isLoggedIn() { return !!store.tokens?.refresh_token; }
export function logout() { store.tokens = null; }

// ---------------- REST ----------------

export async function api(method, path, body, { auth = 'user', retry = true } = {}) {
  const region = store.tokens?.region || store.settings.region;
  const url = (path.startsWith('http') ? path : SERVERS[region] + (path.startsWith('/') ? path : '/' + path));
  const token = auth === 'user' ? await accessToken() : auth;
  const res = await doFetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && retry && auth === 'user') {
    store.tokens = { ...store.tokens, expires_at: 0 };
    return api(method, path, body, { auth, retry: false });
  }
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = {
      408: 'Auto nukkuu tai ei ole yhteydessä',
      412: 'Sovellusta ei ole rekisteröity tälle alueelle (partner_accounts)',
      421: 'Väärä alue – vaihda Asetuksista alue',
      429: 'Liikaa pyyntöjä – odota hetki',
      451: 'Tesla vaatii toimenpiteitä tilillä',
      403: 'Ei oikeuksia (tarkista scopet / virtuaaliavain)',
    }[res.status];
    throw new ApiError(`${msg || 'Virhe'} (${res.status}${data.error ? ': ' + (data.error_description || data.error) : ''})`, res.status, data);
  }
  return data;
}

export const get = (p) => api('GET', p);
export const post = (p, b = {}) => api('POST', p, b);

// ---------------- Partner-rekisteröinti (kertaluonteinen) ----------------

export async function partnerToken(region) {
  const data = await tokenRequest(region, {
    grant_type: 'client_credentials',
    scope: 'openid vehicle_device_data vehicle_cmds vehicle_charging_cmds',
    audience: SERVERS[region],
  });
  return data.access_token;
}

export async function registerPartner(region, domain) {
  const token = await partnerToken(region);
  const base = SERVERS[region];
  const res = await api('POST', `${base}/api/1/partner_accounts`, { domain }, { auth: token, retry: false });
  let check = null;
  try { check = await api('GET', `${base}/api/1/partner_accounts/public_key?domain=${encodeURIComponent(domain)}`, undefined, { auth: token, retry: false }); } catch { /* ei kriittinen */ }
  return { res, check };
}
