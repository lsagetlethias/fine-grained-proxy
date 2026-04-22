import { assertEquals, assertStringIncludes } from "@std/assert";

import { renderChangelog } from "../../../src/ui/changelog-renderer.tsx";

async function render(markdown: string): Promise<string> {
  const node = renderChangelog(markdown) as { toString(): string | Promise<string> };
  const out = await node.toString();
  return out;
}

function silenceWarn<T>(fn: () => Promise<T> | T): Promise<{ result: T; warnings: string[] }> {
  return new Promise((resolve) => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    };
    Promise.resolve(fn()).then((result) => {
      console.warn = originalWarn;
      resolve({ result, warnings });
    });
  });
}

Deno.test("changelog renderer: ## date produces section with h3", async () => {
  const html = await render("## 22 avril 2026\n\n- item unique\n");
  assertStringIncludes(html, "<section");
  assertStringIncludes(
    html,
    `class="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-2 uppercase tracking-wider"`,
  );
  assertStringIncludes(html, "22 avril 2026");
  assertStringIncludes(html, "<ul");
  assertStringIncludes(html, "<li");
});

Deno.test("changelog renderer: bullets parsed in list", async () => {
  const html = await render("## Date\n\n- premier\n- second\n- troisième\n");
  const liCount = (html.match(/<li\b/g) ?? []).length;
  assertEquals(liCount, 3);
  assertStringIncludes(html, "premier");
  assertStringIncludes(html, "second");
  assertStringIncludes(html, "troisième");
});

Deno.test("changelog renderer: **bold** produces <strong>", async () => {
  const html = await render("## Date\n\n- texte **important** ici\n");
  assertStringIncludes(html, "<strong");
  assertStringIncludes(html, "important");
  assertStringIncludes(html, "</strong>");
});

Deno.test("changelog renderer: `code` produces monospace <code>", async () => {
  const html = await render("## Date\n\n- use `X-FGP-Key` header\n");
  assertStringIncludes(html, `class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded"`);
  assertStringIncludes(html, "X-FGP-Key");
  assertStringIncludes(html, "</code>");
});

Deno.test("changelog renderer: [text](url) produces anchor with fgp classes", async () => {
  const html = await render("## Date\n\n- see [Swagger](/api/docs) for more\n");
  assertStringIncludes(html, `href="/api/docs"`);
  assertStringIncludes(html, `class="text-fgp-600 dark:text-fgp-400 hover:underline"`);
  assertStringIncludes(html, "Swagger");
  assertStringIncludes(html, "</a>");
});

Deno.test("changelog renderer: external https link has target + rel", async () => {
  const html = await render("## Date\n\n- voir [GitHub](https://github.com/foo/bar)\n");
  assertStringIncludes(html, `href="https://github.com/foo/bar"`);
  assertStringIncludes(html, `target="_blank"`);
  assertStringIncludes(html, `rel="noopener noreferrer"`);
});

Deno.test("changelog renderer: link with javascript: href is rejected (rendered as text)", async () => {
  const { result: html, warnings } = await silenceWarn(() =>
    render("## Date\n\n- [evil](javascript:alert(1))\n")
  );
  assertEquals(html.includes(`href="javascript:`), false);
  assertEquals(html.includes("javascript:alert(1)"), true);
  assertEquals(warnings.some((w) => w.includes("rejected link href")), true);
});

Deno.test("changelog renderer: link with data: href is rejected", async () => {
  const { result: html, warnings } = await silenceWarn(() =>
    render("## Date\n\n- [x](data:text/html,<script>alert(1)</script>)\n")
  );
  assertEquals(html.includes(`href="data:`), false);
  assertEquals(warnings.some((w) => w.includes("rejected link href")), true);
});

Deno.test("changelog renderer: link with mailto is rejected (only / and https allowed)", async () => {
  const { result: html, warnings } = await silenceWarn(() =>
    render("## Date\n\n- [mail](mailto:foo@bar.com)\n")
  );
  assertEquals(html.includes(`href="mailto:`), false);
  assertEquals(warnings.length > 0, true);
});

Deno.test("changelog renderer: unterminated bold falls back to text with warning", async () => {
  const { result: html, warnings } = await silenceWarn(() =>
    render("## Date\n\n- texte **pas fermé ici\n")
  );
  assertEquals(html.includes("<strong>"), false);
  assertStringIncludes(html, "**pas fermé ici");
  assertEquals(warnings.some((w) => w.includes("unterminated bold")), true);
});

