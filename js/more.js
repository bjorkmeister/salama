// Lisää-välilehti (käyttöönotto, auto, tiedot, konsoli) ja karttapaneeli.

import { store, defaultRedirectUri, defaultDomain } from './store.js';
import { isLoggedIn, registerPartner, SCOPES, get, post } from './api.js';
import { generateKeyPair, publicKeyPem, privateKeyPem, importPrivatePem } from './keys.js';
import { COMMANDS } from './commands.js';
import * as V from './vehicle.js';
import { icon } from './icons.js';
import { esc, attr, toast, confirmModal, jsonHtml, copyText, download, fmtNum } from './ui.js';
import { btn, switchRow, seg, nearbyCard } from './views.js';
import * as demo from './demo.js';

const PEM_PATH = '.well-known/appspecific/com.tesla.3p.public-key.pem';

// ---------------- Kartta ----------------

export function mapPanel(d, st) {
  const ds = d.drive_state || {};
  return `<div class="grid">
    <section class="card span-8"><div class="card-head"><h2>${icon('map')}Kartta</h2>
      <div class="row">${btn('Keskitä autoon', { cls: 'sm', ic: 'car', a: 'map-center' })}${btn('Valitse määränpää kartalta', { cls: 'sm', ic: 'nav', a: 'map-pick' })}</div></div>
      <div id="map-slot"></div>
    </section>
    <section class="card span-4 live"><div class="card-head"><h2>${icon('nav')}Navigointi</h2></div>
      <form class="stack" data-form="nav-address">
        <label class="field">Lähetä osoite autoon<input class="input" name="address" placeholder="esim. Mannerheimintie 1, Helsinki" required autocomplete="street-address"></label>
        <div class="row end"><button class="btn primary" type="submit">${icon('nav')}Lähetä</button></div>
      </form>
      <div class="kv" style="margin-top:16px">
        <div><div class="k">Leveysaste</div><div class="v num small">${fmtNum(ds.latitude, 5)}</div></div>
        <div><div class="k">Pituusaste</div><div class="v num small">${fmtNum(ds.longitude, 5)}</div></div>
        <div><div class="k">Suunta</div><div class="v num">${ds.heading ?? '–'}°</div></div>
        <div><div class="k">Nopeus</div><div class="v num">${ds.speed != null ? fmtNum(ds.speed * 1.609344) + ' km/h' : '–'}</div></div>
      </div>
      <div class="row" style="margin-top:12px">${btn('Lähin Supercharger', { cls: 'sm', ic: 'bolt', cmd: 'navigation_sc_request', params: { order: 0 }, label: 'Navigointi Superchargerille' })}${d.vehicle_state?.homelink_nearby ? btn('Kotiovi', { cls: 'sm', ic: 'garage', a: 'homelink' }) : ''}</div>
    </section>
    ${nearbyCard(st)}
  </div>`;
}

// ---------------- Lisää-välilehti ----------------

export function moreView(st, { setupOnly = false } = {}) {
  if (setupOnly) return setupView();
  const subs = [['setup', 'Käyttöönotto'], ['car', 'Auto'], ['info', 'Tiedot'], ['console', 'Konsoli']];
  const body = { setup: setupView, car: () => carView(st), info: () => infoView(st), console: () => consoleView(st) }[st.sub]?.() || setupView();
  return `<div class="row" style="margin-bottom:14px">${seg(subs, st.sub, (v) => `data-act="sub" data-sub="${v}"`)}</div>${body}`;
}

function step(n, done, title, body) {
  return `<div class="step ${done ? 'done' : ''}"><div class="n">${done ? icon('check') : n}</div><div><h3>${esc(title)}</h3>${body}</div></div>`;
}

