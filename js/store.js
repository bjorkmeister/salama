// Asetukset ja tunnukset tallennetaan vain tämän selaimen localStorageen.

const NS = 'tdash.';

function read(key, fallback) {
  try {
    const v = localStorage.getItem(NS + key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
function write(key, value) {
  try {
    if (value === undefined || value === null) localStorage.removeItem(NS + key);
    else localStorage.setItem(NS + key, JSON.stringify(value));
  } catch { /* yksityinen tila tms. */ }
}

export const DEFAULT_SETTINGS = {
  clientId: '',
  clientSecret: '',
  region: 'eu',
  redirectUri: '',
  proxyUrl: '',
  commandMode: 'signed',
  refreshInterval: 60,
  units: 'metric',
  domain: '',
};

export const store = {
  get settings() { return { ...DEFAULT_SETTINGS, ...read('settings', {}) }; },
  set settings(v) { write('settings', v); },
  patchSettings(p) { this.settings = { ...this.settings, ...p }; },

  get tokens() { return read('tokens', null); },
  set tokens(v) { write('tokens', v); },

  get keyJwk() { return read('key', null); },
  set keyJwk(v) { write('key', v); },

  get vin() { return read('vin', null); },
  set vin(v) { write('vin', v); },

  get demo() { return read('demo', false); },
  set demo(v) { write('demo', v || null); },

  get pending() { return read('pendingLogin', null); },
  set pending(v) { write('pendingLogin', v); },

  get cache() { return read('cache', null); },
  set cache(v) { write('cache', v); },

  get tab() { return read('tab', 'home'); },
  set tab(v) { write('tab', v); },

  get theme() { return read('theme', 'auto'); },
  set theme(v) { write('theme', v); },
};

export function defaultRedirectUri() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}
export function defaultDomain() {
  return location.hostname;
}
