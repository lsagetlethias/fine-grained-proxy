import { assertEquals } from "@std/assert";

import {
  type BodyFilter,
  checkAccess,
  matchBodyFilter,
  type Scope,
} from "../../../src/middleware/scopes.ts";

// --- matchBodyFilter ---

Deno.test("matchBodyFilter: exact match with type any", () => {
  const filter: BodyFilter = {
    objectPath: "name",
    objectValue: [{ type: "any", value: "hello" }],
  };
  assertEquals(matchBodyFilter(filter, { name: "hello" }), true);
  assertEquals(matchBodyFilter(filter, { name: "world" }), false);
});

Deno.test("matchBodyFilter: exact match number", () => {
  const filter: BodyFilter = {
    objectPath: "count",
    objectValue: [{ type: "any", value: 42 }],
  };
  assertEquals(matchBodyFilter(filter, { count: 42 }), true);
  assertEquals(matchBodyFilter(filter, { count: 43 }), false);
});

Deno.test("matchBodyFilter: exact match boolean", () => {
  const filter: BodyFilter = {
    objectPath: "active",
    objectValue: [{ type: "any", value: true }],
  };
  assertEquals(matchBodyFilter(filter, { active: true }), true);
  assertEquals(matchBodyFilter(filter, { active: false }), false);
});

Deno.test("matchBodyFilter: exact match null", () => {
  const filter: BodyFilter = {
    objectPath: "data",
    objectValue: [{ type: "any", value: null }],
  };
  assertEquals(matchBodyFilter(filter, { data: null }), true);
  assertEquals(matchBodyFilter(filter, { data: "something" }), false);
});

Deno.test("matchBodyFilter: wildcard — field exists", () => {
  const filter: BodyFilter = {
    objectPath: "name",
    objectValue: [{ type: "wildcard" }],
  };
  assertEquals(matchBodyFilter(filter, { name: "anything" }), true);
  assertEquals(matchBodyFilter(filter, { name: 0 }), true);
  assertEquals(matchBodyFilter(filter, { name: null }), true);
  assertEquals(matchBodyFilter(filter, { name: false }), true);
});

Deno.test("matchBodyFilter: wildcard — field absent returns false", () => {
  const filter: BodyFilter = {
    objectPath: "missing",
    objectValue: [{ type: "wildcard" }],
  };
  assertEquals(matchBodyFilter(filter, { other: "value" }), false);
});

Deno.test("matchBodyFilter: stringwildcard with glob pattern", () => {
  const filter: BodyFilter = {
    objectPath: "branch",
    objectValue: [{ type: "stringwildcard", value: "release/*" }],
  };
  assertEquals(matchBodyFilter(filter, { branch: "release/1.0" }), true);
  assertEquals(matchBodyFilter(filter, { branch: "release/2.0.1" }), true);
  assertEquals(matchBodyFilter(filter, { branch: "main" }), false);
  assertEquals(matchBodyFilter(filter, { branch: 42 }), false);
});

Deno.test("matchBodyFilter: stringwildcard exact match (no glob)", () => {
  const filter: BodyFilter = {
    objectPath: "ref",
    objectValue: [{ type: "stringwildcard", value: "main" }],
  };
  assertEquals(matchBodyFilter(filter, { ref: "main" }), true);
  assertEquals(matchBodyFilter(filter, { ref: "develop" }), false);
});

Deno.test("matchBodyFilter: OR implicite — au moins un objectValue matche", () => {
  const filter: BodyFilter = {
    objectPath: "ref",
    objectValue: [
      { type: "any", value: "main" },
      { type: "any", value: "master" },
      { type: "stringwildcard", value: "release/*" },
    ],
  };
  assertEquals(matchBodyFilter(filter, { ref: "main" }), true);
  assertEquals(matchBodyFilter(filter, { ref: "master" }), true);
  assertEquals(matchBodyFilter(filter, { ref: "release/v2" }), true);
  assertEquals(matchBodyFilter(filter, { ref: "develop" }), false);
});

