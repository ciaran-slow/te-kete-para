import fs from "node:fs";
import path from "node:path";

function commonAncestor(a: string, b: string): string {
  const segmentsA = a.split(path.sep);
  const segmentsB = b.split(path.sep);
  const common: string[] = [];
  for (let i = 0; i < Math.min(segmentsA.length, segmentsB.length); i++) {
    if (segmentsA[i] !== segmentsB[i]) break;
    common.push(segmentsA[i]);
  }
  const joined = common.join(path.sep);
  return joined === "" ? path.sep : joined;
}

/**
 * Turbopack refuses to resolve through a symlink whose real target lies
 * outside its project root (ADR 0043) — the case in this repo's worktrees,
 * where node_modules is symlinked back to the main worktree. Returns the
 * project dir unchanged when node_modules is a real directory (or missing,
 * e.g. before the first install); otherwise returns the common ancestor of
 * the project dir and node_modules' real parent, so Turbopack's root still
 * encloses both.
 */
export function resolveTurbopackRoot(projectDir: string): string {
  let realNodeModulesParent: string;
  try {
    realNodeModulesParent = path.dirname(
      fs.realpathSync(path.join(projectDir, "node_modules")),
    );
  } catch {
    return projectDir;
  }

  const realProjectDir = fs.realpathSync(projectDir);
  if (realNodeModulesParent === realProjectDir) {
    return projectDir;
  }

  return commonAncestor(realProjectDir, realNodeModulesParent);
}
