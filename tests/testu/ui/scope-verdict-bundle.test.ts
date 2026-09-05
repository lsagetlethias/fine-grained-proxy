import { assertEquals } from "@std/assert";

// Le bundle navigateur est le seul endroit ou l'on peut constater ce que le testeur de
// scopes execute reellement une fois livre : src/ui/client/test-scope.ts touche au DOM et
// ne peut pas etre importe sous la config serveur qui type-checke les tests. Lu depuis
// static/ comme AC-10.5 et la parite de copy : les taches de test tournent sur une
// allow-list de lecture qui ne couvre que static, et l'elargir annulerait ce durcissement.
// Ce fichier exige donc un deno task build:client prealable.
const BUNDLE = await Deno.readTextFile("static/client.js");

Deno.test("AC-46.6: STRUCTUREL, le navigateur embarque la lecture des scopes a deux formes", () => {
  // decodeURIComponent n'apparait dans le graphe client que via canonicalizePath, appele
  // par la seule checkRequestAccess. esbuild elague ce qui n'est pas atteignable depuis
  // l'entree : sa presence atteste que le testeur appelle la fonction d'autorisation du
  // proxy, et non checkAccess, qui ne controle qu'une seule forme du chemin.
  //
  // Le marqueur ne se choisit pas au hasard. « path_encoded », candidat evident, reste dans
  // le bundle meme quand checkRequestAccess a disparu : il vit dans une table de rangs
  // partagee avec checkAccess. Un test bati dessus serait vert sur le code vulnerable.
  assertEquals(
    BUNDLE.includes("decodeURIComponent"),
    true,
    "la canonicalisation du chemin a disparu du bundle : le testeur ne partage plus la " +
      "lecture des scopes du proxy, et il peut de nouveau affirmer un verdict que la " +
      "production n'applique pas",
  );
});

Deno.test("AC-49.3 (registre v5) bis: le bundle n'appelle aucune route serveur pour un verdict de scope", () => {
  // La troisieme lecture des scopes, le handler serveur, a ete supprimee (AC-49.1). Un
  // appel a cette route depuis le navigateur signifierait qu'elle est revenue.
  assertEquals(
    BUNDLE.includes("/api/test-scope"),
    false,
    "le bundle reference /api/test-scope",
  );
  // /api/test-proxy demeure et reste la voie de migration (AC-49.4) : c'est un test de
  // bout en bout declenche par un bouton, pas le calcul du verdict.
  assertEquals(
    BUNDLE.includes("/api/test-proxy"),
    true,
    "la voie de repli /api/test-proxy a disparu du bundle",
  );
});
