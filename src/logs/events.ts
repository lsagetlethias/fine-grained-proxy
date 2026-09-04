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
  // Nombre d'occurrences des seuls parametres repetes, dans l'ordre d'apparition. Un nom
  // absent d'ici est apparu exactement une fois. Le surnombre d'occurrences est la seule des
  // quatre causes de refus qui ne se lit nulle part ailleurs : ni dans le blob, ni dans le
  // formulaire, ni dans un message de generation (§19.4). Sans ce compteur, un auteur refuse
  // sur un parametre repete par un SDK qu'il ne controle pas n'a aucun moyen de le decouvrir.
  // Un compteur n'est pas une valeur : il ne fuite rien de plus que la liste de noms.
  queryParamRepeats?: [string, number][];
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
