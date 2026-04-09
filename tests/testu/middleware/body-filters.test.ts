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
