// Seul lecteur d'environnement du code serveur. Un nom absent de l'allow-list --allow-env
// ne rend pas undefined : Deno.env.get leve. Lu en direct depuis un handler, le throw
// remonte jusqu'a app.onError et sort en 500 sur une requete par ailleurs legitime.

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

export type EnvName = typeof ENV_NAMES[number];

// Aucune memoisation ici, ni de valeur ni de config derivee, et ne pas en ajouter : les
// fichiers de test basculent FGP_EGRESS_ALLOW_PRIVATE dans un processus unique partage.
// Un cache figerait la politique de sortie pour tout le run et ferait dependre le resultat
// de l'ordre des fichiers de test.
export function readEnv(name: EnvName): string | undefined {
  try {
    return Deno.env.get(name);
  } catch (err) {
    // Seul un refus d'acces vaut absence. NotCapable et PermissionDenied sont deux classes
    // distinctes depuis Deno 2, sans heritage : les deux se testent. Tout le reste remonte,
    // notamment le TypeError sur cle malformee, qui est une faute de programmation.
    if (err instanceof Deno.errors.NotCapable || err instanceof Deno.errors.PermissionDenied) {
      return undefined;
    }
    throw err;
  }
}

export function readEnvFlag(name: EnvName): boolean {
  return readEnv(name) === "1";
}

export function readEnvInt(name: EnvName, fallback: number, min: number): number {
  const raw = readEnv(name);
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) return fallback;
  return n;
}
