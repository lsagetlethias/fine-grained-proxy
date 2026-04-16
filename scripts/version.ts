const DEFAULT_REPO = "lsagetlethias/fine-grained-proxy";
const REPO_ENV = Deno.env.get("FGP_GITHUB_REPO");
const OUT = "static/version.txt";

async function fromGit(): Promise<string | null> {
  try {
    const cmd = new Deno.Command("git", {
      args: ["rev-parse", "--short", "HEAD"],
      stdout: "piped",
      stderr: "null",
    });
    const out = await cmd.output();
    if (out.success) return new TextDecoder().decode(out.stdout).trim();
  } catch { /* git not available */ }
  return null;
}

async function getGitHubRepo(): Promise<string> {
  try {
    const cmd = new Deno.Command("git", {
      args: ["remote", "get-url", "origin"],
      stdout: "piped",
      stderr: "null",
    });
    const out = await cmd.output();
    if (out.success) {
      const url = new TextDecoder().decode(out.stdout).trim();
      const match = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
      if (match) return match[1];
    }
  } catch { /* git not available */ }
  return DEFAULT_REPO;
}

async function fromGitHub(repo: string, branch = "main"): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/commits/${branch}`);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.sha as string).slice(0, 7);
  } catch { /* network error */ }
  return null;
}

const repo = REPO_ENV ?? await getGitHubRepo();
const hash = await fromGit() ?? await fromGitHub(repo) ?? "dev";
await Deno.writeTextFile(OUT, hash);
console.log(`version: ${hash}`);
