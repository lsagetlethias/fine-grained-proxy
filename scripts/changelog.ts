const SRC = "docs/changelog.md";
const OUT = "src/ui/changelog-data.ts";

const markdown = await Deno.readTextFile(SRC);

const content = `// Auto-generated from ${SRC} by scripts/changelog.ts — do not edit manually.
export const CHANGELOG_MARKDOWN = ${JSON.stringify(markdown)};
`;

await Deno.writeTextFile(OUT, content);
console.log(`changelog: ${markdown.length} chars → ${OUT}`);