Deno.test("matchBodyFilter: and — all sub-values must match", () => {
  const filter: BodyFilter = {
    objectPath: "ref",
    objectValue: [
      {
        type: "and",
        value: [
          { type: "stringwildcard", value: "release/*" },
          { type: "stringwildcard", value: "*/stable" },
        ],
      },
    ],
  };
  assertEquals(matchBodyFilter(filter, { ref: "release/stable" }), true);
  assertEquals(matchBodyFilter(filter, { ref: "release/beta" }), false);
  assertEquals(matchBodyFilter(filter, { ref: "main/stable" }), false);
});

Deno.test("matchBodyFilter: dot-path nested object traversal", () => {
  const filter: BodyFilter = {
    objectPath: "deployment.git_ref",
    objectValue: [{ type: "any", value: "main" }],
  };
  assertEquals(
    matchBodyFilter(filter, { deployment: { git_ref: "main" } }),
    true,
  );
  assertEquals(
    matchBodyFilter(filter, { deployment: { git_ref: "develop" } }),
    false,
  );
});

Deno.test("matchBodyFilter: deeply nested dot-path", () => {
  const filter: BodyFilter = {
    objectPath: "a.b.c.d",
    objectValue: [{ type: "any", value: 1 }],
  };
  assertEquals(
    matchBodyFilter(filter, { a: { b: { c: { d: 1 } } } }),
    true,
  );
  assertEquals(
    matchBodyFilter(filter, { a: { b: { c: { d: 2 } } } }),
    false,
  );
});

Deno.test("matchBodyFilter: absent field returns false", () => {
  const filter: BodyFilter = {
    objectPath: "deployment.git_ref",
    objectValue: [{ type: "wildcard" }],
  };
  assertEquals(matchBodyFilter(filter, { deployment: {} }), false);
  assertEquals(matchBodyFilter(filter, {}), false);
  assertEquals(matchBodyFilter(filter, { other: "value" }), false);
});

Deno.test("matchBodyFilter: body is null or not an object", () => {
  const filter: BodyFilter = {
    objectPath: "field",
    objectValue: [{ type: "wildcard" }],
  };
  assertEquals(matchBodyFilter(filter, null), false);
  assertEquals(matchBodyFilter(filter, "string"), false);
  assertEquals(matchBodyFilter(filter, 42), false);
});

Deno.test("matchBodyFilter: unknown type defaults to deny", () => {
  const filter: BodyFilter = {
    objectPath: "field",
    objectValue: [{ type: "regex" as "any", value: ".*" }],
  };
  assertEquals(matchBodyFilter(filter, { field: "anything" }), false);
});

// --- checkAccess with ScopeEntry ---

Deno.test("checkAccess: ScopeEntry without bodyFilters matches method + path", () => {
  const scopes: Scope[] = [
    { methods: ["GET"], pattern: "/v1/apps/*" },
  ];
  assertEquals(checkAccess(scopes, "GET", "/v1/apps/my-app"), true);
  assertEquals(checkAccess(scopes, "POST", "/v1/apps/my-app"), false);
});

Deno.test("checkAccess: ScopeEntry with bodyFilters — body matches", () => {
  const scopes: Scope[] = [
    {
      methods: ["POST"],
      pattern: "/v1/apps/my-app/deployments",
      bodyFilters: [
        {
          objectPath: "deployment.git_ref",
          objectValue: [
            { type: "any", value: "main" },
            { type: "any", value: "master" },
          ],
        },
      ],
    },
  ];
  assertEquals(
    checkAccess(scopes, "POST", "/v1/apps/my-app/deployments", {
      deployment: { git_ref: "main" },
    }),
    true,
  );
  assertEquals(
    checkAccess(scopes, "POST", "/v1/apps/my-app/deployments", {
      deployment: { git_ref: "develop" },
    }),
    false,
  );
});

