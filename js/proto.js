// Protobuf-tyypit (Teslan Vehicle Command Protocol). Kuvaus on käännetty
// tiedostoon proto/tesla.json; ajonaikaisena kirjastona protobufjs (light).

let types = null;

export function initProto(protobuf, json) {
  const root = protobuf.Root.fromJSON(json);
  const t = (n) => root.lookupType('tesla_protocol.' + n);
  types = {
    root,
    RoutableMessage: t('UniversalMessage.RoutableMessage'),
    SessionInfo: t('Signatures.SessionInfo'),
    Action: t('CarServer.Action'),
    Response: t('CarServer.Response'),
    UnsignedMessage: t('VCSEC.UnsignedMessage'),
    FromVCSECMessage: t('VCSEC.FromVCSECMessage'),
    MessageFault: root.lookupEnum('tesla_protocol.UniversalMessage.MessageFault_E'),
    GenericError: root.lookupEnum('tesla_protocol.Errors.GenericError_E'),
  };
  return types;
}

export async function loadProtoBrowser() {
  if (types) return types;
  if (!globalThis.protobuf) throw new Error('protobufjs ei latautunut');
  const json = await (await fetch(new URL('../proto/tesla.json', import.meta.url))).json();
  return initProto(globalThis.protobuf, json);
}

export function getTypes() {
  if (!types) throw new Error('Protobuf-tyyppejä ei ole alustettu');
  return types;
}

export function encode(Type, obj) {
  const err = Type.verify(obj);
  if (err) throw new Error(`${Type.name}: ${err}`);
  return Type.encode(Type.fromObject(obj)).finish();
}

export const has = (msg, field) => msg != null && Object.prototype.hasOwnProperty.call(msg, field);
