import { assertEquals, assertStringIncludes } from "@std/assert";

import { ConfigPage } from "../../../src/ui/config-page.tsx";

const html = String(ConfigPage({ commitHash: "test" }));

/** Attributs de la balise portant l'identifiant donne. */
function tagAttributes(id: string): string {
  const index = html.indexOf(`id="${id}"`);
  assertEquals(index >= 0, true, `element introuvable dans le rendu : #${id}`);
  const open = html.lastIndexOf("<", index);
  const close = html.indexOf(">", index);
  return html.slice(open, close + 1);
}

Deno.test("AC-39.4: #byok-key n'a ni required, ni minlength, ni pattern, ni maxlength", () => {
  const tag = tagAttributes("byok-key");

  // required, minlength et pattern : un champ invalide dans un <details> ferme fait echouer
  // reportValidity() et rend le formulaire non soumettable sans aucun message visible.
  for (const attribute of ["required", "minlength", "pattern"]) {
    assertEquals(
      tag.includes(attribute),
      false,
      `#byok-key porte ${attribute} : le formulaire devient non soumettable bloc ferme`,
    );
  }

  // maxlength : il tronquait un collage trop long en silence, produisant un blob chiffre
  // avec une cle que l'utilisateur n'a jamais eue. Voir AC-39.19.
  assertEquals(
    tag.includes("maxlength"),
    false,
    "#byok-key porte maxlength : les collages longs seront tronques en silence",
  );
});

Deno.test("AC-39.4: #byok-key reste un champ masque et hors des gestionnaires de mots de passe", () => {
  const tag = tagAttributes("byok-key");

  assertStringIncludes(tag, 'type="password"');
  assertStringIncludes(tag, 'autocomplete="off"');
});

Deno.test("AC-39.17: aucun script inline dans la page de configuration", () => {
  // La CSP est script-src 'self' sans unsafe-inline : un seul <script> inline la casserait,
  // et la contourner avec unsafe-inline viderait la mesure de son sens.
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);

  for (const attributes of scripts) {
    assertEquals(
      attributes.includes("src="),
      true,
      `script inline detecte, la CSP le bloquera : <script${attributes}>`,
    );
  }
});

Deno.test("AC-39.17: aucun style inline ni gestionnaire d'evenement en attribut", () => {
  // style="" est bloque par style-src 'self', et un onclick="" par script-src 'self'.
  assertEquals(/\sstyle="/.test(html), false, "attribut style= present, bloque par la CSP");

  const handlers = [...html.matchAll(/\son(click|change|input|submit|load|error)=/g)];
  assertEquals(handlers.length, 0, "gestionnaire d'evenement en attribut, bloque par la CSP");
});

Deno.test("AC-39.17: aucune balise style, les feuilles viennent de /static", () => {
  assertEquals(/<style\b/.test(html), false, "balise <style> presente, bloquee par la CSP");
  assertStringIncludes(html, "/static/styles.css");
});

Deno.test("AC-40.13: la page declare la decouverte /llms.txt dans son head", () => {
  assertStringIncludes(html, 'rel="describedby"');
  assertStringIncludes(html, 'href="/llms.txt"');
});
