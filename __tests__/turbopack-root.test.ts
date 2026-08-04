import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { resolveTurbopackRoot } from "../src/lib/turbopack-root";

const tempDirs: string[] = [];

function mkdtemp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "turbopack-root-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a real (non-symlinked) node_modules leaves the root unchanged", () => {
  const base = mkdtemp();
  const projectDir = path.join(base, "project");
  fs.mkdirSync(path.join(projectDir, "node_modules"), { recursive: true });

  expect(resolveTurbopackRoot(projectDir)).toBe(projectDir);
});

test("a symlinked node_modules at an asymmetric depth resolves to the common ancestor", () => {
  const base = fs.realpathSync(mkdtemp());
  const projectDir = path.join(base, "a", "b", "project");
  const realNodeModules = path.join(base, "other", "node_modules");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(realNodeModules, { recursive: true });
  fs.symlinkSync(
    realNodeModules,
    path.join(projectDir, "node_modules"),
    "dir",
  );

  // A naive "go up two directories" implementation would compute
  // `base/a`, which does not contain `other/node_modules` — this
  // asymmetric depth (projectDir 3 levels under base, node_modules'
  // real parent 1 level under base) only passes against a real
  // common-ancestor computation.
  expect(resolveTurbopackRoot(projectDir)).toBe(base);
});

test("a symlinked node_modules mirroring this repo's worktree layout resolves to the shared parent", () => {
  const base = fs.realpathSync(mkdtemp());
  const mainWorktree = path.join(base, "te-kete-para");
  const projectDir = path.join(base, "te-kete-para__worktrees", "handle");
  const realNodeModules = path.join(mainWorktree, "node_modules");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(realNodeModules, { recursive: true });
  fs.symlinkSync(
    realNodeModules,
    path.join(projectDir, "node_modules"),
    "dir",
  );

  expect(resolveTurbopackRoot(projectDir)).toBe(base);
});

test("a missing node_modules leaves the root unchanged and does not throw", () => {
  const base = mkdtemp();
  const projectDir = path.join(base, "project");
  fs.mkdirSync(projectDir, { recursive: true });

  expect(() => resolveTurbopackRoot(projectDir)).not.toThrow();
  expect(resolveTurbopackRoot(projectDir)).toBe(projectDir);
});

test("calling it twice on the same symlinked fixture returns identical results", () => {
  const base = fs.realpathSync(mkdtemp());
  const projectDir = path.join(base, "a", "b", "project");
  const realNodeModules = path.join(base, "other", "node_modules");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(realNodeModules, { recursive: true });
  fs.symlinkSync(
    realNodeModules,
    path.join(projectDir, "node_modules"),
    "dir",
  );

  const first = resolveTurbopackRoot(projectDir);
  const second = resolveTurbopackRoot(projectDir);
  expect(first).toBe(second);
  expect(first).toBe(base);
});
