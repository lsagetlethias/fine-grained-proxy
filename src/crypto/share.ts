import { decodeBase64Url, encodeBase64Url } from "@std/encoding/base64url";

export interface PublicConfig {
  target: string;
  auth: string;
  scopes: string[];
  ttl: number;
}

export async function encodePublicConfig(config: PublicConfig): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(config));
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  return encodeBase64Url(compressed);
}

export async function decodePublicConfig(encoded: string): Promise<PublicConfig> {
  const compressed = decodeBase64Url(encoded);
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
  const decompressed = new Uint8Array(await new Response(stream).arrayBuffer());
  return JSON.parse(new TextDecoder().decode(decompressed));
}
