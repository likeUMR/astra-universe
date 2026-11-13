import { execFileSync } from "node:child_process";
import { mkdtemp, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const git = (args: string[], extraEnv: NodeJS.ProcessEnv = {}) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();

if (git(["status", "--porcelain"])) {
  throw new Error("发布前请先提交工作区改动，以便发布内容能追溯到源提交。");
}
if (git(["branch", "--show-current"]) !== "main") {
  throw new Error("请从 main 分支发布。");
}
const sourceCommit = git(["rev-parse", "HEAD"]);
const remoteSource = git(["ls-remote", "origin", "refs/heads/main"]).split(/\s/)[0];
if (sourceCommit !== remoteSource) {
  throw new Error("请先将当前 main 提交推送到 origin，再发布网站。");
}
const npm = process.env.npm_execpath;
if (!npm) throw new Error("请通过 npm run publish:pages 执行发布。");

for (const script of ["check", "test:e2e", "build"]) {
  console.log(`\nRelease check: npm run ${script}`);
  execFileSync(process.execPath, [npm, "run", script], {
    cwd: root,
    windowsHide: true,
    stdio: "inherit",
    env: { ...process.env, ASTRA_BASE_PATH: script === "build" ? "/astra-universe/" : "/" },
  });
}
await writeFile(join(root, "dist/.nojekyll"), "");
await writeFile(
  join(root, "dist/release.json"),
  JSON.stringify({ sourceCommit, builtAt: new Date().toISOString() }, null, 2),
);

const remotePages = git(["ls-remote", "origin", "refs/heads/gh-pages"]);
let parent: string | undefined;
if (remotePages) {
  git(["fetch", "--no-tags", "origin", "gh-pages"]);
  parent = git(["rev-parse", "FETCH_HEAD"]);
}
const temporary = await mkdtemp(join(tmpdir(), "astra-pages-"));
const index = join(temporary, "index");
try {
  // An independent index stages only dist; main's index and checkout stay intact.
  const env = { GIT_INDEX_FILE: index };
  git(["-c", "core.autocrlf=false", "--work-tree=dist", "add", "--all", "--force", "."], env);
  const tree = git(["write-tree"], env);
  const commit = git([
    "commit-tree",
    tree,
    ...(parent ? ["-p", parent] : []),
    "-m",
    `Publish Astra from ${sourceCommit}`,
  ]);
  git(["push", "origin", `${commit}:refs/heads/gh-pages`]);
  git(["update-ref", "refs/heads/gh-pages", commit]);
  console.log(`Published static branch: ${commit}`);
  console.log("GitHub Pages will serve https://likeumr.github.io/astra-universe/");
  console.log("Wait for the repository's Pages deployment to succeed before checking the site.");
} finally {
  await rm(index, { force: true });
  await rmdir(temporary);
}
