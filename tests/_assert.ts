import assert from "node:assert/strict";

// Les assertions de @std/assert, posees sur node:assert/strict. Les quelque 2000 sites
// d'appel ne changent pas : seule la provenance du symbole change, et la semantique est
// reproduite ici une fois pour toutes.

// Le message se passe en argument separe et non en `msg` optionnel : aucune surcharge de
// node:assert n'accepte `string | undefined`, l'une veut un Error, l'autre une chaine sure.
export function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  if (msg === undefined) assert.deepStrictEqual(actual, expected);
  else assert.deepStrictEqual(actual, expected, msg);
}

export function assertNotEquals<T>(actual: T, expected: T, msg?: string): void {
  if (msg === undefined) assert.notDeepStrictEqual(actual, expected);
  else assert.notDeepStrictEqual(actual, expected, msg);
}

export function assertStringIncludes(actual: string, expected: string, msg?: string): void {
  if (actual.includes(expected)) return;
  assert.fail(msg ?? `Expected actual: "${actual}" to contain: "${expected}"`);
}

type ErrorClass = new (...args: never[]) => Error;

export async function assertRejects(
  fn: () => PromiseLike<unknown>,
  errorClassOrMsg?: ErrorClass | string,
  msgIncludesOrMsg?: string,
  msg?: string,
): Promise<Error> {
  const errorClass = typeof errorClassOrMsg === "string" ? undefined : errorClassOrMsg;
  const msgIncludes = errorClass ? msgIncludesOrMsg : undefined;
  const finalMsg = errorClass
    ? (msg ?? undefined)
    : (errorClassOrMsg ?? msgIncludesOrMsg ?? undefined);
  const suffix = finalMsg ? `: ${finalMsg}` : "";

  let returned: PromiseLike<unknown>;
  try {
    returned = fn();
  } catch {
    return assert.fail(`Function throws when expected to reject${suffix}`);
  }
  if (returned === null || typeof returned !== "object" || !("then" in returned)) {
    return assert.fail(`Function returned a value instead of a promise${suffix}`);
  }

  let thrown: unknown;
  let rejected = false;
  try {
    await returned;
  } catch (err) {
    rejected = true;
    thrown = err;
  }

  if (!rejected) return assert.fail(`Expected function to reject${suffix}`);
  if (!(thrown instanceof Error)) {
    return assert.fail(`A non-Error object was rejected${suffix}`);
  }
  // Lu avant le test d'instance : un instanceof negatif retire Error de thrown, qui n'est
  // plus que never dans cette branche.
  const thrownName = thrown.name;
  if (errorClass && !(thrown instanceof errorClass)) {
    return assert.fail(
      `Expected error to be instance of "${errorClass.name}", but was "${thrownName}"${suffix}`,
    );
  }
  if (msgIncludes !== undefined && !thrown.message.includes(msgIncludes)) {
    return assert.fail(
      `Expected error message to include "${msgIncludes}", but got "${thrown.message}"${suffix}`,
    );
  }
  return thrown;
}
