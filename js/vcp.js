// Teslan Vehicle Command Protocol selaimessa.
//
// Komennot allekirjoitetaan HMAC-SHA256:lla avaimella, joka johdetaan ECDH:lla
// omasta yksityisestä avaimesta ja auton julkisesta avaimesta (kuten Teslan
// virallinen vehicle-command SDK tekee Fleet API -yhteyksille). Allekirjoitettu
// viesti lähetetään Fleet API:n /signed_command-päätepisteeseen.

import { concat, enc, u32be, randomBytes, toB64, fromB64, equalBytes, asBytes } from './bytes.js';
import { ecdh, sha1, sha256, hmacSha256, aesGcmDecrypt } from './keys.js';
import { getTypes, encode, has } from './proto.js';

export const DOMAIN_VCSEC = 2;
export const DOMAIN_INFOTAINMENT = 3;

const TAG = { SIGNATURE_TYPE: 0, DOMAIN: 1, PERSONALIZATION: 2, EPOCH: 3, EXPIRES_AT: 4, COUNTER: 5, CHALLENGE: 6, FLAGS: 7, REQUEST_HASH: 8, FAULT: 9, END: 255 };
const SIG = { HMAC: 6, HMAC_PERSONALIZED: 8, AES_GCM_PERSONALIZED: 5, AES_GCM_RESPONSE: 9 };
const FAULT_RETRY = new Set([5, 6, 15, 17]); // invalid signature, token/counter, incorrect epoch, time expired
const COMMAND_TTL = 15; // sekuntia

export class CommandError extends Error {
  constructor(message, code) { super(message); this.name = 'CommandError'; this.code = code; }
}

const FAULT_FI = {
  1: 'Auto on kiireinen – yritä hetken päästä uudelleen',
  2: 'Aikakatkaisu autoon',
  3: 'Auto ei tunnista avainta – lisää virtuaaliavain autoon',
  4: 'Avain on poistettu käytöstä autossa',
  5: 'Virheellinen allekirjoitus',
  7: 'Avaimella ei ole oikeutta tähän komentoon',
  9: 'Auto ei tue tätä komentoa',
  12: 'Väärä VIN-tunnus',
  14: 'Auton avainlista on täynnä',
  17: 'Komento vanheni ennen perillemenoa (tarkista kello)',
};

