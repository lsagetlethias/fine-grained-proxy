import { assertEquals } from "@std/assert";

// src/ui/logs-client.ts touche au DOM et ne peut pas etre importe sous la config serveur qui
// type-checke les tests : la verification passe par le bundle livre, comme AC-46.6. Ce
// fichier exige donc un deno task build:client prealable.
const BUNDLE = await Deno.readTextFile("static/logs-client.js");

Deno.test("AC-57.6: SECURITE, la page /logs ne construit aucun noeud depuis une chaine", () => {
  // Un nom de parametre est une chaine entierement controlee par l'appelant, qui traverse le
  // serveur jusqu'au navigateur de l'auteur du blob : c'est le seul chemin d'injection ouvert
  // par la decision de §14.6. Le rendu se fait par textContent, et la seule facon pour un
  // « <img src=x onerror=...> » de devenir un noeud est qu'un innerHTML reapparaisse ici.
  // Le marqueur tient parce qu'esbuild ne mangle pas les noms de proprietes du DOM.
  assertEquals(
    BUNDLE.includes("innerHTML"),
    false,
    "innerHTML est revenu dans le bundle /logs : un nom de parametre d'appelant peut " +
      "redevenir du HTML dans la page de son auteur",
  );
  assertEquals(BUNDLE.includes("insertAdjacentHTML"), false);
  assertEquals(BUNDLE.includes("outerHTML"), false);
});

Deno.test("AC-57.6 bis: TEMOIN, le bundle rend bien les noms de parametres", () => {
  // Sans ce temoin, le test precedent resterait vert sur un bundle d'ou l'affichage des noms
  // aurait entierement disparu : il ne prouverait plus rien de la surface qu'il protege.
  assertEquals(
    BUNDLE.includes("queryParamNames"),
    true,
    "l'affichage des noms de parametres a disparu du bundle /logs",
  );
  assertEquals(BUNDLE.includes("textContent"), true);
});
