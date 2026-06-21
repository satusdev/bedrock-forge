/// <reference types="jest" />

import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { join, resolve } from "path";

const manager = resolve(__dirname, "../../scripts/github-extension-manager.php");

function fixture(valid = true) {
  const root = mkdtempSync(join(tmpdir(), "forge-github-extension-"));
  const site = join(root, "site");
  const repo = join(root, "repo");
  const bin = join(root, "bin");
  mkdirSync(join(site, "web/app/plugins"), { recursive: true });
  mkdirSync(join(site, "web/app/themes/divi"), { recursive: true });
  mkdirSync(repo);
  mkdirSync(bin);
  writeFileSync(join(site, "web/app/themes/divi/style.css"), "Theme Name: Divi\ncustom=true\n");
  writeFileSync(join(repo, valid ? "secure-guard.php" : "readme.txt"), valid ? "<?php\n/* Plugin Name: Secure Guard */\n" : "invalid\n");
  const git = join(bin, "git");
  writeFileSync(git, `#!/usr/bin/env bash\nset -e\nif [ "$1" = "clone" ]; then dest="\${@: -1}"; mkdir -p "$dest"; cp -a "$FAKE_GIT_REPO"/. "$dest"/; exit 0; fi\nif [ "$1" = "-C" ]; then echo 0123456789abcdef0123456789abcdef01234567; exit 0; fi\nexit 2\n`);
  chmodSync(git, 0o755);
  return { root, site, repo, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_GIT_REPO: repo } };
}

function run(site: string, env: NodeJS.ProcessEnv, action = "add") {
  return execFileSync("php", [manager, `--action=${action}`, `--docroot=${site}`, "--slug=wp-secure-guard", "--repo-url=https://github.com/satusdev/wp-secure-guard.git", "--repo-path=.", "--type=plugin"], { env, encoding: "utf8" });
}

describe("atomic GitHub extension manager", () => {
  it("installs only the requested plugin and preserves Divi byte-for-byte", () => {
    const f = fixture();
    try {
      const before = readFileSync(join(f.site, "web/app/themes/divi/style.css"), "utf8");
      expect(JSON.parse(run(f.site, f.env))).toMatchObject({ success: true, commit: "0123456789abcdef0123456789abcdef01234567" });
      expect(readFileSync(join(f.site, "web/app/themes/divi/style.css"), "utf8")).toBe(before);
      expect(existsSync(join(f.site, "web/app/plugins/wp-secure-guard/secure-guard.php"))).toBe(true);
      expect(JSON.parse(readFileSync(join(f.site, "web/app/plugins/wp-secure-guard/.bedrock-forge-source.json"), "utf8"))).toMatchObject({ repo_url: "https://github.com/satusdev/wp-secure-guard.git" });
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });

  it("restores the previous plugin when staged validation fails", () => {
    const f = fixture(false);
    try {
      const existing = join(f.site, "web/app/plugins/wp-secure-guard");
      mkdirSync(existing);
      writeFileSync(join(existing, "secure-guard.php"), "<?php /* Plugin Name: Old Secure Guard */");
      expect(() => run(f.site, f.env, "update")).toThrow();
      expect(readFileSync(join(existing, "secure-guard.php"), "utf8")).toContain("Old Secure Guard");
      expect(existsSync(join(f.site, "web/app/themes/divi/style.css"))).toBe(true);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
});
