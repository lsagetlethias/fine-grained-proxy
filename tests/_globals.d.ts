// Le type global que Deno fournissait et que @types/node ne declare pas, restaure ici une
// fois pour toutes plutot qu'annote sur chacun des 300 sites qui lisent un corps JSON.
//
// HeadersInit et BodyInit sont derives des constructeurs reellement declares par Node, et
// non recopies : un type recopie se perimerait en silence le jour ou Node bougerait le sien.
//
// json() rend any et non unknown parce que c'est ce que rendait Deno : annoter les sites
// serait reecrire les tests, donc changer ce qu'ils verifient.

declare global {
  type HeadersInit = ConstructorParameters<typeof Headers>[0];
  type BodyInit = NonNullable<ConstructorParameters<typeof Response>[0]>;

  interface Response {
    // biome-ignore lint/suspicious/noExplicitAny: le type de Deno, que les tests supposent
    json(): Promise<any>;
  }
}

export {};
