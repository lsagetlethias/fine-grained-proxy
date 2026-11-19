import { test } from "node:test";

// Ce fichier n'est pas un test, c'est un trou rendu visible. La campagne e2e est un
// report assume : le script test:e2e existait sous Deno alors que tests/teste2e/ n'avait
// jamais ete cree, donc il echouait sans que personne le voie. Un todo le fait apparaitre
// dans le resume de chaque run. Le supprimer en meme temps que le premier vrai test e2e.
test.todo(
  "campagne e2e : aucun test e2e n'est encore ecrit, voir docs/review/recette-e2e-deploy.md",
);
