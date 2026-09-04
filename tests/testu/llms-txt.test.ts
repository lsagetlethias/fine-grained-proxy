import { assertEquals, assertStringIncludes } from "@std/assert";

import { renderLlmsTxt } from "../../src/routes/llms.ts";

const ORIGIN = "https://fgp.example.com";
const doc = renderLlmsTxt(ORIGIN);

const lines = doc.split("\n");

/** Index des lignes de titre, en ignorant l'interieur des blocs de code. */
function headingLines(): { index: number; level: number; text: string }[] {
  const out: { index: number; level: number; text: string }[] = [];
  let inFence = false;
  lines.forEach((line, index) => {
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const match = /^(#{1,6}) (.*)$/.exec(line);
    if (match) out.push({ index, level: match[1].length, text: match[2] });
  });
  return out;
}

Deno.test("AC-40.3: un seul titre H1, en tete de document", () => {
  const headings = headingLines();
  const h1 = headings.filter((h) => h.level === 1);

  assertEquals(h1.length, 1, "la convention llmstxt.org impose un H1 unique");
  assertEquals(h1[0].index, 0, "le H1 doit ouvrir le document");
  assertStringIncludes(h1[0].text, "Fine-Grained Proxy");
});

Deno.test("AC-40.3: un blockquote de resume suit immediatement le titre", () => {
  const afterTitle = lines.slice(1).find((l) => l.trim().length > 0);
  assertEquals(afterTitle?.startsWith(">"), true, "le resume doit etre un blockquote");
});

Deno.test("AC-40.4: aucun titre dans le bloc de prose", () => {
  const headings = headingLines();
  const firstH2 = headings.find((h) => h.level === 2);
  assertEquals(firstH2 !== undefined, true, "le document doit avoir au moins une section H2");

  // La convention interdit les titres dans le bloc de prose : c'est ce qui permet a un
  // parseur llms.txt naif de continuer a fonctionner.
  const inProse = headings.filter((h) => h.index > 0 && h.index < firstH2!.index);
  assertEquals(inProse, [], "un titre s'est glisse dans le bloc de prose");
});

Deno.test("AC-40.5: les sections H2 ne contiennent que des listes de liens", () => {
  const headings = headingLines();
  const h2 = headings.filter((h) => h.level === 2);
  assertEquals(h2.length >= 1, true);

  const linkItem = /^- \[[^\]]+\]\([^)]+\): .+$/;

  h2.forEach((section, i) => {
    const end = i + 1 < h2.length ? h2[i + 1].index : lines.length;
    const content = lines.slice(section.index + 1, end).filter((l) => l.trim().length > 0);

    assertEquals(content.length > 0, true, `section H2 vide : ${section.text}`);
    for (const line of content) {
      assertEquals(
        linkItem.test(line),
        true,
        `ligne non conforme dans « ${section.text} » : ${line}`,
      );
    }
  });
});

Deno.test("AC-40.6: le document tient sous 8 KB", () => {
  const bytes = new TextEncoder().encode(doc).length;
  assertEquals(bytes < 8192, true, `document trop long : ${bytes} octets`);
});

Deno.test("AC-40.7: le document est en anglais", () => {
  // Heuristique volontairement grossiere : on ne mesure pas la langue, on detecte une
  // fuite de la copy UI francophone dans un document destine a l'outillage.
  for (
    const marker of [
      "Bases de donnees",
      "Clé client",
      "Headers multiples",
      "Impossible",
      "Renseignez",
      "aucune",
    ]
  ) {
    assertEquals(doc.includes(marker), false, `copy francophone dans /llms.txt : ${marker}`);
  }
});

Deno.test("AC-40.8: les URLs cles sont presentes et absolues sur l'origine", () => {
  // Arbitrage du 2026-09-03 : on verifie la structure et les URLs cles, pas une liste de
  // chaines de contenu. Un test de copie casserait a chaque reformulation sans rien proteger.
  assertStringIncludes(doc, `${ORIGIN}/api/openapi.json`);
  assertStringIncludes(doc, `${ORIGIN}/api/docs`);
});