Deno.test("checkAccess: ScopeEntry with bodyFilters AND — all filters must match", () => {
  const scopes: Scope[] = [
    {
      methods: ["POST"],
      pattern: "/v1/apps/my-app/deployments",
      bodyFilters: [
        {
          objectPath: "deployment.git_ref",
          objectValue: [{ type: "any", value: "main" }],
        },
        {
          objectPath: "deployment.source_url",
          objectValue: [{ type: "stringwildcard", value: "https://github.com/my-org/*" }],
        },
      ],
    },
  ];
  assertEquals(
    checkAccess(scopes, "POST", "/v1/apps/my-app/deployments", {
      deployment: { git_ref: "main", source_url: "https://github.com/my-org/repo" },
    }),
    true,
  );
  assertEquals(
    checkAccess(scopes, "POST", "/v1/apps/my-app/deployments", {
      deployment: { git_ref: "main", source_url: "https://gitlab.com/other/repo" },
    }),
    false,
  );
});

Deno.test("checkAccess: ScopeEntry with bodyFilters — no body provided returns false", () => {
  const scopes: Scope[] = [
    {
      methods: ["POST"],
      pattern: "/v1/apps/my-app/deployments",
      bodyFilters: [
        {
          objectPath: "deployment.git_ref",
          objectValue: [{ type: "any", value: "main" }],
        },
      ],
    },
  ];
  assertEquals(
    checkAccess(scopes, "POST", "/v1/apps/my-app/deployments"),
    false,
  );
});

Deno.test("checkAccess: ScopeEntry wildcard method", () => {
  const scopes: Scope[] = [
    { methods: ["*"], pattern: "/v1/apps/*" },
  ];
  assertEquals(checkAccess(scopes, "GET", "/v1/apps/my-app"), true);
  assertEquals(checkAccess(scopes, "DELETE", "/v1/apps/my-app"), true);
});

Deno.test("checkAccess: mixed string + ScopeEntry scopes", () => {
  const scopes: Scope[] = [
    "GET:/v1/apps/*",
    {
      methods: ["POST"],
      pattern: "/v1/apps/my-app/deployments",
      bodyFilters: [
        {
          objectPath: "deployment.git_ref",
          objectValue: [{ type: "any", value: "main" }],
        },
      ],
    },
  ];
  assertEquals(checkAccess(scopes, "GET", "/v1/apps/my-app"), true);
  assertEquals(
    checkAccess(scopes, "POST", "/v1/apps/my-app/deployments", {
      deployment: { git_ref: "main" },
    }),
    true,
  );
  assertEquals(
    checkAccess(scopes, "POST", "/v1/apps/my-app/deployments", {
      deployment: { git_ref: "develop" },
    }),
    false,
  );
});

// --- backward compat ---

Deno.test("checkAccess: string scopes backward compat (unchanged behavior)", () => {
  assertEquals(checkAccess(["GET:/v1/apps/*"], "GET", "/v1/apps/my-app"), true);
  assertEquals(checkAccess(["GET:/v1/apps/*"], "POST", "/v1/apps/my-app"), false);
  assertEquals(checkAccess(["*:*"], "DELETE", "/anything"), true);
  assertEquals(checkAccess([], "GET", "/v1/apps"), false);
});

Deno.test("checkAccess: ScopeEntry multiple methods", () => {
  const scopes: Scope[] = [
    { methods: ["GET", "POST"], pattern: "/v1/apps/*" },
  ];
  assertEquals(checkAccess(scopes, "GET", "/v1/apps/my-app"), true);
  assertEquals(checkAccess(scopes, "POST", "/v1/apps/my-app"), true);
  assertEquals(checkAccess(scopes, "DELETE", "/v1/apps/my-app"), false);
});

// --- Dot-path edge cases ---

