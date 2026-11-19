// Komentoavaimen (NIST P-256) hallinta WebCryptolla.
// Yksityinen avain säilytetään vain tämän selaimen localStoragessa JWK-muodossa.

import { concat, fromB64, toB64, asBytes } from './bytes.js';

const ALG = { name: 'ECDH', namedCurve: 'P-256' };
const subtle = () => globalThis.crypto.subtle;

export async function generateKeyPair() {
  const kp = await subtle().generateKey(ALG, true, ['deriveBits']);
  return subtle().exportKey('jwk', kp.privateKey);
}

/** Lataa JWK:n ja palauttaa { privateKey, publicRaw (65 tavua, 0x04||X||Y) }. */
export async function loadKey(jwk) {
  const privateKey = await subtle().importKey('jwk', { ...jwk, key_ops: ['deriveBits'], ext: true }, ALG, true, ['deriveBits']);
  const publicRaw = concat(new Uint8Array([4]), fromB64(jwk.x), fromB64(jwk.y));
  return { privateKey, publicRaw };
}

function pem(label, der) {
  const b64 = toB64(new Uint8Array(der)).replace(/(.{64})/g, '$1\n').trim();
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

export async function publicKeyPem(jwk) {
  const pub = await subtle().importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, ext: true }, ALG, true, []);
  return pem('PUBLIC KEY', await subtle().exportKey('spki', pub));
}

export async function privateKeyPem(jwk) {
  const key = await subtle().importKey('jwk', { ...jwk, key_ops: ['deriveBits'], ext: true }, ALG, true, ['deriveBits']);
  return pem('PRIVATE KEY', await subtle().exportKey('pkcs8', key));
}

// --- PEM-tuonti: PKCS#8 ("BEGIN PRIVATE KEY") tai SEC1 ("BEGIN EC PRIVATE KEY", openssl ecparam -genkey) ---

function readDer(buf, pos) {
  const tag = buf[pos];
  let len = buf[pos + 1];
  let off = pos + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | buf[off + i];
    off += n;
  }
  return { tag, start: off, end: off + len };
}

function children(buf, node) {
  const out = [];
  let p = node.start;
  while (p < node.end) { const c = readDer(buf, p); out.push(c); p = c.end; }
  return out;
}

function sec1ToJwk(der) {
  const seq = readDer(der, 0);
  const kids = children(der, seq);
  const d = der.slice(kids[1].start, kids[1].end);
  const pubNode = kids.find((k) => k.tag === 0xa1);
  if (!pubNode) throw new Error('SEC1-avaimesta puuttuu julkinen osa. Muunna: openssl pkcs8 -topk8 -nocrypt -in key.pem');
  const bit = readDer(der, pubNode.start);
  const point = der.slice(bit.start + 1, bit.end); // ohita "unused bits" -tavu
  if (point[0] !== 4 || point.length !== 65) throw new Error('Tuntematon julkisen avaimen muoto');
  const b64u = (b) => toB64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { kty: 'EC', crv: 'P-256', d: b64u(d), x: b64u(point.slice(1, 33)), y: b64u(point.slice(33, 65)) };
}

export async function importPrivatePem(text) {
  const m = text.match(/-----BEGIN ([A-Z ]+)-----([\s\S]+?)-----END \1-----/);
  if (!m) throw new Error('PEM-muotoista avainta ei löytynyt');
  const der = asBytes(fromB64(m[2]));
  if (m[1] === 'EC PRIVATE KEY') return sec1ToJwk(der);
  if (m[1] === 'PRIVATE KEY') {
    const key = await subtle().importKey('pkcs8', der, ALG, true, ['deriveBits']);
    return subtle().exportKey('jwk', key);
  }
  throw new Error(`Ei tuettu avaintyyppi: ${m[1]}`);
}

/** ECDH-jaettu salaisuus (X-koordinaatti, 32 tavua) ajoneuvon julkisen avaimen kanssa. */
export async function ecdh(privateKey, peerRaw) {
  const peer = await subtle().importKey('raw', peerRaw, ALG, false, []);
  return new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: peer }, privateKey, 256));
}

export async function sha1(data) { return new Uint8Array(await subtle().digest('SHA-1', data)); }
export async function sha256(data) { return new Uint8Array(await subtle().digest('SHA-256', data)); }

export async function hmacSha256(keyBytes, data) {
  const k = await subtle().importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle().sign('HMAC', k, data));
}

export async function aesGcmDecrypt(keyBytes, nonce, ciphertextWithTag, aad) {
  const k = await subtle().importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 }, k, ciphertextWithTag));
}
