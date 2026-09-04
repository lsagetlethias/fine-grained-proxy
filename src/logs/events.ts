export interface NetworkEntry {
  type: "network";
  ts: number;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  ipPrefix: string;
  // Depuis v5 (§14.6). Noms des parametres de query, dedupliques, JAMAIS leurs valeurs :
  // cette entry vit en clair dans le ring buffer, contrairement au body detailed qui est
  // chiffre avec la cle client. Absent quand la requete n'a pas de query.
  queryParamNames?: string[];
  // La liste des noms est integralement controlee par l'appelant : une requete unique ne
  // doit pas pouvoir remplir le buffer a elle seule.
  queryParamNamesTruncated?: true;
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
