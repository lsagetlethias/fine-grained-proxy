interface ParsedScope {
  methods: string[];
  pattern: string;
}

export function parseScope(scope: string): ParsedScope {
  const colonIdx = scope.indexOf(":");
  if (colonIdx === -1) {
    return { methods: ["*"], pattern: scope };
  }
  const methodPart = scope.slice(0, colonIdx);
  const pattern = scope.slice(colonIdx + 1);
  const methods = (methodPart.includes("|") ? methodPart.split("|") : [methodPart]).map((m) =>
    m.toUpperCase()
  );
  return { methods, pattern };
}

export function matchPath(pattern: string, path: string): boolean {
  if (pattern === "*") return true;
  if (!pattern.includes("*")) return pattern === path;

  const wildcardIdx = pattern.indexOf("*");
  const prefix = pattern.slice(0, wildcardIdx);
  return path.startsWith(prefix);
}

export function checkAccess(scopes: string[], method: string, path: string): boolean {
  const upperMethod = method.toUpperCase();
  for (const scope of scopes) {
    const parsed = parseScope(scope);
    const methodMatch = parsed.methods.includes("*") || parsed.methods.includes(upperMethod);
    if (methodMatch && matchPath(parsed.pattern, path)) return true;
  }
  return false;
}
