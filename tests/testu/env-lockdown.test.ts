import { test } from "node:test";

import { assertEquals } from "../_assert.ts";
import { ENV_NAMES, lockdownEnv, readEnv } from "../../src/env.ts";

// lockdownEnv mute l'environnement du processus de test lui-meme : chaque cas restaure
// l'integralite de process.env, sinon le cas suivant tourne dans un environnement ampute.
function withRestoredEnv(fn: () => void): void {
  const snapshot = { ...process.env };
  try {
    fn();
  } finally {
    for (const name of Object.keys(process.env)) delete process.env[name];
    Object.assign(process.env, snapshot);
  }
}

test("AC-59.1: une variable hors registre quitte process.env", () => {
  withRestoredEnv(() => {
    process.env.AWS_SECRET_ACCESS_KEY = "secret-d-un-autre-service";
    const removed = lockdownEnv();
    assertEquals(process.env.AWS_SECRET_ACCESS_KEY, undefined);
    assertEquals(removed.includes("AWS_SECRET_ACCESS_KEY"), true);
  });
});

test("AC-59.2: les onze variables du registre survivent a la purge", () => {
  withRestoredEnv(() => {
    for (const name of ENV_NAMES) process.env[name] = `valeur-${name}`;
    lockdownEnv();
    for (const name of ENV_NAMES) {
      assertEquals(readEnv(name), `valeur-${name}`, `${name} a ete retiree du registre`);
    }
  });
});

test("AC-59.3: les variables de l'hote survivent a la purge", () => {
  withRestoredEnv(() => {
    process.env.PATH = "/usr/bin";
    process.env.HOME = "/home/fgp";
    process.env.NODE_EXTRA_CA_CERTS = "/etc/ssl/extra.pem";
    lockdownEnv();
    assertEquals(process.env.PATH, "/usr/bin");
    assertEquals(process.env.HOME, "/home/fgp");
    assertEquals(process.env.NODE_EXTRA_CA_CERTS, "/etc/ssl/extra.pem");
  });
});

test("AC-59.4: la purge est idempotente", () => {
  withRestoredEnv(() => {
    process.env.UN_SECRET_DE_PLUS = "x";
    assertEquals(lockdownEnv().includes("UN_SECRET_DE_PLUS"), true);
    assertEquals(lockdownEnv().includes("UN_SECRET_DE_PLUS"), false);
  });
});
