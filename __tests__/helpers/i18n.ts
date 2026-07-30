export type ParityGaps = { missingInB: string[]; missingInA: string[] };

export function findKeyParityGaps(
  a: Record<string, string>,
  b: Record<string, string>,
): ParityGaps {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  return {
    missingInB: aKeys.filter((k) => !bKeys.includes(k)).sort(),
    missingInA: bKeys.filter((k) => !aKeys.includes(k)).sort(),
  };
}
