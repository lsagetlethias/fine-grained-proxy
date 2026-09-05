import { assertEquals } from "@std/assert";
import {
  canonicalizePath,
  checkAccess,
  checkRequestAccess,
  splitPathAndQuery,
} from "../../../src/middleware/scopes.ts";

Deno.test("AC-44.1: le percent-encoding ne contourne pas le scope", () => {
  const v = checkRequestAccess(["GET:/v1/public/*"], "GET", "/v1/public/..%2f..%2fadmin");
  assertEquals(v.allowed, false);
  assertEquals(v.denial?.axis, "path_encoded");
});

Deno.test("AC-44.2: la contre-oblique encodee ne contourne pas non plus", () => {
  const v = checkRequestAccess(["GET:/v1/public/*"], "GET", "/v1/public/..%5c..%5cadmin");
  assertEquals(v.allowed, false);
  assertEquals(v.denial?.axis, "path_encoded");
});

Deno.test("AC-44.3: le double encodage est refuse", () => {
  const v = checkRequestAccess(["GET:/v1/public/*"], "GET", "/v1/public/..%252f..%252fadmin");
  assertEquals(v.allowed, false);
});

Deno.test("AC-44.4: cas GitLab, un identifiant contenant %2F reste autorise", () => {
  const v = checkRequestAccess(
    ["GET:/api/v4/projects/*"],
    "GET",
    "/api/v4/projects/groupe%2Fprojet",
  );
  assertEquals(v.allowed, true);
});

Deno.test("AC-44.5: table de canonicalisation", () => {
  const cas: [string, string][] = [
    ["/v1//a//b", "/v1/a/b"],
    ["/v1/./a/../b", "/v1/b"],
    ["/v1/public/..%2f..%2fadmin", "/admin"],
    ["/a%5cb", "/a/b"],
    ["/v1/items", "/v1/items"],
    ["/", "/"],
  ];
  for (const [entree, attendu] of cas) {
    assertEquals(canonicalizePath(entree), attendu, entree);
  }
});

Deno.test("AC-44.6: un caractere de controle apres decodage est refuse", () => {
  const v = checkRequestAccess(["*:*"], "GET", "/v1/items%00.json");
  assertEquals(v.allowed, false);
  assertEquals(v.denial?.axis, "invalid_path");
});

Deno.test("AC-44.7: un chemin sans encodage donne le meme verdict qu'avant", () => {
  assertEquals(checkRequestAccess(["GET:/v1/apps/*"], "GET", "/v1/apps/my-app").allowed, true);
  assertEquals(checkRequestAccess(["GET:/v1/apps/*"], "POST", "/v1/apps/my-app").allowed, false);
  assertEquals(checkRequestAccess(["GET:/v1/apps/*"], "GET", "/v2/apps/my-app").allowed, false);
});

Deno.test("AC-44.10: la regle des deux formes est monotone, elle n'ouvre jamais un acces", () => {
  // Corpus dont le verdict est connu sous le controle de la seule forme brute, que rend
  // checkAccess. La propriete a proteger n'est pas la valeur d'un verdict mais le sens de
  // l'ecart : ajouter une forme de verification ne peut que reduire l'ensemble autorise,
  // quelle que soit la forme ajoutee plus tard.
  const corpus: [string[], string, string][] = [
    [["GET:/v1/public/*"], "GET", "/v1/public/rapport.json"],
    [["GET:/v1/public/*"], "GET", "/v1/public/..%2f..%2fadmin"],
    [["GET:/v1/public/*"], "GET", "/v1/public/..%5c..%5cadmin"],
    [["GET:/v1/public/*"], "GET", "/v1/public/..%252f..%252fadmin"],
    [["GET:/api/v4/projects/*"], "GET", "/api/v4/projects/groupe%2Fprojet"],
    [["GET:/projects/groupe%2Fprojet"], "GET", "/projects/groupe%2Fprojet"],
    [["*:*"], "GET", "/v1//items"],
    [["*:*"], "GET", "/v1/./items"],
    [["GET:/v1/items"], "GET", "/v1/items?action=delete"],
    [["GET:/v1/items"], "POST", "/v1/items"],
    [["GET:/v1/a/*"], "GET", "/v1/a/b/../../c"],
  ];

  let resserres = 0;
  for (const [scopes, method, path] of corpus) {
    // La query est retiree de la ligne de base : checkAccess compare le chemin tel quel, la
    // laisser comparerait l'axe chemin a l'axe chemin plus query et l'ecart mesure ne serait
    // plus celui de la regle des deux formes.
    const formeBrute = checkAccess(scopes, method, splitPathAndQuery(path)[0]);
    const deuxFormes = checkRequestAccess(scopes, method, path).allowed;
    assertEquals(
      formeBrute === false && deuxFormes === true,
      false,
      `la regle a ouvert un acces sur ${method} ${path}`,
    );
    if (formeBrute && !deuxFormes) resserres++;
  }

  // Sans au moins un resserrement, le corpus ne distinguerait pas la monotonie d'une
  // regle qui ne fait rien : le test passerait sur un checkRequestAccess evide.
  assertEquals(resserres > 0, true, "le corpus n'exerce aucun resserrement, il ne prouve rien");
});

Deno.test("AC-44.11: un scope en correspondance exacte avec du percent-encoding devient plus strict", () => {
  // Cout ergonomique assume de la decision, documente pour que personne ne le prenne plus
  // tard pour un bug : la forme canonique /projects/groupe/projet n'est pas couverte par un
  // pattern sans wildcard, donc le scope ne matche plus sa propre ecriture.
  const exact = ["GET:/projects/groupe%2Fprojet"];
  assertEquals(checkAccess(exact, "GET", "/projects/groupe%2Fprojet"), true);
  const v = checkRequestAccess(exact, "GET", "/projects/groupe%2Fprojet");
  assertEquals(v.allowed, false);
  assertEquals(v.denial?.axis, "path_encoded");

  // Le contournement est le wildcard, et il reste ouvert : c'est la voie de sortie a
  // donner a qui tombe dessus (AC-44.4).
  assertEquals(
    checkRequestAccess(["GET:/projects/*"], "GET", "/projects/groupe%2Fprojet").allowed,
    true,
  );
});

Deno.test("AC-46.1: la query n'est pas contrainte et le verdict le dit", () => {
  const v = checkRequestAccess(["GET:/v1/items"], "GET", "/v1/items?action=delete&scope=all");
  assertEquals(v.allowed, true);
  assertEquals(v.queryConstrained, false);
});