function setupView() {
  const s = store.settings;
  const domain = s.domain || defaultDomain();
  const redirect = s.redirectUri || defaultRedirectUri();
  const hasKey = !!store.keyJwk;
  setTimeout(checkPublicKey, 0);
  return `<div class="grid">
  <section class="card span-7"><div class="card-head"><h2>${icon('settings')}Käyttöönotto</h2></div>
  <div class="steps">
    ${step(1, !!s.clientId, 'Luo sovellus Teslan kehittäjäportaalissa', `
      <ol>
        <li>Kirjaudu <a href="https://developer.tesla.com" target="_blank" rel="noopener">developer.tesla.com</a> -sivustolle Tesla-tililläsi ja luo uusi sovellus.</li>
        <li>OAuth-tyypiksi <b>Authorization Code</b> ja <b>Client Credentials</b> (machine-to-machine).</li>
        <li>Allowed Origin: <code>https://${esc(domain)}</code></li>
        <li>Allowed Redirect URI: <code>${esc(redirect)}</code></li>
        <li>Oikeudet: ajoneuvon tiedot, sijainti, komennot ja latauksen hallinta.</li>
        <li>Kopioi <b>Client ID</b> (ja Client Secret) alla olevaan lomakkeeseen.</li>
      </ol>`)}
    ${step(2, hasKey, 'Luo komentoavain ja julkaise julkinen avain', `
      <p>Komennot allekirjoitetaan omalla P-256-avaimellasi. Yksityinen avain jää vain tähän selaimeen. Julkinen avain julkaistaan sivustollasi osoitteessa
      <code>https://${esc(domain)}/${PEM_PATH}</code> – lisää tiedosto repoon <code>${esc(domain)}</code> (GitHubissa repo nimeltä <code>${esc(domain)}</code>) samaan polkuun. Tiedoston on oltava verkkotunnuksen juuressa, vaikka sovellus olisi alihakemistossa.</p>
      <div class="row">
        ${hasKey ? `${btn('Lataa julkinen avain', { cls: 'sm primary', ic: 'download', a: 'key-download' })}${btn('Kopioi', { cls: 'sm', ic: 'copy', a: 'key-copy' })}${btn('Vie yksityinen avain', { cls: 'sm', ic: 'key', a: 'key-export' })}` : btn('Luo avainpari', { cls: 'sm primary', ic: 'key', a: 'key-generate' })}
        ${btn('Tuo avain (.pem)', { cls: 'sm', ic: 'upload', a: 'key-import' })}
        ${hasKey ? btn('Luo uusi', { cls: 'sm ghost', a: 'key-generate' }) : ''}
      </div>
      <p class="small" style="margin-top:8px">Julkaistu avain: <span id="pk-status" class="muted">tarkistetaan…</span></p>
      <input type="file" id="key-file" accept=".pem,.key,.txt" class="hidden">`)}
    ${step(3, !!s.registeredAt, 'Rekisteröi sovellus Teslan alueelle (kerran)', `
      <p>Tesla tarkistaa julkisen avaimesi ja liittää sen sovellukseen. Vaatii Client Secretin asetuksissa.
      Vaihtoehtoisesti aja repossa <code>scripts/register-partner.sh</code>.</p>
      <div class="row">${btn('Rekisteröi nyt', { cls: 'sm primary', ic: 'globe', a: 'register' })}${s.registeredAt ? `<span class="muted small">Rekisteröity ${new Date(s.registeredAt).toLocaleDateString('fi-FI')}</span>` : ''}</div>
      <div id="register-out"></div>`)}
    ${step(4, isLoggedIn(), 'Kirjaudu Tesla-tililläsi', `
      <p>Hyväksy pyydetyt oikeudet. Tunnukset tallennetaan vain tähän selaimeen ja uusitaan automaattisesti.</p>
      <div class="row">${isLoggedIn() ? `<span class="chip online"><span class="dot"></span>Kirjautunut (${esc(store.tokens?.region?.toUpperCase() || '')})</span>${btn('Kirjaudu uudelleen', { cls: 'sm', a: 'login' })}${btn('Kirjaudu ulos', { cls: 'sm danger', ic: 'logout', a: 'logout' })}` : btn('Kirjaudu Tesla-tilillä', { cls: 'sm primary', ic: 'key', a: 'login' })}</div>`)}
    ${step(5, !!s.keyPairedAt, 'Lisää virtuaaliavain autoon', `
      <p>Avaa alla oleva linkki <b>puhelimella, jossa on Tesla-sovellus</b>, ja hyväksy avain. Pidä avainkorttia keskikonsolilla, kun auto pyytää.</p>
      <div class="row"><a class="btn sm primary" href="https://tesla.com/_ak/${esc(domain)}" target="_blank" rel="noopener">${icon('key')}tesla.com/_ak/${esc(domain)}</a>
      ${btn('Kopioi linkki', { cls: 'sm', ic: 'copy', a: 'copy-ak' })}${btn('Testaa yhteys', { cls: 'sm', ic: 'check', a: 'test-conn' })}</div>`)}
  </div></section>

  <section class="card span-5"><div class="card-head"><h2>${icon('edit')}Asetukset</h2></div>
    <form class="stack" data-form="settings" autocomplete="off">
      <label class="field">Client ID<input class="input" name="clientId" value="${esc(s.clientId)}" placeholder="xxxxxxxx-xxxx-…" spellcheck="false"></label>
      <label class="field">Client Secret <span class="hint">Valinnainen. Tallentuu vain tähän selaimeen. Tarvitaan rekisteröintiin ja tunnusten vaihtoon, ellei välityspalvelin lisää sitä.</span>
        <input class="input" name="clientSecret" type="password" value="${esc(s.clientSecret)}" spellcheck="false"></label>
      <label class="field">Alue<select class="input" name="region">
        ${[['eu', 'Eurooppa (EU)'], ['na', 'Pohjois-Amerikka ja muut'], ['cn', 'Kiina']].map(([v, l]) => `<option value="${v}" ${s.region === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field">Redirect URI<input class="input" name="redirectUri" value="${esc(s.redirectUri)}" placeholder="${esc(defaultRedirectUri())}"></label>
      <label class="field">Domain <span class="hint">Sivustosi verkkotunnus (julkinen avain + virtuaaliavain)</span><input class="input" name="domain" value="${esc(s.domain)}" placeholder="${esc(defaultDomain())}"></label>
      <label class="field">CORS-välityspalvelin <span class="hint">Tyhjä = suora yhteys. Esim. oma Cloudflare Worker (worker/cors-proxy.js).</span><input class="input" name="proxyUrl" value="${esc(s.proxyUrl)}" placeholder="https://kipina-proxy.example.workers.dev"></label>
      <label class="field">Komentotapa<select class="input" name="commandMode">
        <option value="signed" ${s.commandMode === 'signed' ? 'selected' : ''}>Allekirjoitettu (suositus, kaikki uudet autot)</option>
        <option value="rest" ${s.commandMode === 'rest' ? 'selected' : ''}>REST (vanhat Model S/X ennen 2021)</option></select></label>
      <label class="field">Automaattinen päivitys<select class="input" name="refreshInterval">
        ${[[0, 'Pois'], [30, '30 s'], [60, '1 min'], [120, '2 min'], [300, '5 min']].map(([v, l]) => `<option value="${v}" ${+s.refreshInterval === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span class="hint">Vain kun auto on hereillä ja sivu näkyvissä. Jokainen haku on maksullinen API-kutsu.</span></label>
      <div class="row end"><button class="btn primary" type="submit">Tallenna</button></div>
    </form>
    <p class="muted tiny" style="margin:14px 0 0">Pyydettävät oikeudet: <code>${SCOPES}</code></p>
  </section>
  </div>`;
}

async function checkPublicKey() {
  const el = document.getElementById('pk-status');
  if (!el) return;
  const jwk = store.keyJwk;
  try {
    const res = await fetch(`/${PEM_PATH}`, { cache: 'no-store' });
    const text = res.ok ? await res.text() : '';
    if (!text.includes('BEGIN PUBLIC KEY')) { el.textContent = 'ei löydy tältä sivustolta vielä'; el.style.color = 'var(--warn)'; return; }
    if (!jwk) { el.textContent = 'löytyy, mutta tässä selaimessa ei ole yksityistä avainta – tuo avain'; el.style.color = 'var(--warn)'; return; }
    const norm = (t) => t.replace(/\s+/g, '');
    const same = norm(text) === norm(await publicKeyPem(jwk));
    el.textContent = same ? 'julkaistu ja täsmää ✓' : 'julkaistu avain EI täsmää tämän selaimen avaimeen!';
    el.style.color = same ? 'var(--accent)' : 'var(--danger)';
  } catch { el.textContent = 'tarkistus ei onnistunut'; }
}

// ---------------- Auto ----------------

function carView(st) {
  const d = st.data || {}, v = d.vehicle_state || {}, cfg = d.vehicle_config || {};
  const vehicles = st.vehicles || [];
  return `<div class="grid">
  <section class="card span-6"><div class="card-head"><h2>${icon('car')}Auto</h2></div>
    <div class="kv">
      <div><div class="k">Malli</div><div class="v">${esc(cfg.car_type || '–')} ${esc(cfg.trim_badging || '')}</div></div>
      <div><div class="k">VIN</div><div class="v small">${esc(st.vin || '–')}</div></div>
      <div><div class="k">Väri</div><div class="v small">${esc(cfg.exterior_color || '–')}</div></div>
      <div><div class="k">Vanteet</div><div class="v small">${esc(cfg.wheel_type || '–')}</div></div>
    </div>
    ${vehicles.length > 1 ? `<p class="muted small" style="margin:14px 0 6px">Valitse auto</p><div class="row">${vehicles.map((x) => `<button class="btn sm ${x.vin === st.vin ? 'primary' : ''}" data-act="pick-vehicle" data-vin="${esc(x.vin)}">${esc(x.display_name || x.vin)}</button>`).join('')}</div>` : ''}
    <form class="row" data-form="rename" style="margin-top:14px"><input class="input" name="name" value="${esc(v.vehicle_name || '')}" maxlength="40" style="flex:1;min-width:160px" aria-label="Auton nimi"><button class="btn" type="submit">${icon('edit')}Nimeä</button></form>
  </section>
  <section class="card span-6"><div class="card-head"><h2>${icon('power')}Virranhallinta</h2></div>
    ${switchRow('Virransäästötila', 'Vähentää valmiustilan kulutusta', false, { cmd: 'set_low_power_mode', params: { enable: true }, label: 'Virransäästö päälle' })}
    <div class="row" style="margin:-4px 0 8px">${btn('Virransäästö pois', { cls: 'sm', cmd: 'set_low_power_mode', params: { enable: false } })}</div>
    ${switchRow('Pidä lisävarustevirta päällä', 'USB ja 12 V pysyvät päällä autosta poistuttaessa', false, { cmd: 'keep_accessory_power_mode', params: { enable: true }, label: 'Lisävarustevirta päälle' })}
    <div class="row" style="margin:-4px 0 0">${btn('Lisävarustevirta pois', { cls: 'sm', cmd: 'keep_accessory_power_mode', params: { enable: false } })}</div>
  </section>
  <section class="card span-6"><div class="card-head"><h2>${icon('sound')}Hauskat</h2></div>
    <p class="muted small" style="margin:0 0 10px">Ulkokaiutin (Boombox) – vain autoissa, joissa on jalankulkijakaiutin, ja auton ollessa pysäköitynä.</p>
    <div class="row">${btn('Pieru', { cls: 'sm', cmd: 'remote_boombox', params: { sound: 0 } })}${btn('Paikannusääni', { cls: 'sm', cmd: 'remote_boombox', params: { sound: 2000 } })}</div>
  </section>
  <section class="card span-6"><div class="card-head"><h2>${icon('user')}Lapsilukot ja tiedot</h2></div>
    <div class="row">${btn('Lapsilukko päälle', { cls: 'sm', a: 'parental-on' })}${btn('Lapsilukko pois', { cls: 'sm', a: 'parental-off' })}${btn('Lapsilukon PIN pois (admin)', { cls: 'sm', cmd: 'parental_controls_clear_pin_admin', confirm: 'Poistetaanko lapsilukon PIN?' })}</div>
    <div class="row" style="margin-top:12px">${btn('Poista käyttäjätiedot autosta', { cls: 'sm danger', ic: 'trash', cmd: 'erase_user_data', confirm: 'Poistetaanko KAIKKI käyttäjätiedot autosta? Tätä ei voi perua.', danger: true })}</div>
  </section>
  <section class="card span-12"><div class="card-head"><h2>${icon('sun')}Ulkoasu ja tili</h2></div>
    <div class="row">${seg([['auto', 'Automaattinen'], ['dark', 'Tumma'], ['light', 'Vaalea']], store.theme, (t) => `data-act="theme" data-theme="${t}"`)}
    <span style="flex:1"></span>${isLoggedIn() ? btn('Kirjaudu ulos', { cls: 'danger', ic: 'logout', a: 'logout' }) : ''}</div>
  </section>
  </div>`;
}

// ---------------- Tiedot ----------------

const INFO = [
  ['vehicle_data', 'Kaikki ajoneuvotiedot', 'car', (vin) => ['GET', `/api/1/vehicles/${vin}/vehicle_data?endpoints=${encodeURIComponent(V.DATA_ENDPOINTS)}`]],
  ['vehicles', 'Ajoneuvolista', 'car', () => ['GET', '/api/1/vehicles']],
  ['nearby', 'Lähimmät latauspaikat', 'plug', (vin) => ['GET', `/api/1/vehicles/${vin}/nearby_charging_sites?detail=true`]],
  ['release_notes', 'Ohjelmiston julkaisutiedot', 'update', (vin) => ['GET', `/api/1/vehicles/${vin}/release_notes`]],
  ['service_data', 'Huoltotiedot', 'settings', (vin) => ['GET', `/api/1/vehicles/${vin}/service_data`]],
  ['recent_alerts', 'Viimeisimmät hälytykset', 'alertlist', (vin) => ['GET', `/api/1/vehicles/${vin}/recent_alerts`]],
  ['drivers', 'Kuljettajat', 'user', (vin) => ['GET', `/api/1/vehicles/${vin}/drivers`]],
  ['invitations', 'Jakokutsut', 'user', (vin) => ['GET', `/api/1/vehicles/${vin}/invitations`]],
  ['mobile_enabled', 'Mobiilikäyttö sallittu', 'key', (vin) => ['GET', `/api/1/vehicles/${vin}/mobile_enabled`]],
  ['options', 'Varusteet', 'car', (vin) => ['GET', `/api/1/dx/vehicles/options?vin=${vin}`]],
  ['warranty', 'Takuu', 'shield', (vin) => ['GET', `/api/1/dx/warranty/details?vin=${vin}`]],
  ['charging_history', 'Lataushistoria (Supercharger)', 'bolt', (vin) => ['GET', `/api/1/dx/charging/history?vin=${vin}`]],
  ['fleet_status', 'Komentoprotokollan tila', 'key', (vin) => ['POST', '/api/1/vehicles/fleet_status', { vins: [vin] }]],
  ['me', 'Käyttäjä', 'user', () => ['GET', '/api/1/users/me']],
  ['region', 'Tilin alue', 'globe', () => ['GET', '/api/1/users/region']],
  ['orders', 'Tilaukset', 'calendar', () => ['GET', '/api/1/users/orders']],
  ['feature_config', 'Ominaisuudet', 'settings', () => ['GET', '/api/1/users/feature_config']],
];

function infoView(st) {
  const cur = st.info.current;
  return `<div class="grid">
  <section class="card span-4"><div class="card-head"><h2>${icon('info')}Tiedot</h2></div>
    <div class="list">${INFO.map(([k, l, ic]) => `<div class="item">${icon(ic)}<div class="grow t">${esc(l)}</div>${btn(cur === k ? 'Näytä' : 'Hae', { cls: `sm ${cur === k ? 'primary' : ''}`, a: 'info', label: l }).replace('data-act="info"', `data-act="info" data-key="${k}"`)}</div>`).join('')}</div>
  </section>
  <section class="card span-8"><div class="card-head"><h2>${icon('terminal')}${esc(INFO.find((x) => x[0] === cur)?.[1] || 'Tulos')}</h2>
    ${st.info.result ? btn('Kopioi', { cls: 'sm', ic: 'copy', a: 'info-copy' }) : ''}</div>
    ${st.info.loading ? '<p class="muted">Haetaan…</p>' : st.info.result ? `<pre class="json">${jsonHtml(st.info.result)}</pre>` : '<p class="muted small">Valitse vasemmalta. Jokainen haku on yksi Fleet API -kutsu.</p>'}
  </section></div>`;
}

// ---------------- Konsoli ----------------

function consoleView(st) {
  const names = Object.keys(COMMANDS).sort();
  const c = st.console || {};
  return `<div class="grid">
  <section class="card span-6"><div class="card-head"><h2>${icon('key')}Mikä tahansa komento</h2></div>
    <form class="stack" data-form="any-command">
      <label class="field">Komento<select class="input" name="name">${names.map((n) => `<option ${c.name === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="field">Parametrit (JSON, REST-muodossa)<textarea class="input" name="params" spellcheck="false">${esc(c.params || '{}')}</textarea></label>
      <div class="row end"><button class="btn primary" type="submit">${icon('play')}Suorita</button></div>
      <p class="muted tiny" style="margin:0">Parametrien nimet kuten developer.tesla.com-dokumentaatiossa, esim. set_charge_limit → {"percent": 80}.</p>
    </form>
  </section>
  <section class="card span-6"><div class="card-head"><h2>${icon('terminal')}REST-konsoli</h2></div>
    <form class="stack" data-form="rest">
      <div class="row"><select class="input" name="method" style="max-width:110px">${['GET', 'POST', 'PUT', 'DELETE'].map((m) => `<option ${c.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
      <input class="input" name="path" style="flex:1;min-width:180px" value="${esc(c.path || '/api/1/vehicles/{vin}')}" spellcheck="false"></div>
      <label class="field">Runko (JSON)<textarea class="input" name="body" spellcheck="false" placeholder="{}">${esc(c.body || '')}</textarea></label>
      <div class="row end"><button class="btn primary" type="submit">${icon('play')}Lähetä</button></div>
      <p class="muted tiny" style="margin:0"><code>{vin}</code> korvataan valitun auton VIN-koodilla.</p>
    </form>
  </section>
  <section class="card span-12"><div class="card-head"><h2>Tulos</h2></div>
    ${c.result !== undefined ? `<pre class="json">${jsonHtml(c.result)}</pre>` : '<p class="muted small">Ei vielä tulosta.</p>'}
  </section></div>`;
}

// ---------------- Toiminnot ----------------

async function withBusy(el, fn) {
  el?.classList.add('busy');
  try { return await fn(); } catch (e) { toast(e.message || String(e), 'err', 7000); } finally { el?.classList.remove('busy'); }
}

export const moreActions = {
  async 'key-generate'(el, ctx) {
    if (store.keyJwk && !(await confirmModal({ title: 'Luodaanko uusi avain?', text: 'Vanha avain korvataan. Sinun pitää julkaista uusi julkinen avain, rekisteröidä sovellus uudelleen ja lisätä virtuaaliavain autoon uudelleen.', ok: 'Luo uusi', danger: true }))) return;
    store.keyJwk = await generateKeyPair();
    store.patchSettings({ keyPairedAt: null });
    V.resetCommander();
    toast('Avainpari luotu. Lataa julkinen avain ja lisää se repoon.');
    ctx.renderView();
  },
  async 'key-download'() { download('com.tesla.3p.public-key.pem', await publicKeyPem(store.keyJwk), 'application/x-pem-file'); },
  async 'key-copy'() { copyText(await publicKeyPem(store.keyJwk)); },
  async 'key-export'() {
    if (!(await confirmModal({ title: 'Viedäänkö yksityinen avain?', text: 'Yksityisellä avaimella voi ohjata autoasi. Säilytä tiedosto turvassa äläkä koskaan lisää sitä GitHub-repoon.', ok: 'Lataa', danger: true }))) return;
    download('kipina-private-key.pem', await privateKeyPem(store.keyJwk), 'application/x-pem-file');
  },
  'key-import'(el, ctx) {
    const input = document.getElementById('key-file');
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        store.keyJwk = await importPrivatePem(await f.text());
        V.resetCommander();
        toast('Avain tuotu');
        ctx.renderView();
      } catch (e) { toast(e.message, 'err', 7000); }
    };
    input.click();
  },
  register(el) {
    return withBusy(el, async () => {
      const s = store.settings;
      const domain = s.domain || defaultDomain();
      if (!s.clientId) throw new Error('Tallenna ensin Client ID');
      const out = await registerPartner(s.region, domain);
      store.patchSettings({ registeredAt: Date.now() });
      document.getElementById('register-out').innerHTML = `<pre class="json" style="margin-top:8px">${jsonHtml(out)}</pre>`;
      toast('Sovellus rekisteröity alueelle');
    });
  },
  'copy-ak'() { copyText(`https://tesla.com/_ak/${store.settings.domain || defaultDomain()}`); },
  async 'test-conn'(el, ctx) {
    const ok = await ctx.runCmd('ping', {}, { el, label: 'Yhteys autoon toimii – virtuaaliavain on käytössä' });
    if (ok) { store.patchSettings({ keyPairedAt: Date.now() }); ctx.renderView(); }
  },
  info(el, ctx) {
    const key = el.dataset.key;
    const st = ctx.state;
    const def = INFO.find((x) => x[0] === key);
    st.info = { current: key, loading: true };
    ctx.renderView();
    return withBusy(null, async () => {
      try {
        const [m, p, b] = def[3](st.vin);
        st.info.result = store.demo ? (key === 'nearby' ? { response: demo.demoInfo.nearby_charging_sites } : key === 'vehicle_data' ? { response: st.data } : { demo: true, note: 'Demotilassa vain osa tiedoista on saatavilla', request: `${m} ${p}` }) : await V.raw(m, p, b);
      } catch (e) {
        st.info.result = { error: e.message, details: e.body };
      } finally { st.info.loading = false; ctx.renderView(); }
    });
  },
  'info-copy'(el, ctx) { copyText(JSON.stringify(ctx.state.info.result, null, 2)); },
  async 'parental-on'(el, ctx) {
    const pin = await confirmModal({ title: 'Lapsilukko päälle', ok: 'Ota käyttöön', input: { label: 'PIN (4 numeroa)', type: 'password', inputmode: 'numeric', maxlength: 4 } });
    if (pin) ctx.runCmd('parental_controls_activate', { pin }, { el, label: 'Lapsilukko päällä' });
  },
  async 'parental-off'(el, ctx) {
    const pin = await confirmModal({ title: 'Lapsilukko pois', ok: 'Poista', input: { label: 'PIN', type: 'password', inputmode: 'numeric', maxlength: 4 } });
    if (pin) ctx.runCmd('parental_controls_deactivate', { pin }, { el, label: 'Lapsilukko pois' });
  },

  'form:settings'(f, fd, ctx) {
    const p = Object.fromEntries(fd.entries());
    p.refreshInterval = +p.refreshInterval;
    for (const k of ['clientId', 'clientSecret', 'redirectUri', 'proxyUrl', 'domain']) p[k] = (p[k] || '').trim();
    store.patchSettings(p);
    V.resetCommander();
    toast('Asetukset tallennettu');
    ctx.render();
  },
  'form:rename'(f, fd, ctx) {
    const name = String(fd.get('name') || '').trim();
    if (name) ctx.runCmd('set_vehicle_name', { vehicle_name: name }, { label: `Nimi: ${name}` });
  },
  'form:nav-address'(f, fd, ctx) {
    const address = String(fd.get('address') || '').trim();
    if (address) ctx.runCmd('navigation_request', { address }, { label: 'Osoite lähetetty autoon' });
  },
  async 'form:any-command'(f, fd, ctx) {
    const st = ctx.state;
    st.console = { ...(st.console || {}), name: fd.get('name'), params: fd.get('params') };
    let params;
    try { params = JSON.parse(st.console.params || '{}'); } catch { return toast('Parametrit eivät ole kelvollista JSONia', 'err'); }
    const btnEl = f.querySelector('[type=submit]');
    btnEl.classList.add('busy');
    try {
      st.console.result = await V.command(st.vin, st.console.name, params);
      toast(`${st.console.name} ✓`);
    } catch (e) { st.console.result = { error: e.message, code: e.code, details: e.body }; toast(e.message, 'err'); }
    finally { btnEl.classList.remove('busy'); ctx.renderView(); }
  },
  async 'form:rest'(f, fd, ctx) {
    const st = ctx.state;
    st.console = { ...(st.console || {}), method: fd.get('method'), path: fd.get('path'), body: fd.get('body') };
    let body;
    if (st.console.body?.trim()) { try { body = JSON.parse(st.console.body); } catch { return toast('Runko ei ole kelvollista JSONia', 'err'); } }
    const path = st.console.path.replace(/\{vin\}/g, st.vin || '');
    const btnEl = f.querySelector('[type=submit]');
    btnEl.classList.add('busy');
    try { st.console.result = await V.raw(st.console.method, path, body); } catch (e) { st.console.result = { error: e.message, status: e.status, details: e.body }; }
    finally { btnEl.classList.remove('busy'); ctx.renderView(); }
  },
};
