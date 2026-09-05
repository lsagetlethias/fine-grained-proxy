import { assertEquals } from "@std/assert";

// Le testeur de scopes construit ses messages a l'execution, dans le navigateur : ils ne
// sont pas dans le HTML rendu par le serveur et aucun test de page ne peut les voir. Ce
// fichier verifie donc la parite entre la copy de docs/specs.md §12.5 et le bundle
// reellement servi, seul endroit ou ces chaines existent une fois livrees.
// Lu depuis static/ et non depuis src/ : les taches de test tournent sur une allow-list
// de lecture qui ne couvre que static, et l'elargir pour un test de copy annulerait ce
// durcissement. Ce fichier exige donc un deno task build:client prealable, comme AC-10.5.
const SOURCE = await Deno.readTextFile("static/client.js");

// Le bundle echappe les accents, en \uXXXX comme en \xXX : on compare sur la forme decodee.
const DECODED = SOURCE
  .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

function contains(needle: string): boolean {
  return DECODED.includes(needle);
}

// --- AC-56.1, AC-56.2, AC-56.9 : les trois etats de la note ---

Deno.test("AC-56.1: etat 1, la note « query non contrainte » porte la copy de la spec", () => {
  assertEquals(
    contains("La query n'est pas contrainte par les scopes : tous les paramètres passent."),
    true,
  );
});

Deno.test("AC-56.2: etat 2, la note « query contrainte » nomme le scope qui autorise", () => {
  assertEquals(contains("La query est contrainte par le scope qui vous autorise :"), true);
  // Et elle ne dit plus « au moins un scope », formulation d'avant l'arbitrage T2 : elle
  // affirmait une contrainte que le scope accordant l'acces ne portait pas forcement.
  assertEquals(contains("contrainte par au moins un scope"), false);
});

Deno.test("AC-56.9: etat 3, l'acces accorde par un scope non contraignant est dit comme tel", () => {
  assertEquals(contains("Autorisé par un scope qui ne contraint pas la query :"), true);
  // La phrase est concatenee sur deux litteraux dans la source : on verifie les deux moities.
  assertEquals(contains("D'autres scopes "), true);
  assertEquals(
    contains("de ce blob contraignent ce chemin, mais ce n'est pas celui qui a matché en premier."),
    true,
  );
});

// --- AC-56.3 a AC-56.6 : les quatre messages de detail, un par cause de refus ---

Deno.test("AC-56.3: detail, parametre non declare", () => {
  assertEquals(
    contains("non déclaré : refusé par défaut dès qu'un filtre query existe sur ce scope."),
    true,
  );
});

Deno.test("AC-56.4: detail, parametre requis absent", () => {
  assertEquals(contains("Paramètre requis "), true);
  assertEquals(contains(" absent."), true);
});

Deno.test("AC-56.5: detail, valeur non autorisee", () => {
  assertEquals(contains("non autorisée par ce filtre."), true);
});

Deno.test("AC-56.6: detail, occurrences en surnombre, message distinct des trois autres", () => {
  // Le quatrieme message, celui qui manquait a la premiere redaction de §12.5. Il doit
  // nommer le plafond et la sortie de secours, et surtout ne pas renvoyer l'utilisateur
  // verifier des valeurs qui sont toutes correctes (challenge B3).
  assertEquals(contains("occurrences de "), true);
  assertEquals(
    contains("la requête est refusée quelles que soient les valeurs."),
    true,
  );
  assertEquals(contains("le plafond passe de 4 à 64."), true);
});

Deno.test("AC-56.7: les quatre causes ont chacune leur message, aucune n'en partage un", () => {
  const messages = [
    "non déclaré : refusé par défaut",
    "Paramètre requis ",
    "occurrences de ",
    "non autorisée par ce filtre.",
  ];
  for (const message of messages) {
    assertEquals(contains(message), true, `message manquant : ${message}`);
  }
  // Les quatre raisons du verdict sont toutes traitees par le module client : une raison
  // non traitee rendrait « undefined » a l'ecran au lieu d'un diagnostic.
  // Le bundle est minifie, l'espace apres « case » disparait : on accepte les deux formes.
  for (const reason of ["undeclared", "required_missing", "too_many_occurrences", "value"]) {
    const handled = contains(`case "${reason}":`) || contains(`case"${reason}":`);
    assertEquals(handled, true, `cause non traitee : ${reason}`);
  }
});
