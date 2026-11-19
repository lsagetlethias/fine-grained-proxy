// Seul lecteur d'environnement du code serveur. process.env rend undefined sur un nom
// absent et ne leve jamais : une variable optionnelle retombe donc toujours sur son defaut.
// ENV_NAMES reste le registre des noms lisibles, et le type interdit d'en lire un autre.

export const ENV_NAMES = [
  "FGP_SALT",
  "PORT",
  "SCALINGO_API_URL",
  "SCALINGO_AUTH_URL",
  "FGP_LOGS_ENABLED",
  "FGP_LOGS_BUFFER_NETWORK",
  "FGP_LOGS_BUFFER_DETAILED",
  "FGP_LOGS_INACTIVITY_MIN",
  "FGP_LOGS_DETAILED_MAX_KB",
  "FGP_EGRESS_ALLOW_PRIVATE",
  "FGP_TRUSTED_PROXY_HOPS",
] as const;

export type EnvName = (typeof ENV_NAMES)[number];

// Aucune memoisation ici, ni de valeur ni de config derivee, et ne pas en ajouter : les
// fichiers de test basculent FGP_EGRESS_ALLOW_PRIVATE dans un processus unique partage.
// Un cache figerait la politique de sortie pour tout le run et ferait dependre le resultat
// de l'ordre des fichiers de test.
export function readEnv(name: EnvName): string | undefined {
  return process.env[name];
}

export function readEnvFlag(name: EnvName): boolean {
  return readEnv(name) === "1";
}

// Variables que l'hote et le runtime doivent conserver. Retirer PATH, HOME ou TMPDIR
// casserait le processus ; retirer les NODE_* desactiverait des reglages legitimes du
// lanceur, dont NODE_EXTRA_CA_CERTS sans lequel une sortie TLS cesse de valider.
const HOST_ENV_NAMES = [
  "PATH",
  "HOME",
  "PWD",
  "TMPDIR",
  "SHELL",
  "USER",
  "LOGNAME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "TERM",
  "NODE_ENV",
  "NODE_OPTIONS",
  "NODE_PATH",
  "NODE_EXTRA_CA_CERTS",
  "NODE_TEST_CONTEXT",
] as const;

// Tient la place de l'allow-list --allow-env, que le modele de permissions de Node ne
// couvre pas (ADR-0011) : tout ce qui n'est ni du registre ni de l'hote quitte process.env,
// pour qu'une dependance compromise n'y trouve pas le secret d'un autre service.
//
// Deux limites, a connaitre avant de s'y fier. Elle ne couvre pas les lectures faites au
// chargement des modules, puisque les imports ESM sont evalues avant le corps de main.ts
// qui l'appelle. Et elle vide process.env pour les processus enfants, ce que le serveur ne
// fait pas aujourd'hui mais qu'un futur appel a child_process trouverait ampute.
export function lockdownEnv(): string[] {
  const keep = new Set<string>([...ENV_NAMES, ...HOST_ENV_NAMES]);
  const removed: string[] = [];
  for (const name of Object.keys(process.env)) {
    if (keep.has(name)) continue;
    delete process.env[name];
    removed.push(name);
  }
  return removed;
}

export function readEnvInt(name: EnvName, fallback: number, min: number): number {
  const raw = readEnv(name);
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) return fallback;
  return n;
}
