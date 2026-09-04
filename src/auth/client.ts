const DEFAULT_AUTH_URL = "https://auth.scalingo.com";
const DEFAULT_API_URL = "https://api.osc-fr1.scalingo.com";

export interface ScalingoAddon {
  id: string;
  resourceId: string;
  provider: string;
  plan: string;
}

export function resolveScalingoApiUrl(apiUrl?: string): string {
  const resolved = apiUrl || Deno.env.get("SCALINGO_API_URL") || DEFAULT_API_URL;
  return resolved.replace(/\/+$/, "");
}

export async function exchangeToken(apiToken: string): Promise<string> {
  const authUrl = Deno.env.get("SCALINGO_AUTH_URL") ?? DEFAULT_AUTH_URL;
  const credentials = btoa(`:${apiToken}`);

  const response = await fetch(`${authUrl}/v1/tokens/exchange`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status} ${response.statusText}`);
  }

  const body = await response.json();
  if (typeof body?.token !== "string") {
    throw new Error("Token exchange failed: unexpected response format");
  }

  return body.token as string;
}

export async function fetchAddonToken(
  bearer: string,
  apiUrl: string,
  app: string,
  addonId: string,
): Promise<string> {
  const base = resolveScalingoApiUrl(apiUrl);
  const response = await fetch(
    `${base}/v1/apps/${encodeURIComponent(app)}/addons/${encodeURIComponent(addonId)}/token`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Addon token request failed: ${response.status} ${response.statusText}`);
  }

  const body = await response.json();
  const token = body?.addon?.token;
  if (typeof token !== "string") {
    throw new Error("Addon token request failed: unexpected response format");
  }

  return token;
}

interface RawScalingoAddon {
  id?: unknown;
  resource_id?: unknown;
  plan?: { name?: unknown } | null;
  addon_provider?: { name?: unknown; id?: unknown } | null;
}

export function normalizeAddons(raw: unknown): ScalingoAddon[] {
  if (!Array.isArray(raw)) return [];
  const addons: ScalingoAddon[] = [];
  for (const entry of raw as RawScalingoAddon[]) {
    if (typeof entry?.id !== "string") continue;
    addons.push({
      id: entry.id,
      resourceId: typeof entry.resource_id === "string" ? entry.resource_id : "",
      provider: typeof entry.addon_provider?.name === "string"
        ? entry.addon_provider.name
        : (typeof entry.addon_provider?.id === "string" ? entry.addon_provider.id : ""),
      plan: typeof entry.plan?.name === "string" ? entry.plan.name : "",
    });
  }
  return addons;
}
