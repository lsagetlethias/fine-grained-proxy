export interface LogsConfig {
  enabled: boolean;
  bufferNetwork: number;
  bufferDetailed: number;
  inactivityMin: number;
  detailedMaxKb: number;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

export function readLogsConfig(): LogsConfig {
  const enabled = Deno.env.get("FGP_LOGS_ENABLED") === "1";
  return {
    enabled,
    bufferNetwork: parsePositiveInt(Deno.env.get("FGP_LOGS_BUFFER_NETWORK"), 50),
    bufferDetailed: parsePositiveInt(Deno.env.get("FGP_LOGS_BUFFER_DETAILED"), 10),
    inactivityMin: parsePositiveInt(Deno.env.get("FGP_LOGS_INACTIVITY_MIN"), 10),
    detailedMaxKb: parsePositiveInt(Deno.env.get("FGP_LOGS_DETAILED_MAX_KB"), 32),
  };
}

export function logsEnabled(): boolean {
  return Deno.env.get("FGP_LOGS_ENABLED") === "1";
}
