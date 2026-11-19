import { readFile, writeFile } from "node:fs/promises";

const SRC = "docs/changelog.md";
const OUT = "src/ui/changelog-data.ts";

const markdown = await readFile(SRC, "utf8");

const content = `// Auto-generated from ${SRC} by scripts/changelog.ts. Do not edit manually.
export const CHANGELOG_MARKDOWN = ${JSON.stringify(markdown)};
`;

await writeFile(OUT, content);
console.log(`changelog: ${markdown.length} chars → ${OUT}`);