Deno.test("matchBodyFilter: 3+ levels deep nested path", () => {
  const filter: BodyFilter = {
    objectPath: "a.b.c.d.e",
    objectValue: [{ type: "any", value: "deep" }],
  };
  assertEquals(
    matchBodyFilter(filter, { a: { b: { c: { d: { e: "deep" } } } } }),
    true,
  );
  assertEquals(
    matchBodyFilter(filter, { a: { b: { c: { d: { e: "nope" } } } } }),
    false,
  );
});

Deno.test("matchBodyFilter: dot-path through array index", () => {
  const filter: BodyFilter = {
    objectPath: "items.0.name",
    objectValue: [{ type: "any", value: "first" }],
  };
  assertEquals(
    matchBodyFilter(filter, { items: [{ name: "first" }] }),
    true,
  );
  assertEquals(
    matchBodyFilter(filter, { items: { "0": { name: "first" } } }),
    true,
  );
  assertEquals(
    matchBodyFilter(filter, { items: [{ name: "second" }] }),
    false,
  );
});

Deno.test("matchBodyFilter: intermediate level is null", () => {
  const filter: BodyFilter = {
    objectPath: "a.b.c",
    objectValue: [{ type: "wildcard" }],
  };
  assertEquals(matchBodyFilter(filter, { a: { b: null } }), false);
});

Deno.test("matchBodyFilter: intermediate level is primitive", () => {
  const filter: BodyFilter = {
    objectPath: "a.b.c",
    objectValue: [{ type: "wildcard" }],
  };
  assertEquals(matchBodyFilter(filter, { a: { b: "string" } }), false);
  assertEquals(matchBodyFilter(filter, { a: { b: 42 } }), false);
  assertEquals(matchBodyFilter(filter, { a: { b: true } }), false);
});

Deno.test("matchBodyFilter: intermediate level is absent", () => {
  const filter: BodyFilter = {
    objectPath: "a.b.c",
    objectValue: [{ type: "wildcard" }],
  };
  assertEquals(matchBodyFilter(filter, { a: {} }), false);
  assertEquals(matchBodyFilter(filter, { x: 1 }), false);
});

// --- ObjectValue edge cases ---

Deno.test("matchBodyFilter: and with single element", () => {
  const filter: BodyFilter = {
    objectPath: "ref",
    objectValue: [
      {
        type: "and",
        value: [{ type: "stringwildcard", value: "release/*" }],
      },
    ],
  };
  assertEquals(matchBodyFilter(filter, { ref: "release/1.0" }), true);
  assertEquals(matchBodyFilter(filter, { ref: "main" }), false);
});

Deno.test("matchBodyFilter: and with empty array — always true (vacuous truth)", () => {
  const filter: BodyFilter = {
    objectPath: "ref",
    objectValue: [
      { type: "and", value: [] },
    ],
  };
  assertEquals(matchBodyFilter(filter, { ref: "anything" }), true);
});

Deno.test("matchBodyFilter: stringwildcard on number value returns false", () => {
  const filter: BodyFilter = {
    objectPath: "count",
    objectValue: [{ type: "stringwildcard", value: "42*" }],
  };
  assertEquals(matchBodyFilter(filter, { count: 42 }), false);
  assertEquals(matchBodyFilter(filter, { count: 420 }), false);
});

Deno.test("matchBodyFilter: stringwildcard on boolean value returns false", () => {
  const filter: BodyFilter = {
    objectPath: "active",
    objectValue: [{ type: "stringwildcard", value: "true" }],
  };
  assertEquals(matchBodyFilter(filter, { active: true }), false);
});

Deno.test("matchBodyFilter: stringwildcard on null value returns false", () => {
  const filter: BodyFilter = {
    objectPath: "data",
    objectValue: [{ type: "stringwildcard", value: "*" }],
  };
  assertEquals(matchBodyFilter(filter, { data: null }), false);
});

Deno.test("matchBodyFilter: stringwildcard on array value returns false", () => {
  const filter: BodyFilter = {
    objectPath: "tags",
    objectValue: [{ type: "stringwildcard", value: "*" }],
  };
  assertEquals(matchBodyFilter(filter, { tags: ["a", "b"] }), false);
});

