const DEFAULT_AUTH_URL = "https://auth.scalingo.com";

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
