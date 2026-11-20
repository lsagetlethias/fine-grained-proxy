#!/usr/bin/env tsx
// Demo live FGP - zero dependance reseau.
// Affiche chaque requete envoyee (methode, URL, headers, body) et pretty-print les reponses JSON.
//
// Prerequis (2 terminaux) :
//   1. Mock upstream : tsx demo.ts upstream             (API cible locale sur :9000)
//   2. FGP : depuis la racine, pnpm dev                 (proxy sur :8000, FGP_SALT requis)
//
// Puis : tsx demo.ts generate -> export KEY=... BLOB=... -> allowed / denied / opaque / ttl

import { spawn } from "node:child_process";
import { once } from "node:events";
import { inspect as nodeInspect } from "node:util";

const BASE = process.env.FGP_BASE ?? "http://localhost:8000";
const UPSTREAM = process.env.UPSTREAM ?? "http://localhost:9000";
const KEY = process.env.KEY ?? "";
const BLOB = process.env.BLOB ?? "";
const TOKEN = process.env.TOKEN ?? "demo-secret-1234";
const TARGET = process.env.TARGET ?? UPSTREAM;
const TTL = Number(process.env.TTL ?? 120);

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  gray: "\x1b[90m",
};

function title(t: string): void {
  console.log(`\n${c.bold}${c.cyan}== ${t} ==${c.reset}`);
}

function truncate(v: string, n = 32): string {
  return v.length > n ? `${v.slice(0, n)}... (${v.length} chars)` : v;
}

function indent(s: string, n = 2): string {
  const pad = " ".repeat(n);
  return s.split("\n").map((l) => pad + l).join("\n");
}

function inspect(value: unknown): string {
  return nodeInspect(value, { colors: true, depth: Infinity });
}

function prettyMaybeJson(text: string): string {
  try {
    return inspect(JSON.parse(text));
  } catch {
    return text;
  }
}

function colorStatus(status: number): string {
  const col = status < 300 ? c.green : status < 400 ? c.yellow : c.red;
  return `${col}${status}${c.reset}`;
}

interface ReqOpts {
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
}

async function request(
  { method = "GET", path, headers = {}, body }: ReqOpts,
): Promise<string> {
  const url = `${BASE}${path}`;

  console.log(`${c.bold}-> ${method} ${url}${c.reset}`);
  const sentHeaders = {
    ...(body !== undefined ? { "content-type": "application/json" } : {}),
    ...headers,
  };
  for (const [k, v] of Object.entries(sentHeaders)) {
    const shown = k.toLowerCase() === "x-fgp-blob" ? truncate(v) : v;
    console.log(`  ${c.gray}${k}:${c.reset} ${shown}`);
  }
  if (body !== undefined) {
    console.log(`  ${c.gray}body:${c.reset}`);
    console.log(indent(inspect(body), 4));
  }

  const res = await fetch(url, {
    method,
    headers: sentHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();

  const src = res.headers.get("x-fgp-source");
  console.log(
    `${c.bold}<- ${colorStatus(res.status)} ${res.statusText}${c.reset}` +
      (src ? `  ${c.dim}x-fgp-source: ${src}${c.reset}` : ""),
  );
  console.log(indent(prettyMaybeJson(text), 2));
  return text;
}

function requireBlob(): void {
  if (!KEY || !BLOB) {
    console.error(
      `${c.red}KEY et BLOB requis. Lance d'abord 'generate', puis export KEY=... BLOB=...${c.reset}`,
    );
    process.exit(1);
  }
}

const fgpHeaders = (): Record<string, string> => ({
  "X-FGP-Key": KEY,
  "X-FGP-Blob": BLOB,
});

async function generate(): Promise<void> {
  title(`1. Generer un blob (l'UI fait la meme chose) - TTL=${TTL}s`);
  const text = await request({
    method: "POST",
    path: "/api/generate",
    body: {
      token: TOKEN,
      target: TARGET,
      auth: "bearer",
      scopes: [
        "GET:/v1/apps",
        "GET:/v1/apps/*",
        {
          methods: ["POST"],
          pattern: "/v1/apps/my-app/deployments",
          bodyFilters: [{
            objectPath: "deployment.git_ref",
            objectValue: [{ type: "stringwildcard", value: "ma*" }],
          }],
        },
      ],
      ttl: TTL,
    },
  });
  try {
    const { key, blob } = JSON.parse(text);
    console.log(`\n${c.green}>> A copier dans le terminal de demo :${c.reset}`);
    console.log(`export KEY="${key}"`);
    console.log(`export BLOB="${blob}"`);
  } catch {
    // reponse non parsable : deja affichee
  }
}

async function allowed(): Promise<void> {
  title(
    "2. Requete autorisee (GET /v1/apps -> match scope exact GET:/v1/apps)",
  );
  requireBlob();
  await request({ path: "/v1/apps", headers: fgpHeaders() });
}

async function deniedScope(): Promise<void> {
  title("3a. Scope refuse (DELETE non scope)");
  requireBlob();
  await request({
    method: "DELETE",
    path: "/v1/apps/my-app",
    headers: fgpHeaders(),
  });
}

async function deniedBody(): Promise<void> {
  title("3b. Body filter refuse (git_ref = hotfix-x, hors filtre ma*)");
  requireBlob();
  await request({
    method: "POST",
    path: "/v1/apps/my-app/deployments",
    headers: fgpHeaders(),
    body: { deployment: { git_ref: "hotfix-x" } },
  });
}

async function allowedBody(): Promise<void> {
  title("Body filter accepte (git_ref = main, dans le filtre ma*)");
  requireBlob();
  await request({
    method: "POST",
    path: "/v1/apps/my-app/deployments",
    headers: fgpHeaders(),
    body: { deployment: { git_ref: "main" } },
  });
}

async function ttl(): Promise<void> {
  title(
    "3c. TTL expire (genere un blob court : TTL=8 tsx demo.ts generate, attendre, puis ttl)",
  );
  requireBlob();
  await request({ path: "/v1/apps", headers: fgpHeaders() });
}

async function opaque(): Promise<void> {
  title("4a. Decode avec la bonne cle (token redacte)");
  requireBlob();
  await request({
    method: "POST",
    path: "/api/decode",
    body: { blob: BLOB, key: KEY },
  });

  title("4b. Decode avec une mauvaise cle (echec, aucune fuite)");
  await request({
    method: "POST",
    path: "/api/decode",
    body: { blob: BLOB, key: "WRONG-KEY-0000" },
  });
}

async function upstream(): Promise<void> {
  title("Mock upstream sur :9000 (Ctrl-C pour stopper)");
  const serverPath = new URL("./demo-upstream/server.ts", import.meta.url).pathname;
  const child = spawn(process.execPath, ["--import", "tsx", serverPath], {
    stdio: "inherit",
  });
  await once(child, "close");
}

const command = process.argv[2] ?? "help";
switch (command) {
  case "upstream":
    await upstream();
    break;
  case "generate":
    await generate();
    break;
  case "allowed":
    await allowed();
    break;
  case "denied":
    await deniedScope();
    await deniedBody();
    break;
  case "allowed-body":
    await allowedBody();
    break;
  case "ttl":
    await ttl();
    break;
  case "opaque":
    await opaque();
    break;
  case "all":
    await allowed();
    await deniedScope();
    await deniedBody();
    await allowedBody();
    await opaque();
    break;
  default:
    console.log(
      "usage: tsx demo.ts {upstream|generate|allowed|denied|allowed-body|ttl|opaque|all}",
    );
}