Deno.test("changelog renderer: unterminated code falls back to text with warning", async () => {
  const { result: html, warnings } = await silenceWarn(() =>
    render("## Date\n\n- use `pas fermé\n")
  );
  assertEquals(html.includes(`<code class="font-mono`), false);
  assertStringIncludes(html, "`pas fermé");
  assertEquals(warnings.some((w) => w.includes("unterminated code")), true);
});

Deno.test("changelog renderer: nested bullets warn and render raw", async () => {
  const { result: html, warnings } = await silenceWarn(() =>
    render("## Date\n\n- parent\n  - nested\n")
  );
  assertStringIncludes(html, "parent");
  assertEquals(warnings.some((w) => w.includes("unsupported markdown construct")), true);
  assertStringIncludes(html, "<p");
});

Deno.test("changelog renderer: ordered list warns and renders raw", async () => {
  const { result: _html, warnings } = await silenceWarn(() =>
    render("## Date\n\n- ok\n\n1. ordered\n")
  );
  assertEquals(warnings.some((w) => w.includes("unsupported markdown construct")), true);
});

Deno.test("changelog renderer: h3 heading warns and renders raw", async () => {
  const { result: _html, warnings } = await silenceWarn(() =>
    render("## Date\n\n- ok\n\n### subheading\n")
  );
  assertEquals(warnings.some((w) => w.includes("unsupported heading level")), true);
});

Deno.test("changelog renderer: h1 line is silently skipped", async () => {
  const { result: html, warnings } = await silenceWarn(() =>
    render("# Changelog\n\n## 22 avril\n\n- item\n")
  );
  assertEquals(html.includes("Changelog"), false);
  assertStringIncludes(html, "22 avril");
  assertEquals(warnings.length, 0);
});

Deno.test("changelog renderer: multiple sections", async () => {
  const html = await render("## 22 avril\n\n- a\n\n## 16 avril\n\n- b\n\n## 9 avril\n\n- c\n");
  const sectionCount = (html.match(/<section\b/g) ?? []).length;
  assertEquals(sectionCount, 3);
  assertStringIncludes(html, "22 avril");
  assertStringIncludes(html, "16 avril");
  assertStringIncludes(html, "9 avril");
});

Deno.test("changelog renderer: mixed inline — bold + code + link in one line", async () => {
  const html = await render(
    "## Date\n\n- **Breaking** : le code `upstream_error` disparaît, voir [docs](/api/docs)\n",
  );
  assertStringIncludes(html, "<strong");
  assertStringIncludes(html, "Breaking");
  assertStringIncludes(html, `class="font-mono`);
  assertStringIncludes(html, "upstream_error");
  assertStringIncludes(html, `href="/api/docs"`);
});

Deno.test("changelog renderer: HTML special chars in text are escaped", async () => {
  const html = await render("## Date\n\n- <script>alert(1)</script>\n");
  assertEquals(html.includes("<script>alert"), false);
  assertStringIncludes(html, "&lt;script&gt;");
});

Deno.test("changelog renderer: HTML special chars in code are escaped", async () => {
  const html = await render("## Date\n\n- `<div>` element\n");
  assertEquals(html.match(/<code[^>]*><div>/), null);
  assertStringIncludes(html, "&lt;div&gt;");
});

Deno.test("changelog renderer: empty markdown produces empty wrapper", async () => {
  const html = await render("");
  assertStringIncludes(html, `<div class="space-y-6">`);
  assertEquals(html.includes("<section>"), false);
});

Deno.test("changelog renderer: bullet outside section is skipped with warning", async () => {
  const { result: html, warnings } = await silenceWarn(() => render("- orphan bullet\n"));
  assertEquals(html.includes("<li>"), false);
  assertEquals(html.includes("orphan"), false);
  assertEquals(warnings.some((w) => w.includes("bullet outside of section")), true);
});

Deno.test("changelog renderer: pipe | character in code preserved", async () => {
  const html = await render("## Date\n\n- header `X-FGP-Source: proxy|upstream`\n");
  assertStringIncludes(html, "X-FGP-Source: proxy|upstream");
});