Deno.test("matchBodyFilter: any with null as expected value", () => {
  const filter: BodyFilter = {
    objectPath: "field",
    objectValue: [{ type: "any", value: null }],
  };
  assertEquals(matchBodyFilter(filter, { field: null }), true);
  assertEquals(matchBodyFilter(filter, { field: undefined }), false);
  assertEquals(matchBodyFilter(filter, { field: 0 }), false);
  assertEquals(matchBodyFilter(filter, { field: "" }), false);
  assertEquals(matchBodyFilter(filter, { field: false }), false);
});

Deno.test("matchBodyFilter: any with boolean values", () => {
  const filter: BodyFilter = {
    objectPath: "flag",
    objectValue: [{ type: "any", value: true }],
  };
  assertEquals(matchBodyFilter(filter, { flag: true }), true);
  assertEquals(matchBodyFilter(filter, { flag: false }), false);
  assertEquals(matchBodyFilter(filter, { flag: 1 }), false);
  assertEquals(matchBodyFilter(filter, { flag: "true" }), false);
});

Deno.test("matchBodyFilter: any with array as value — deep equality", () => {
  const filter: BodyFilter = {
    objectPath: "tags",
    objectValue: [{ type: "any", value: ["a", "b"] }],
  };
  assertEquals(matchBodyFilter(filter, { tags: ["a", "b"] }), true);
  assertEquals(matchBodyFilter(filter, { tags: ["a"] }), false);
  assertEquals(matchBodyFilter(filter, { tags: ["b", "a"] }), false);
  assertEquals(matchBodyFilter(filter, { tags: "a,b" }), false);
});

Deno.test("matchBodyFilter: any with nested object as value — deep equality", () => {
  const filter: BodyFilter = {
    objectPath: "config",
    objectValue: [{ type: "any", value: { key: "val" } }],
  };
  assertEquals(matchBodyFilter(filter, { config: { key: "val" } }), true);
  assertEquals(
    matchBodyFilter(filter, { config: { key: "val", extra: true } }),
    false,
  );
  assertEquals(matchBodyFilter(filter, { config: {} }), false);
});

// --- Body edge cases ---

Deno.test("matchBodyFilter: empty object body — field absent", () => {
  const filter: BodyFilter = {
    objectPath: "name",
    objectValue: [{ type: "wildcard" }],
  };
  assertEquals(matchBodyFilter(filter, {}), false);
});

Deno.test("matchBodyFilter: body is an array (not object)", () => {
  const filter: BodyFilter = {
    objectPath: "0",
    objectValue: [{ type: "wildcard" }],
  };
  assertEquals(matchBodyFilter(filter, [1, 2, 3]), true);
});

Deno.test("matchBodyFilter: body is an array — dot-path through it", () => {
  const filter: BodyFilter = {
    objectPath: "0.name",
    objectValue: [{ type: "any", value: "first" }],
  };
  assertEquals(matchBodyFilter(filter, [{ name: "first" }]), true);
  assertEquals(matchBodyFilter(filter, [{ name: "second" }]), false);
});

Deno.test("matchBodyFilter: extra fields in body are ignored", () => {
  const filter: BodyFilter = {
    objectPath: "name",
    objectValue: [{ type: "any", value: "hello" }],
  };
  assertEquals(
    matchBodyFilter(filter, { name: "hello", extra: "ignored", more: 123 }),
    true,
  );
});

Deno.test("checkAccess: body = {} with bodyFilters on nested field → false", () => {
  const scopes: Scope[] = [
    {
      methods: ["POST"],
      pattern: "/v1/test",
      bodyFilters: [
        {
          objectPath: "data.field",
          objectValue: [{ type: "wildcard" }],
        },
      ],
    },
  ];
  assertEquals(checkAccess(scopes, "POST", "/v1/test", {}), false);
});

