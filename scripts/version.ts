import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const DEFAULT_REPO = "lsagetlethias/fine-grained-proxy";
const REPO_ENV = process.env.FGP_GITHUB_REPO;
const OUT = "static/version.txt";

function fromGit(): string | null {
  try {
    const out = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
    if (out.status === 0) return out.stdout.trim();
  } catch {
    /* git not available */
  }
  return null;
}

function getGitHubRepo(): string {
  try {
    const out = spawnSync("git", ["remote", "get-url", "origin"], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
    if (out.status === 0) {
      const url = out.stdout.trim();
      const match = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
      if (match) return match[1];
    }
  } catch {
    /* git not available */
  }
  return DEFAULT_REPO;
}

async function fromGitHub(repo: string, branch = "main"): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/commits/${branch}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { sha: string };
    return data.sha.slice(0, 7);
  } catch {
    /* network error */
  }
  return null;
}

const repo = REPO_ENV ?? getGitHubRepo();
const hash = fromGit() ?? (await fromGitHub(repo)) ?? "dev";
await writeFile(OUT, hash);
console.log(`version: ${hash}`);
