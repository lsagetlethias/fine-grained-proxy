import type { Child } from "hono/jsx";

type InlineNode =
  | { type: "text"; value: string }
  | { type: "bold"; children: InlineNode[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: InlineNode[] };

type Block =
  | { type: "section"; date: string; items: InlineNode[][] }
  | { type: "raw"; value: string };

const LINK_HREF_RE = /^(?:\/[^\s]*|https?:\/\/[^\s<>"']+)$/;

function warn(message: string): void {
  console.warn(`[changelog] ${message}`);
}

function parseInline(raw: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let i = 0;

  while (i < raw.length) {
    if (raw[i] === "*" && raw[i + 1] === "*") {
      const end = raw.indexOf("**", i + 2);
      if (end === -1) {
        warn(`unterminated bold at position ${i}, rendering as text`);
        nodes.push({ type: "text", value: raw.slice(i) });
        break;
      }
      nodes.push({ type: "bold", children: parseInline(raw.slice(i + 2, end)) });
      i = end + 2;
      continue;
    }

    if (raw[i] === "`") {
      const end = raw.indexOf("`", i + 1);
      if (end === -1) {
        warn(`unterminated code at position ${i}, rendering as text`);
        nodes.push({ type: "text", value: raw.slice(i) });
        break;
      }
      nodes.push({ type: "code", value: raw.slice(i + 1, end) });
      i = end + 1;
      continue;
    }

    if (raw[i] === "[") {
      const closeText = raw.indexOf("]", i + 1);
      if (closeText !== -1 && raw[closeText + 1] === "(") {
        const closeUrl = raw.indexOf(")", closeText + 2);
        if (closeUrl !== -1) {
          const text = raw.slice(i + 1, closeText);
          const href = raw.slice(closeText + 2, closeUrl).trim();
          if (LINK_HREF_RE.test(href)) {
            nodes.push({ type: "link", href, children: parseInline(text) });
          } else {
            warn(`rejected link href "${href}", rendering as text`);
            nodes.push({ type: "text", value: raw.slice(i, closeUrl + 1) });
          }
          i = closeUrl + 1;
          continue;
        }
      }
    }

    const nextSpecial = findNextSpecial(raw, i + 1);
    const end = nextSpecial === -1 ? raw.length : nextSpecial;
    nodes.push({ type: "text", value: raw.slice(i, end) });
    i = end;
  }

  return nodes;
}

function findNextSpecial(raw: string, from: number): number {
  for (let i = from; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "`" || ch === "[") return i;
    if (ch === "*" && raw[i + 1] === "*") return i;
  }
  return -1;
}

function parseMarkdown(markdown: string): Block[] {
  const lines = markdown.split("\n");
  const blocks: Block[] = [];
  let current: Extract<Block, { type: "section" }> | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");

    if (line === "") continue;

    if (line.startsWith("# ")) {
      continue;
    }

    if (line.startsWith("## ")) {
      if (current) blocks.push(current);
      current = { type: "section", date: line.slice(3).trim(), items: [] };
      continue;
    }

    if (line.startsWith("- ")) {
      if (!current) {
        warn(`bullet outside of section: "${line}", skipping`);
        continue;
      }
      current.items.push(parseInline(line.slice(2)));
      continue;
    }

    if (line.startsWith("### ") || line.startsWith("#### ")) {
      warn(`unsupported heading level: "${line}", rendering as raw text`);
      blocks.push({ type: "raw", value: line });
      continue;
    }

    if (/^\d+\.\s/.test(line) || /^\s+-\s/.test(line) || line.startsWith("|")) {
      warn(`unsupported markdown construct: "${line}", rendering as raw text`);
      blocks.push({ type: "raw", value: line });
      continue;
    }

    warn(`unrecognized line: "${line}", rendering as raw text`);
    blocks.push({ type: "raw", value: line });
  }

  if (current) blocks.push(current);
  return blocks;
}

function renderInline(nodes: InlineNode[]): Child[] {
  return nodes.map((node, idx) => {
    if (node.type === "text") {
      return <span key={idx}>{node.value}</span>;
    }
    if (node.type === "bold") {
      return <strong key={idx}>{renderInline(node.children)}</strong>;
    }
    if (node.type === "code") {
      return (
        <code key={idx} class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">
          {node.value}
        </code>
      );
    }
    const isExternal = /^https?:\/\//.test(node.href);
    const extraProps = isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {};
    return (
      <a
        key={idx}
        href={node.href}
        class="text-fgp-600 dark:text-fgp-400 hover:underline"
        {...extraProps}
      >
        {renderInline(node.children)}
      </a>
    );
  });
}

export function renderChangelog(markdown: string): Child {
  const blocks = parseMarkdown(markdown);

  return (
    <div class="space-y-6">
      {blocks.map((block, idx) => {
        if (block.type === "raw") {
          return <p key={idx}>{block.value}</p>;
        }
        return (
          <section key={idx}>
            <h3 class="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-2 uppercase tracking-wider">
              {block.date}
            </h3>
            <ul class="space-y-1.5 text-xs">
              {block.items.map((item, itemIdx) => <li key={itemIdx}>{renderInline(item)}</li>)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
