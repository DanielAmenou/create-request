// Releases a version: bumps package.json, commits, tags and pushes. The Release workflow
// (.github/workflows/release.yml) then publishes the tag to npm and creates the GitHub release.
//
//   npm run release:patch | release:minor | release:major   on main               → npm dist-tag "latest"
//   npm run release:next                                     on any other branch   → npm dist-tag "next"
//   npm run release:next -- major | minor | patch            starts a new prerelease line (2.1.0 → 3.0.0-next.0)
//
// When the branch's version is a prerelease that was never released (2.0.0-next.0 without a v2.0.0-next.0 tag),
// release:next releases that version as it is.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const [type, line] = process.argv.slice(2);
const fail = message => {
  console.error(`\nrelease: ${message}`);
  process.exit(1);
};
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const run = (command, ...args) => execFileSync(command, args, { stdio: "inherit" });
const version = () => JSON.parse(readFileSync("package.json", "utf8")).version;

if (!["patch", "minor", "major", "next"].includes(type) || (line !== undefined && (type !== "next" || !["patch", "minor", "major"].includes(line))))
  fail("usage: npm run release:patch | release:minor | release:major | release:next [-- major | minor | patch]");

const branch = git("branch", "--show-current");
if (!branch) fail("HEAD is detached; switch to a branch first");
if (type === "next" && branch === "main") fail("prereleases are not released from main; switch to the prerelease branch (for example v2)");
if (type !== "next" && branch !== "main") fail(`${type} releases are made from main only (you are on ${branch})`);
if (git("status", "--porcelain", "--untracked-files=no")) fail("commit or stash your changes first");
try {
  git("fetch", "--quiet", "--tags", "origin", branch);
} catch {
  fail(`could not fetch ${branch} from origin; push it first: git push -u origin ${branch}`);
}
if (git("rev-parse", "HEAD") !== git("rev-parse", "FETCH_HEAD")) fail(`${branch} is not the same as origin/${branch}; pull or push first`);

const current = version();
const releaseAsIs = type === "next" && line === undefined && /-next\.\d+$/.test(current) && !git("tag", "--list", `v${current}`);
if (!releaseAsIs) {
  const increment = type !== "next" ? [type] : [line === undefined ? "prerelease" : `pre${line}`, "--preid", "next"];
  execFileSync("npm", ["version", ...increment, "--no-git-tag-version"], { stdio: "ignore" });
}
const target = version();
const tag = `v${target}`;
const restore = () => {
  if (!releaseAsIs) git("checkout", "--", "package.json", "package-lock.json");
};
if (git("tag", "--list", tag)) {
  restore();
  fail(`${tag} already exists`);
}

const distTag = target.includes("-") ? "next" : "latest";
const prompt = createInterface({ input: process.stdin, output: process.stdout });
const answer = await prompt.question(`\n${releaseAsIs ? target : `${current} → ${target}`} from ${branch}, published to npm as "${distTag}". Continue? [y/N] `);
prompt.close();
if (!/^y(es)?$/i.test(answer.trim())) {
  restore();
  fail("cancelled, nothing changed");
}

try {
  run("npm", "run", "check");
} catch {
  restore();
  fail("npm run check failed, nothing was committed or pushed");
}
if (!releaseAsIs) {
  run("git", "add", "package.json", "package-lock.json");
  run("git", "commit", "--quiet", "-m", `chore(release): ${target}`);
}
run("git", "tag", "-a", tag, "-m", `chore(release): ${target}`);
run("git", "push", "--atomic", "origin", branch, tag);
console.log(`\n${tag} is pushed. The Release workflow publishes it: https://github.com/DanielAmenou/create-request/actions/workflows/release.yml`);
