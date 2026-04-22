export interface NetworkEntry {
  type: "network";
  ts: number;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  ipPrefix: string;
}

export type DetailedEntry =
  | {
    type: "detailed";
    ts: number;
    method: string;
    path: string;
    truncated: false;
    bodyEncrypted: string;
  }
  | {
    type: "detailed";
    ts: number;
    method: string;
    path: string;
    truncated: true;
  };

export type LogEntry = NetworkEntry | DetailedEntry;
