export async function computeBlobId(blobRaw: string): Promise<string> {
  const data = new TextEncoder().encode(blobRaw);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex.slice(0, 16);
}
