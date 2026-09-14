import { readEnvFlag, readEnvInt } from "../env.ts";

export interface LogsConfig {
  enabled: boolean;
  bufferNetwork: number;
  bufferDetailed: number;
  inactivityMin: number;
  detailedMaxKb: number;
}

export function readLogsConfig(): LogsConfig {
  const enabled = readEnvFlag("FGP_LOGS_ENABLED");
  return {
    enabled,
    bufferNetwork: readEnvInt("FGP_LOGS_BUFFER_NETWORK", 50, 1),
    bufferDetailed: readEnvInt("FGP_LOGS_BUFFER_DETAILED", 10, 1),
    inactivityMin: readEnvInt("FGP_LOGS_INACTIVITY_MIN", 10, 1),
    detailedMaxKb: readEnvInt("FGP_LOGS_DETAILED_MAX_KB", 32, 1),
  };
}

export function logsEnabled(): boolean {
  return readEnvFlag("FGP_LOGS_ENABLED");
}