Deno.test("checkAccess: body = null with bodyFilters → false", () => {
  const scopes: Scope[] = [
    {
      methods: ["POST"],
      pattern: "/v1/test",
      bodyFilters: [
        {
          objectPath: "field",
          objectValue: [{ type: "wildcard" }],
        },
      ],
    },
  ];
  assertEquals(checkAccess(scopes, "POST", "/v1/test", null), false);
});

// --- Mixed scopes: string + ScopeEntry interaction ---

Deno.test("checkAccess: string scope matches → ScopeEntry bodyFilter irrelevant", () => {
  const scopes: Scope[] = [
    "POST:/v1/apps/my-app/deployments",
    {
      methods: ["POST"],
      pattern: "/v1/apps/my-app/deployments",
      bodyFilters: [
        {
          objectPath: "deployment.git_ref",
          objectValue: [{ type: "any", value: "main" }],
        },
      ],
    },
  ];
  assertEquals(
    checkAccess(scopes, "POST", "/v1/apps/my-app/deployments", {
      deployment: { git_ref: "develop" },
    }),
    true,
  );
});

Deno.test("checkAccess: string scope doesn't match method → falls through to ScopeEntry", () => {
  const scopes: Scope[] = [
    "GET:/v1/apps/my-app/deployments",
    {
      methods: ["POST"],
      pattern: "/v1/apps/my-app/deployments",
      bodyFilters: [
        {
          objectPath: "deployment.git_ref",
          objectValue: [{ type: "any", value: "main" }],
        },
      ],
    },
  ];
  assertEquals(
    checkAccess(scopes, "POST", "/v1/apps/my-app/deployments", {
      deployment: { git_ref: "main" },
    }),
    true,
  );
  assertEquals(
    checkAccess(scopes, "POST", "/v1/apps/my-app/deployments", {
      deployment: { git_ref: "develop" },
    }),
    false,
  );
});

// --- Backward compat: v2 string scopes + body argument ---

Deno.test("checkAccess: string scopes ignore body argument entirely", () => {
  const scopes: Scope[] = ["POST:/v1/apps/*"];
  assertEquals(
    checkAccess(scopes, "POST", "/v1/apps/my-app", {
      deployment: { git_ref: "anything" },
    }),
    true,
  );
  assertEquals(
    checkAccess(scopes, "POST", "/v1/apps/my-app", null),
    true,
  );
  assertEquals(
    checkAccess(scopes, "POST", "/v1/apps/my-app", {}),
    true,
  );
});

Deno.test("checkAccess: empty bodyFilters array → no body check needed", () => {
  const scopes: Scope[] = [
    { methods: ["POST"], pattern: "/v1/test", bodyFilters: [] },
  ];
  assertEquals(checkAccess(scopes, "POST", "/v1/test"), true);
  assertEquals(checkAccess(scopes, "POST", "/v1/test", { anything: true }), true);
});

// --- OR + AND composition edge cases ---

Deno.test("matchBodyFilter: OR with mixed types — first any matches, rest ignored", () => {
  const filter: BodyFilter = {
    objectPath: "ref",
    objectValue: [
      { type: "any", value: "main" },
      { type: "stringwildcard", value: "release/*" },
      { type: "and", value: [{ type: "any", value: "nope" }] },
    ],
  };
  assertEquals(matchBodyFilter(filter, { ref: "main" }), true);
});

Deno.test("matchBodyFilter: OR — none match → false", () => {
  const filter: BodyFilter = {
    objectPath: "ref",
    objectValue: [
      { type: "any", value: "main" },
      { type: "any", value: "master" },
    ],
  };
  assertEquals(matchBodyFilter(filter, { ref: "develop" }), false);
});

Deno.test("matchBodyFilter: empty objectValue array → false (no OR candidate)", () => {
  const filter: BodyFilter = {
    objectPath: "ref",
    objectValue: [],
  };
  assertEquals(matchBodyFilter(filter, { ref: "anything" }), false);
});