function tlv(tag, value) {
  if (value.length > 255) throw new Error('TLV liian pitkä');
  return concat(new Uint8Array([tag, value.length]), value);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowSec = () => Math.floor(Date.now() / 1000);

export class VehicleCommander {
  /**
   * @param {object} o
   * @param {string} o.vin
   * @param {{privateKey: CryptoKey, publicRaw: Uint8Array}} o.key
   * @param {(routableB64: string) => Promise<string>} o.transport  lähettää base64-viestin ja palauttaa vastauksen base64:nä
   */
  constructor({ vin, key, transport }) {
    this.vin = vin;
    this.vinBytes = enc.encode(vin);
    this.key = key;
    this.transport = transport;
    this.routingAddress = randomBytes(16);
    this.sessions = {};
    this.queue = Promise.resolve();
  }

  session(domain) {
    return (this.sessions[domain] ||= { domain, ready: false, counter: 0 });
  }

  async roundtrip(msgObj) {
    const T = getTypes();
    const bytes = encode(T.RoutableMessage, msgObj);
    const respB64 = await this.transport(toB64(bytes));
    return T.RoutableMessage.decode(fromB64(respB64));
  }

  async deriveKeys(peerPub) {
    const shared = (await sha1(await ecdh(this.key.privateKey, peerPub))).slice(0, 16);
    return {
      peerPub,
      sharedKey: shared,
      hmacKey: await hmacSha256(shared, enc.encode('authenticated command')),
      sessionInfoKey: await hmacSha256(shared, enc.encode('session info')),
    };
  }

  /** Tarkistaa ja ottaa käyttöön auton lähettämän SessionInfon (HMAC-todennettu). */
  async acceptSessionInfo(domain, resp, requestUuid) {
    const T = getTypes();
    const s = this.session(domain);
    const raw = asBytes(resp.session_info);
    const info = T.SessionInfo.decode(raw);
    const peer = asBytes(info.publicKey);
    if (!peer.length) {
      if (info.status === 1) throw new CommandError('Auto ei tunnista tätä avainta. Lisää virtuaaliavain autoon (Asetukset → Virtuaaliavain).', 'KEY_NOT_PAIRED');
      throw new CommandError('Auton istuntotiedoista puuttuu julkinen avain', 'BAD_SESSION');
    }
    const keys = s.peerPub && equalBytes(s.peerPub, peer) ? s : await this.deriveKeys(peer);
    const tag = asBytes(resp.signature_data?.session_info_tag?.tag);
    const meta = concat(
      tlv(TAG.SIGNATURE_TYPE, new Uint8Array([SIG.HMAC])),
      tlv(TAG.PERSONALIZATION, this.vinBytes),
      tlv(TAG.CHALLENGE, requestUuid),
      new Uint8Array([TAG.END]),
    );
    const expected = await hmacSha256(keys.sessionInfoKey, concat(meta, raw));
    if (!equalBytes(expected, tag)) throw new CommandError('Auton vastauksen todennus epäonnistui', 'BAD_SESSION_TAG');
    if (info.status === 1) throw new CommandError('Auto ei tunnista tätä avainta. Lisää virtuaaliavain autoon.', 'KEY_NOT_PAIRED');

    const epoch = asBytes(info.epoch);
    const sameEpoch = s.epoch && equalBytes(s.epoch, epoch);
    Object.assign(s, {
      peerPub: keys.peerPub, sharedKey: keys.sharedKey, hmacKey: keys.hmacKey, sessionInfoKey: keys.sessionInfoKey,
      epoch,
      counter: sameEpoch ? Math.max(s.counter, info.counter) : info.counter,
      clockOffset: (info.clock_time >>> 0) - nowSec(),
      ready: true,
    });
  }

  async handshake(domain) {
    const uuid = randomBytes(16);
    const resp = await this.roundtrip({
      to_destination: { domain },
      from_destination: { routing_address: this.routingAddress },
      session_info_request: { public_key: this.key.publicRaw },
      uuid,
    });
    if (!asBytes(resp.session_info).length) {
      const f = resp.signedMessageStatus?.signed_message_fault;
      throw new CommandError(FAULT_FI[f] || `Auto ei vastannut istuntopyyntöön (${f ?? 'tuntematon'})`, 'HANDSHAKE');
    }
    await this.acceptSessionInfo(domain, resp, uuid);
  }

  async signHmac(s, payload) {
    s.counter += 1;
    const expiresAt = (nowSec() + s.clockOffset + COMMAND_TTL) >>> 0;
    const meta = concat(
      tlv(TAG.SIGNATURE_TYPE, new Uint8Array([SIG.HMAC_PERSONALIZED])),
      tlv(TAG.DOMAIN, new Uint8Array([s.domain])),
      tlv(TAG.PERSONALIZATION, this.vinBytes),
      tlv(TAG.EPOCH, s.epoch),
      tlv(TAG.EXPIRES_AT, u32be(expiresAt)),
      tlv(TAG.COUNTER, u32be(s.counter)),
      new Uint8Array([TAG.END]),
    );
    const tag = await hmacSha256(s.hmacKey, concat(meta, payload));
    return {
      to_destination: { domain: s.domain },
      from_destination: { routing_address: this.routingAddress },
      protobuf_message_as_bytes: payload,
      uuid: randomBytes(16),
      signature_data: {
        signer_identity: { public_key: this.key.publicRaw },
        HMAC_Personalized_data: { epoch: s.epoch, counter: s.counter, expires_at: expiresAt, tag },
      },
    };
  }

  async decryptResponse(s, req, resp) {
    const r = resp.signature_data?.AES_GCM_Response_data;
    let payload = asBytes(resp.protobuf_message_as_bytes);
    if (!r || !asBytes(r.tag).length) return payload;
    let reqHash = concat(new Uint8Array([SIG.HMAC_PERSONALIZED]), req.signature_data.HMAC_Personalized_data.tag);
    if (s.domain === DOMAIN_VCSEC) reqHash = reqHash.slice(0, 17);
    const meta = concat(
      tlv(TAG.SIGNATURE_TYPE, new Uint8Array([SIG.AES_GCM_RESPONSE])),
      tlv(TAG.DOMAIN, new Uint8Array([resp.from_destination?.domain ?? s.domain])),
      tlv(TAG.PERSONALIZATION, this.vinBytes),
      tlv(TAG.COUNTER, u32be(r.counter)),
      tlv(TAG.FLAGS, u32be(resp.flags || 0)),
      tlv(TAG.REQUEST_HASH, reqHash),
      tlv(TAG.FAULT, u32be(resp.signedMessageStatus?.signed_message_fault || 0)),
      new Uint8Array([TAG.END]),
    );
    return aesGcmDecrypt(s.sharedKey, asBytes(r.nonce), concat(payload, asBytes(r.tag)), await sha256(meta));
  }

  /** Lähettää allekirjoitetun komennon. Palauttaa dekoodatun vastauksen. */
  send(domain, payload) {
    const run = () => this._send(domain, payload, 0);
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  async _send(domain, payload, attempt) {
    const T = getTypes();
    const s = this.session(domain);
    if (!s.ready) await this.handshake(domain);
    const req = await this.signHmac(s, payload);
    const resp = await this.roundtrip(req);

    if (asBytes(resp.session_info).length) {
      await this.acceptSessionInfo(domain, resp, req.uuid);
    }
    const fault = resp.signedMessageStatus?.signed_message_fault || 0;
    if (fault) {
      if (FAULT_RETRY.has(fault) && attempt < 2) {
        if (!asBytes(resp.session_info).length) s.ready = false;
        return this._send(domain, payload, attempt + 1);
      }
      const name = T.MessageFault.valuesById[fault] || String(fault);
      throw new CommandError(FAULT_FI[fault] || `Auto hylkäsi komennon (${name})`, name);
    }
    if (resp.signedMessageStatus?.operation_status === 1 && attempt < 3) { // WAIT
      await sleep(2000);
      return this._send(domain, payload, attempt + 1);
    }

    const plain = await this.decryptResponse(s, req, resp);
    if (domain === DOMAIN_VCSEC) return this.parseVcsec(plain);
    return this.parseInfotainment(plain);
  }

  parseVcsec(bytes) {
    const T = getTypes();
    if (!bytes.length) return { result: true };
    const m = T.FromVCSECMessage.decode(bytes);
    if (has(m, 'nominalError')) {
      const code = m.nominalError.genericError;
      throw new CommandError(`Auto hylkäsi komennon (${T.GenericError.valuesById[code] || code})`, 'VCSEC_ERROR');
    }
    if (has(m, 'commandStatus')) {
      const st = m.commandStatus.operationStatus || 0;
      if (st === 2) throw new CommandError('Auto hylkäsi komennon', 'VCSEC_ERROR');
    }
    return { result: true, vcsec: T.FromVCSECMessage.toObject(m, { enums: String, longs: Number }) };
  }

  parseInfotainment(bytes) {
    const T = getTypes();
    if (!bytes.length) return { result: true };
    const r = T.Response.decode(bytes);
    if (r.actionStatus && r.actionStatus.result === 1) {
      const why = r.actionStatus.result_reason?.plain_text || 'tuntematon syy';
      throw new CommandError(`Auto ei voinut suorittaa komentoa: ${why}`, 'CAR_ERROR');
    }
    return { result: true, response: T.Response.toObject(r, { enums: String, longs: Number }) };
  }
}
