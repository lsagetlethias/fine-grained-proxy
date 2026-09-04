const GITHUB_REPO_URL = "https://github.com/lsagetlethias/fine-grained-proxy";

export function renderLlmsTxt(origin: string): string {
  const base = origin.replace(/\/+$/, "");

  return `# Fine-Grained Proxy (FGP)

> Stateless, API-agnostic HTTP proxy that adds fine-grained tokens (scoped by
> HTTP method, path and request body) in front of any API. No storage: the
> target, credentials, scopes and TTL live encrypted inside the token itself.

FGP sits between a caller and a target API. It holds no database: every proxied
request carries an encrypted blob that contains the target URL, the upstream
credentials, the allowed scopes and an expiry. The blob is decryptable only with
a client key that FGP never stores, combined with a server salt. Access is
deny-all by default: a request is forwarded only if it matches at least one
declared scope.

FGP is a transparent proxy. Any HTTP response actually received from the target
API is forwarded unchanged (status, body, headers), except \`Set-Cookie\` which is
stripped because the proxy is stateless. Errors produced by FGP itself use the
JSON shape \`{"error": "...", "message": "..."}\`. Every response carries the
\`X-FGP-Source\` header: \`upstream\` when the payload comes from the target API,
\`proxy\` when FGP produced it. Use that header to decide who to blame and whether
retrying makes sense.

Calling a proxied endpoint. Two equivalent transports:

- URL mode: \`${base}/{blob}/{path}\`, the blob is the first path segment.
- Header mode: \`${base}/{path}\` with the blob in the \`X-FGP-Blob\` header.
  Preferred, because some infrastructures cap a URL segment at 255 characters.

Both modes require the \`X-FGP-Key\` header holding the client key. Without it the
blob is useless. A blob is capped at 4096 base64url characters.

Scopes. A scope is either the string form \`METHOD:PATH\` or a structured object.
Method accepts \`*\` or a pipe-separated list. Path accepts \`*\` as a wildcard
matching at least one character:

\`\`\`
GET:/v1/apps/*              allows GET /v1/apps/my-app and deeper paths
GET|POST:/v1/apps/*         two methods on the same pattern
POST:/v1/apps/my-app/scale  exact path, exact method
*:*                         everything, use with a short TTL only
\`\`\`

Authentication modes, set in the \`auth\` field of the blob:

- \`bearer\`: sends \`Authorization: Bearer {token}\`.
- \`basic\`: sends \`Authorization: Basic base64(":" + token)\`.
- \`scalingo-exchange\`: exchanges a Scalingo account token for a bearer, then
  sends it. Cached in memory for 55 minutes.
- \`header:{name}\`: sends \`{name}: {token}\`, for APIs that do not use
  \`Authorization\`.
- \`{"type": "headers", "headers": [{"name": "...", "value": "..."}]}\`: sends
  several authentication headers at once, up to 8. A single entry is normalized
  back to the \`header:{name}\` form.
- \`{"type": "scalingo-addon", "app": "...", "addonId": "..."}\`: obtains a
  one-hour Scalingo database addon token and sends it as a bearer. Exactly one
  database per blob.

Auth headers are applied after the caller's own headers, so a consumer can never
override or neutralize the authentication carried by the blob.

Body filters restrict the JSON body of POST, PUT and PATCH requests. A scope
entry carries \`bodyFilters\`, each with an \`objectPath\` (dot-path, 6 segments
max) and an \`objectValue\` array. All filters of a scope must match (AND); the
values inside one \`objectValue\` are alternatives (OR). Available value types:

- \`{"type": "any", "value": X}\`: strict equality, JSON type included.
- \`{"type": "wildcard"}\`: the field must exist, any value.
- \`{"type": "stringwildcard", "value": "prefix/*"}\`: glob on a string.
- \`{"type": "regex", "value": "^v\\\\d+$"}\`: regular expression on a string.
- \`{"type": "not", "value": {...}}\`: negation of a single condition.
- \`{"type": "and", "value": [{...}, {...}]}\`: conjunction, at least 2 entries.

Error codes produced by FGP (\`X-FGP-Source: proxy\`):

- 400 \`invalid_request\`: the proxy path has fewer than 2 segments.
- 400 \`invalid_auth_mode\`: the blob declares an auth mode this instance ignores.
- 400 \`invalid_body\`: body filters are required but the body is not valid JSON.
- 401 \`missing_key\`: the \`X-FGP-Key\` header is absent.
- 401 \`invalid_credentials\`: wrong client key, or corrupted or malformed blob.
- 403 \`scope_denied\`: no scope matches the method, path or body.
- 410 \`token_expired\`: the blob TTL has elapsed.
- 414 \`blob_too_large\`: the blob exceeds 4096 characters.
- 500 \`internal_error\`: unexpected proxy failure.
- 502 \`upstream_unreachable\`: the target API could not be reached at all.
- 502 \`auth_exchange_failed\`: the Scalingo token exchange was refused.
- 502 \`auth_addon_failed\`: no Scalingo database token could be obtained.

Anything else is an upstream status forwarded verbatim with
\`X-FGP-Source: upstream\`, including 401, 403, 429 and 5xx. Do not read those as
proxy failures.

Generating a proxied URL, with the target credentials and the scopes:

\`\`\`
curl -X POST ${base}/api/generate \\
  -H "Content-Type: application/json" \\
  -d '{
    "token": "sk-live-xxxxxxxx",
    "target": "https://api.example.com",
    "auth": "bearer",
    "scopes": ["GET:/v2/resources/*"],
    "ttl": 3600
  }'
\`\`\`

The response is \`{"url": "...", "key": "...", "blob": "..."}\`. The key is returned
once and never stored: losing it makes the blob unusable. An optional \`key\` field
in the request lets a caller supply its own client key, 24 to 256 printable ASCII
characters without spaces.

Calling through the proxy, blob in the URL:

\`\`\`
curl -H "X-FGP-Key: <key>" ${base}/<blob>/v2/resources/42
\`\`\`

Calling through the proxy, blob in a header (recommended):

\`\`\`
curl -H "X-FGP-Key: <key>" \\
  -H "X-FGP-Blob: <blob>" \\
  ${base}/v2/resources/42
\`\`\`

## Documentation

- [OpenAPI spec](${base}/api/openapi.json): machine-readable API contract
- [Swagger UI](${base}/api/docs): interactive API documentation

## Resources

- [Configuration UI](${base}/): build a proxied URL, test scopes, share a config
- [README](${GITHUB_REPO_URL}): project overview and self-hosting
`;
}
