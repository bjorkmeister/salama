// Kipinä – CORS-välityspalvelin (Cloudflare Worker).
//
// Tarvitaan vain, jos Teslan rajapinnat eivät salli suoria selainkutsuja
// GitHub Pages -sivultasi. Välittää pyynnöt muotoa
//   https://<worker>/<tesla-host>/<polku>
// ainoastaan sallituille Teslan palvelimille ja vain sallituista origineista.
//
// Ympäristömuuttujat (Cloudflare → Workers → Settings → Variables):
//   ALLOWED_ORIGINS  esim. "https://kayttaja.github.io"  (pilkulla erotettuna useampi)
//   CLIENT_SECRET    (valinnainen, Secret-tyyppinen) – lisätään vain
//                    authorization_code-tunnusvaihtoon, jolloin salaisuutta ei
//                    tarvitse tallentaa selaimeen.

const ALLOWED_HOSTS = new Set([
  'auth.tesla.com',
  'auth.tesla.cn',
  'fleet-auth.prd.vn.cloud.tesla.com',
  'fleet-api.prd.eu.vn.cloud.tesla.com',
  'fleet-api.prd.na.vn.cloud.tesla.com',
  'fleet-api.prd.cn.vn.cloud.tesla.cn',
]);

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!allowed.includes(origin)) return new Response('Origin not allowed', { status: 403 });

    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(req.url);
    const [, host, ...rest] = url.pathname.split('/');
    if (!ALLOWED_HOSTS.has(host)) return new Response('Host not allowed', { status: 403, headers: cors });

    let body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text();
    if (env.CLIENT_SECRET && body && url.pathname.endsWith('/oauth2/v3/token')) {
      const p = new URLSearchParams(body);
      if (p.get('grant_type') === 'authorization_code' && !p.get('client_secret')) {
        p.set('client_secret', env.CLIENT_SECRET);
        body = p.toString();
      }
    }

    const headers = new Headers();
    for (const h of ['Authorization', 'Content-Type']) {
      const v = req.headers.get(h);
      if (v) headers.set(h, v);
    }
    const upstream = await fetch(`https://${host}/${rest.join('/')}${url.search}`, { method: req.method, headers, body });
    const res = new Response(upstream.body, upstream);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  },
};
