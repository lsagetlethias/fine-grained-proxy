import { Buffer } from "node:buffer";

// Le decodeur base64url de Buffer ne leve jamais : il ignore en silence les caracteres hors
// alphabet et rend un buffer tronque. Le blob du proxy est fourni par l'appelant, et sans
// refus franc a l'entree une forgerie poursuit le chemin de dechiffrement avec des octets
// qui ne sont pas les siens. La validation est donc explicite ici, et elle precede toujours
// l'appel a Buffer.
const BASE64URL_ALPHABET = /^[0-9A-Za-z_-]*$/;

export function encodeBase64Url(data: Uint8Array): string {
  return Buffer.from(data).toString("base64url");
}

export function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  // Au plus deux « = » retires, et seulement en fin de chaine : un « = » median reste un
  // caractere interdit, et un troisieme fait une longueur impossible plutot qu'un padding.
  const core = value.replace(/={1,2}$/, "");

  if (core.length % 4 === 1) {
    throw new RangeError(
      `Cannot decode input as base64url: length (${core.length}), excluding padding, must not have a remainder of 1 when divided by 4`,
    );
  }
  if (!BASE64URL_ALPHABET.test(core)) {
    throw new TypeError("Cannot decode input as base64url: invalid character");
  }

  return new Uint8Array(Buffer.from(core, "base64url"));
}
