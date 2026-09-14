import { assertEquals } from "@std/assert";

import { readEnv, readEnvFlag, readEnvInt } from "../../src/env.ts";
import { readLogsConfig } from "../../src/logs/config.ts";
import { trustedProxyHops } from "../../src/logs/ip.ts";

function withEnv(name: "FGP_LOGS_BUFFER_NETWORK" | "FGP_TRUSTED_PROXY_HOPS", value: string | null) {
  if (value === null) Deno.env.delete(name);
  else Deno.env.set(name, value);
}

Deno.test("AC-58.11: readEnvInt reprend exactement les rejets de l'ancien parsePositiveInt", () => {
  const cases: [string | null, number][] = [
    [null, 42],
    ["", 42],
    ["abc", 42],
    ["1.5", 42],
    ["Infinity", 42],
    ["-3", 42],
    ["0", 42],
    ["7", 7],
    [" 7 ", 7],
  ];
  try {
    for (const [raw, expected] of cases) {
      withEnv("FGP_LOGS_BUFFER_NETWORK", raw);
      assertEquals(readEnvInt("FGP_LOGS_BUFFER_NETWORK", 42, 1), expected, `raw=${raw}`);
    }
  } finally {
    withEnv("FGP_LOGS_BUFFER_NETWORK", null);
  }
});

Deno.test("AC-58.12: a min 0, zero est retenu et le negatif retombe sur le defaut", () => {
  const cases: [string | null, number][] = [
    [null, 0],
    ["", 0],
    ["0", 0],
    ["-1", 0],
    ["2", 2],
    ["2.5", 0],
  ];
  try {
    for (const [raw, expected] of cases) {
      withEnv("FGP_TRUSTED_PROXY_HOPS", raw);
      assertEquals(readEnvInt("FGP_TRUSTED_PROXY_HOPS", 0, 0), expected, `raw=${raw}`);
      assertEquals(trustedProxyHops(), expected, `trustedProxyHops raw=${raw}`);
    }
  } finally {
    withEnv("FGP_TRUSTED_PROXY_HOPS", null);
  }
});

Deno.test("AC-58.13: readEnvFlag ne vaut vrai que sur la chaine 1", () => {
  try {
    withEnv("FGP_LOGS_BUFFER_NETWORK", "1");
    assertEquals(readEnvFlag("FGP_LOGS_BUFFER_NETWORK"), true);
    for (const raw of ["", "0", "true", "yes", "11"]) {
      withEnv("FGP_LOGS_BUFFER_NETWORK", raw);
      assertEquals(readEnvFlag("FGP_LOGS_BUFFER_NETWORK"), false, `raw=${raw}`);
    }
    withEnv("FGP_LOGS_BUFFER_NETWORK", null);
    assertEquals(readEnvFlag("FGP_LOGS_BUFFER_NETWORK"), false);
  } finally {
    withEnv("FGP_LOGS_BUFFER_NETWORK", null);
  }
});

// Le jour ou quelqu'un ajoutera un cache dans src/env.ts pour « economiser » un appel, ces
// trois assertions tomberont. C'est le but : 34 fichiers de test basculent les memes
// variables dans un processus unique, un cache ferait dependre le resultat de leur ordre.
Deno.test("AC-58.14: aucune valeur d'environnement n'est memoisee", () => {
  try {
    withEnv("FGP_TRUSTED_PROXY_HOPS", "1");
    assertEquals(readEnv("FGP_TRUSTED_PROXY_HOPS"), "1");
    assertEquals(trustedProxyHops(), 1);

    withEnv("FGP_TRUSTED_PROXY_HOPS", "3");
    assertEquals(readEnv("FGP_TRUSTED_PROXY_HOPS"), "3");
    assertEquals(trustedProxyHops(), 3);

    withEnv("FGP_TRUSTED_PROXY_HOPS", null);
    assertEquals(readEnv("FGP_TRUSTED_PROXY_HOPS"), undefined);
    assertEquals(trustedProxyHops(), 0);
  } finally {
    withEnv("FGP_TRUSTED_PROXY_HOPS", null);
  }
});

Deno.test("AC-58.15: la config logs se relit a chaque appel, elle n'est pas figee", () => {
  try {
    withEnv("FGP_LOGS_BUFFER_NETWORK", "7");
    assertEquals(readLogsConfig().bufferNetwork, 7);
    withEnv("FGP_LOGS_BUFFER_NETWORK", "9");
    assertEquals(readLogsConfig().bufferNetwork, 9);
    withEnv("FGP_LOGS_BUFFER_NETWORK", null);
    assertEquals(readLogsConfig().bufferNetwork, 50);
  } finally {
    withEnv("FGP_LOGS_BUFFER_NETWORK", null);
  }
});
