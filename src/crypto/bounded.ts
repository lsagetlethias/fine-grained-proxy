// Toute decompression est bornee en sortie (ADR-0010 D5). Le ratio gzip maximal mesure
// est de 1 029:1 : sans plafond, 265 Ko de corps produisaient 320 Mo de RSS.
export const MAX_DECOMPRESSED_BYTES = 128 * 1024;

export class DecompressionTooLargeError extends Error {
  constructor(limit: number) {
    super(`Decompressed output exceeds ${limit} bytes`);
    this.name = "DecompressionTooLargeError";
  }
}

// Pompe le reader et jette des que la sortie cumulee depasse le plafond, au lieu de
// materialiser l'integralite du flux avant de decider.
export async function readBounded(
  stream: ReadableStream<Uint8Array>,
  limit: number = MAX_DECOMPRESSED_BYTES,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new DecompressionTooLargeError(limit);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
