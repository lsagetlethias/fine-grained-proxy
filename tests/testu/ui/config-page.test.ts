import { assertEquals, assertStringIncludes } from "@std/assert";

import { ConfigPage } from "../../../src/ui/config-page.tsx";
import { ALERT_INFO_CLASS } from "../../../src/ui/config/constants.ts";
import { renderLlmsTxt } from "../../../src/routes/llms.ts";

const html = String(ConfigPage({ commitHash: "test" }));

/** Rendu debarrasse du balisage et des entites, pour comparer la copy au mot pres. */
const copy = html
  .replace(/<[^>]+>/g, " ")
  .replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ");

/** Attributs de la balise portant l'identifiant donne. */
function tagAttributes(id: string): string {
  const index = html.indexOf(`id="${id}"`);
  assertEquals(index >= 0, true, `element introuvable dans le rendu : #${id}`);
  const open = html.lastIndexOf("<", index);
  const close = html.indexOf(">", index);
  return html.slice(open, close + 1);
}

/** Fragment de rendu allant de la balise ouvrante de l'element a sa fermeture. */
function elementHtml(id: string, closingTag: string): string {
  const index = html.indexOf(`id="${id}"`);
  assertEquals(index >= 0, true, `element introuvable dans le rendu : #${id}`);
  const open = html.lastIndexOf("<", index);
  const end = html.indexOf(closingTag, index);
  assertEquals(end >= 0, true, `fermeture ${closingTag} introuvable pour #${id}`);
  return html.slice(open, end + closingTag.length);
}

/** Contenu du <details> qui replie la liste des codes d'erreur FGP. */
function errorDetailsHtml(): string {
  const summary = html.indexOf("Les erreurs de FGP");
  assertEquals(summary >= 0, true, "summary « Les erreurs de FGP » introuvable");
  const end = html.indexOf("</details>", summary);
  assertEquals(end >= 0, true, "fermeture du <details> des codes d'erreur introuvable");
  return html.slice(summary, end);
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

Deno.test("§12.10: les trois nouveaux codes d'erreur sont documentes avec leur status", () => {
  for (
    const [code, status] of [
      ["unsupported_regex", "400"],
      ["payload_too_large", "413"],
      ["target_forbidden", "403"],
    ]
  ) {
    assertStringIncludes(
      html,
      `<code class="font-mono text-xs">${code}</code> (${status})`,
      `${code} absent du panneau Doc, ou sans son status`,
    );
  }
});

Deno.test("§12.10: les cinq groupes de codes portent les sous-titres de la spec, dans l'ordre", () => {
  const subtitles = [
    "La clé ou le blob",
    "Le périmètre du blob",
    "La cible du blob",
    "FGP n'a pas pu obtenir de credentials ou joindre l'API cible",
    "Anomalies",
  ];

  let previous = -1;
  for (const subtitle of subtitles) {
    const index = copy.indexOf(subtitle, previous + 1);
    assertEquals(index > previous, true, `sous-titre de groupe absent ou mal place : ${subtitle}`);
    previous = index;
  }
});

Deno.test("§12.10: la remediation des nouveaux codes reprend la copy du PO au mot pres", () => {
  const texts = [
    "Une expression régulière de ce blob n'est plus autorisée : les groupes quantifiés, " +
    "les backréférences et les lookarounds sont refusés. Le blob doit être régénéré avec " +
    "un motif plus simple.",
    "Le corps de la requête dépasse la taille inspectable, 512 Ko, quand un body filter ou " +
    "la capture des logs détaillés est actif. Sans ces deux fonctions, le corps est transmis " +
    "en flux et n'est pas plafonné.",
    "La cible de ce blob n'est pas une adresse publique. FGP refuse de joindre les réseaux " +
    "privés, la boucle locale et les adresses de métadonnées. Vérifiez l'URL cible du blob.",
  ];

  for (const text of texts) {
    assertStringIncludes(copy, text);
  }
});

Deno.test("§12.10: le bloc sur la query est visible, hors du <details> des codes", () => {
  const title = "Les paramètres de query ne sont pas contrôlés";

  // Ce n'est pas une erreur mais une absence de refus : la replier avec les codes la rendrait
  // introuvable pour qui construit un blob en croyant le restreindre.
  assertStringIncludes(copy, title);
  assertEquals(
    errorDetailsHtml().includes(title),
    false,
    "le bloc query a ete replie dans le <details> des codes d'erreur",
  );

  assertStringIncludes(
    copy,
    "Les scopes contraignent la méthode et le chemin, pas les paramètres de query.",
  );
  assertStringIncludes(
    copy,
    "Si votre API cible expose des actions par la query, scopez le chemin le plus étroitement " +
      "possible.",
  );
  assertStringIncludes(html, '<code class="font-mono text-xs">/v1/items?action=delete</code>');
});

Deno.test("§12.10: le panneau Doc couvre tous les codes proxy annonces par /llms.txt", () => {
  // Deux surfaces documentent les memes erreurs a deux publics. Une divergence signifie qu'une
  // des deux ment, et rien dans le code ne l'aurait signalee.
  const llms = renderLlmsTxt("https://fgp.example.com");
  const heading = llms.indexOf("Error codes produced by FGP");
  assertEquals(heading >= 0, true, "liste des codes introuvable dans /llms.txt");

  // Le seul bloc qui suit le titre : une future liste de codes pour /api/* ne doit pas
  // etre confondue avec celle de la route proxy.
  const block = llms.slice(heading).split("\n\n")[1] ?? "";
  const codes = [...block.matchAll(/^- (\d{3}) `([a-z_]+)`:/gm)];

  assertEquals(codes.length, 15, "le nombre de codes listes par /llms.txt a change");

  for (const [, status, code] of codes) {
    assertStringIncludes(
      html,
      `<code class="font-mono text-xs">${code}</code> (${status})`,
      `${code} (${status}) est documente par /llms.txt mais absent du panneau Doc`,
    );
  }
});

Deno.test("§12.5: la note query du testeur porte la copy de la spec et part masquee", () => {
  const tag = tagAttributes("test-query-note");

  assertStringIncludes(tag, "hidden");
  // La note remplace un message que le verdict annoncait : sans region live, elle
  // apparaitrait en silence pour un lecteur d'ecran.
  assertStringIncludes(tag, 'aria-live="polite"');
  assertStringIncludes(
    tag,
    `class="${ALERT_INFO_CLASS}"`,
    "la note doit reutiliser le gabarit d'alerte partage, pas une classe ad hoc",
  );
  assertStringIncludes(
    copy,
    "La query n'est pas contrainte par les scopes : tous les paramètres passent.",
  );
});

Deno.test("§12.13: la note query n'a pas de titre", () => {
  const note = elementHtml("test-query-note", "</p>");

  // Le niveau passe par l'icone et la couleur ; un titre ne porterait aucune information et
  // ferait sortir le bloc de son budget de hauteur.
  assertEquals(note.includes("<strong"), false, "titre en gras dans la note query");
  assertEquals(/<h[1-6]\b/.test(note), false, "titre de section dans la note query");
  assertEquals(note.includes("font-semibold"), false, "titre appuye dans la note query");

  // L'icone est decorative : la gravite doit rester deductible du texte seul.
  assertStringIncludes(note, 'aria-hidden="true"');
});
