export interface PublicConfig {
  target: string;
  auth: string;
  scopes: unknown[];
  ttl: number;
  test?: {
    method: string;
    path: string;
    body?: string;
  };
}

function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export async function encodePublicConfig(config: PublicConfig): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(config));
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  return base64UrlEncode(compressed);
}

export async function decodePublicConfig(encoded: string): Promise<PublicConfig> {
  const compressed = base64UrlDecode(encoded);
  const stream = new Blob([compressed as Uint8Array<ArrayBuffer>]).stream().pipeThrough(
    new DecompressionStream("gzip"),
  );
  const decompressed = new Uint8Array(await new Response(stream).arrayBuffer());
  return JSON.parse(new TextDecoder().decode(decompressed));
}
