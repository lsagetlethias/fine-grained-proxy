import { assertEquals, assertNotEquals } from "@std/assert";

import { capturedIntervals, restoreSetInterval } from "./_capture-intervals.ts";
// Le suffixe fait une cle de module distincte : src/main.ts est deja evalue par les autres
// fichiers de test du meme processus, et sans lui son setInterval ne se rejouerait pas.
import "../../src/main.ts?purge-timer";
import { deriveKey } from "../../src/crypto/blob.ts";
import {
  _keyCacheSizeForTests,
  _resetKeyCacheForTests,
  setCachedKey,
} from "../../src/crypto/key-cache.ts";
import { logsEnabled } from "../../src/logs/config.ts";

restoreSetInterval();

const TICK_MS = 60_000;

Deno.test({
  name: "AC-50.10: le timer de purge n'est pas conditionne a la feature logs",
  fn: async () => {
    Deno.env.delete("FGP_LOGS_ENABLED");

    const timers = capturedIntervals.filter((t) => t.delay === TICK_MS);
    assertNotEquals(
      timers.length,
      0,
      `aucun timer a ${TICK_MS} ms enregistre au chargement, le test ne verifie plus rien`,
    );

    // Le kill switch est bien a l'arret : sans cette assertion le test resterait vert sur
    // l'ancien comportement, ou la purge du cache vivait sous un if (logsEnabled()).
    assertEquals(logsEnabled(), false, "FGP_LOGS_ENABLED doit etre a l'arret pour ce test");

    const key = await deriveKey("cle-pour-le-timer-de-purge-01234", "purge-timer-salt");
    const origNow = Date.now;
    try {
      // Entree fraiche : le timer n'y touche pas. C'est ce qui distingue une purge d'un
      // vidage aveugle, lequel rendrait l'assertion suivante sans valeur.
      _resetKeyCacheForTests();
      setCachedKey("index-frais", key);
      for (const timer of timers) timer.cb();
      assertEquals(_keyCacheSizeForTests(), 1, "une entree fraiche a ete purgee a tort");

      Date.now = () => origNow() + 11 * 60 * 1000;
      for (const timer of timers) timer.cb();
      assertEquals(
        _keyCacheSizeForTests(),
        0,
        "l'entree expiree survit au timer alors que les logs sont a l'arret",
      );
    } finally {
      Date.now = origNow;
      _resetKeyCacheForTests();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
