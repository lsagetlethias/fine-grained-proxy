import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { encodeBase64Url } from "@std/encoding/base64url";

import {
  DecompressionTooLargeError,
  MAX_DECOMPRESSED_BYTES,
  readBounded,
} from "../../../src/crypto/bounded.ts";
import { decryptBlob, deriveKey } from "../../../src/crypto/blob.ts";
import { decodePublicConfig } from "../../../src/crypto/share.ts";

const CLIENT_KEY = "bounded-test-key-padding-0123";
const SERVER_SALT = "bounded-test-salt";

const IV_LENGTH = 12;
const BOMB_PLAIN_BYTES = 3 * 1024 * 1024;

async function gzip(data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(
    new CompressionStream("gzip"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 3 Mo de zeros compressent en quelques Ko : c'est la bombe nommee par l'ADR-0010 D5. */
function gzipBomb(): Promise<Uint8Array<ArrayBuffer>> {
  return gzip(new Uint8Array(BOMB_PLAIN_BYTES));
}

/**
 * Chiffre un contenu gzip arbitraire sous la forme d'un blob FGP, ce qu'encryptBlob ne
 * permet pas : il ne compresse que du JSON de configuration valide.
 */
async function blobFromGzip(compressed: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await deriveKey(CLIENT_KEY, SERVER_SALT);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, compressed),
  );
  const raw = new Uint8Array(IV_LENGTH + encrypted.length);
  raw.set(iv, 0);
  raw.set(encrypted, IV_LENGTH);
  return encodeBase64Url(raw);
}

Deno.test("AC-47.8: une bombe gzip presentee comme blob est rejetee", async () => {
  const bomb = await gzipBomb();
  assertEquals(
    bomb.byteLength < 16 * 1024,
    true,
    `la bombe doit rester petite a l'entree, mesuree a ${bomb.byteLength} octets`,
  );

  const blob = await blobFromGzip(bomb);
  const err = await assertRejects(
    () => decryptBlob(blob, CLIENT_KEY, SERVER_SALT),
    Error,
  );
  assertStringIncludes(err.message, "Decompression failed");
});

Deno.test("AC-47.8 bis: la meme bombe presentee comme encoded de partage est rejetee", async () => {
  const bomb = await gzipBomb();
  const encoded = encodeBase64Url(bomb);

  // Le plafond d'entree de /api/share/decode est de 8192 caracteres : la bombe passe
  // sous ce plafond, c'est tout l'interet de l'amplification.
  assertEquals(
    encoded.length < 8192,
    true,
    `l'encoded doit passer le plafond d'entree, mesure a ${encoded.length} caracteres`,
  );

  await assertRejects(
    () => decodePublicConfig(encoded),
    DecompressionTooLargeError,
  );
});

Deno.test("AC-47.8 ter: la lecture s'arrete au depassement au lieu de tout materialiser", async () => {
  const CHUNK = 64 * 1024;
  const CHUNKS = 200;
  let pulled = 0;

  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled >= CHUNKS) {
        controller.close();
        return;
      }
      pulled++;
      controller.enqueue(new Uint8Array(CHUNK));
    },
  });

  await assertRejects(() => readBounded(stream), DecompressionTooLargeError);

  // Le plafond est atteint au troisieme chunk : au-dela, la sortie aurait ete
  // materialisee avant d'etre jugee, ce qui est exactement la regression a attraper.
  const maxPulls = Math.ceil(MAX_DECOMPRESSED_BYTES / CHUNK) + 1;
  assertEquals(
    pulled <= maxPulls,
    true,
    `${pulled} chunks tires pour un plafond de ${maxPulls}`,
  );
});

Deno.test("AC-47.8 quater: un flux sous le plafond est lu integralement", async () => {
  const size = MAX_DECOMPRESSED_BYTES - 1;
  const payload = new Uint8Array(size).fill(7);
  const stream = new Blob([payload as Uint8Array<ArrayBuffer>]).stream();

  const out = await readBounded(stream);
  assertEquals(out.byteLength, size);
  assertEquals(out[0], 7);
  assertEquals(out[size - 1], 7);
});