Deno.test("AC-40.8: les liens des sections H2 pointent vers l'origine ou le repo", () => {
  const headings = headingLines();
  const firstH2 = headings.find((h) => h.level === 2)!;
  const links = [...doc.slice(doc.indexOf(lines[firstH2.index])).matchAll(/\]\(([^)]+)\)/g)]
    .map((m) => m[1]);

  assertEquals(links.length > 0, true);
  for (const link of links) {
    const ok = link.startsWith(ORIGIN) || link.startsWith("https://github.com/");
    assertEquals(ok, true, `lien ni absolu sur l'origine ni vers le repo : ${link}`);
  }
});

Deno.test("AC-40.8: le contenu de fond couvre les concepts indispensables", () => {
  // Le fond se relit a la main (voir recette manuelle F.1). Ce test ne verifie qu'un
  // perimetre : qu'aucun des concepts sans lesquels un agent ne peut rien faire n'a disparu.
  for (
    const concept of [
      "X-FGP-Key",
      "X-FGP-Blob",
      "X-FGP-Source",
      "/api/generate",
      "scopes",
      "curl",
    ]
  ) {
    assertStringIncludes(doc, concept);
  }
});

Deno.test("AC-40.18: les codes d'erreur du proxy sont tous documentes", () => {
  for (
    const code of [
      "invalid_request",
      "invalid_auth_mode",
      "invalid_body",
      "unsupported_regex",
      "missing_key",
      "invalid_credentials",
      "scope_denied",
      "target_forbidden",
      "token_expired",
      "payload_too_large",
      "blob_too_large",
      "internal_error",
      "upstream_unreachable",
      "auth_exchange_failed",
      "auth_addon_failed",
    ]
  ) {
    assertStringIncludes(doc, code);
  }
});

Deno.test("AC-40.19: les trois non-garanties de la politique de sortie sont dites", () => {
  // Un agent qui construit un blob depuis ce document doit lire ces trois faits ici :
  // les decouvrir en production coute une fuite de credentials ou un scope contourne.
  // Les retours a la ligne du document sont un detail de mise en forme : les figer ferait
  // echouer ce test sur une reformulation qui ne change aucun des trois faits.
  const flat = doc.replace(/\s+/g, " ");
  assertStringIncludes(
    flat,
    "A scope constrains its query only when it declares `queryFilters`",
  );
  assertStringIncludes(flat, "Redirects are not followed");
  assertStringIncludes(flat, "are stripped before forwarding");
});

Deno.test("AC-40.8: les six modes d'authentification sont nommes", () => {
  for (
    const mode of ["bearer", "basic", "scalingo-exchange", "header:", "headers", "scalingo-addon"]
  ) {
    assertStringIncludes(doc, mode);
  }
});

Deno.test("AC-40.9: les liens absolus suivent l'origine passee au rendu", () => {
  const other = renderLlmsTxt("https://autre.example.org");

  assertStringIncludes(other, "https://autre.example.org/api/openapi.json");
  assertEquals(other.includes(ORIGIN), false, "une origine en dur a survecu au rendu");
});

Deno.test("AC-40.9: un slash final sur l'origine ne produit pas de double slash", () => {
  const trailing = renderLlmsTxt(`${ORIGIN}/`);
  assertEquals(trailing.includes("//api/openapi.json"), false);
  assertStringIncludes(trailing, `${ORIGIN}/api/openapi.json`);
});

Deno.test("AC-40.10: le document ne divulgue aucune donnee d'instance", () => {
  // Document produit, pas dump de configuration : ni salt, ni blob, ni cible configuree,
  // ni etat de la feature logs.
  for (const leak of ["FGP_SALT", "FGP_LOGS_ENABLED", "salt=", "eyJhbGci"]) {
    assertEquals(doc.includes(leak), false, `donnee d'instance divulguee : ${leak}`);
  }
});

Deno.test("AC-40.11: le rendu est deterministe pour une meme origine", () => {
  assertEquals(renderLlmsTxt(ORIGIN), renderLlmsTxt(ORIGIN));
});
