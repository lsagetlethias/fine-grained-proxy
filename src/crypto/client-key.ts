export const CLIENT_KEY_MIN_LENGTH = 24;
export const CLIENT_KEY_MAX_LENGTH = 256;

const PRINTABLE_ASCII = /^[\x21-\x7E]+$/;

export type ClientKeyIssue = "empty" | "too-short" | "too-long" | "invalid-charset";

export function checkClientKey(key: string): ClientKeyIssue | null {
  if (key.length === 0) return "empty";
  if (key.length < CLIENT_KEY_MIN_LENGTH) return "too-short";
  if (key.length > CLIENT_KEY_MAX_LENGTH) return "too-long";
  if (!PRINTABLE_ASCII.test(key)) return "invalid-charset";
  return null;
}

export function validateClientKey(key: string): string | null {
  switch (checkClientKey(key)) {
    // Une variable CI non definie vaut "" et non l'absence du champ : la traiter comme
    // absente genererait en silence un blob dont le pipeline ignore la cle.
    case "empty":
      return "Client key is empty. Omit the field entirely to let the server generate one";
    case "too-short":
      return `Client key must be at least ${CLIENT_KEY_MIN_LENGTH} characters`;
    case "too-long":
      return `Client key must be at most ${CLIENT_KEY_MAX_LENGTH} characters`;
    case "invalid-charset":
      return "Client key must contain printable ASCII characters only, without spaces";
    default:
      return null;
  }
}
