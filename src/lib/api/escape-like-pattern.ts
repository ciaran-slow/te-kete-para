/**
 * Backslash-escapes SQLite LIKE wildcards (`%`, `_`) and the escape
 * character itself (`\`) so a user's query is matched literally, never as
 * a pattern — paired with `ESCAPE '\'` in the caller's query (ADR 0013).
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
