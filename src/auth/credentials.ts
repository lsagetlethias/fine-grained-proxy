import { addonTokenCache, bearerCache, cachedSingleflight, hashToken } from "./cache.ts";
import { exchangeToken, fetchAddonToken, resolveScalingoApiUrl } from "./client.ts";

export async function obtainBearerViaExchange(apiToken: string): Promise<string> {
  const cacheKey = await hashToken(apiToken);
  return await cachedSingleflight(bearerCache, cacheKey, () => exchangeToken(apiToken));
}

export async function obtainAddonToken(
  apiToken: string,
  app: string,
  addonId: string,
  apiUrl?: string,
): Promise<string> {
  const cacheKey = await hashToken(apiToken, app, addonId);
  return await cachedSingleflight(addonTokenCache, cacheKey, async () => {
    const bearer = await obtainBearerViaExchange(apiToken);
    return await fetchAddonToken(bearer, resolveScalingoApiUrl(apiUrl), app, addonId);
  });
}
