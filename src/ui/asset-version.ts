let resolved = "dev";
try {
  resolved = Deno.readTextFileSync("static/version.txt").trim() || "dev";
} catch {
  // no version.txt, run deno task build to generate it
}

export const ASSET_VERSION = resolved;

// Les noms de fichiers de static/ sont stables et servis en max-age=86400 : sans ce suffixe,
// un deploiement laisse 24h de CSS et de JS perimes aux visiteurs deja venus.
export function assetUrl(path: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}v=${encodeURIComponent(ASSET_VERSION)}`;
}
