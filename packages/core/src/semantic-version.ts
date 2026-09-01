export const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*))*))?(?:\+([0-9a-z-]+(?:\.[0-9a-z-]+)*))?$/iu;

interface ParsedSemanticVersion {
  readonly core: readonly [string, string, string];
  readonly prerelease: readonly string[] | undefined;
}

function parseSemanticVersion(version: string): ParsedSemanticVersion {
  const match = SEMVER_PATTERN.exec(version);
  if (match === null) {
    throw new TypeError(`Invalid Semantic Version: ${version}`);
  }
  const major = match[1];
  const minor = match[2];
  const patch = match[3];
  if (major === undefined || minor === undefined || patch === undefined) {
    throw new TypeError(`Invalid Semantic Version: ${version}`);
  }
  return {
    core: [major, minor, patch],
    prerelease: match[4]?.split("."),
  };
}

function compareNumericIdentifiers(left: string, right: string): number {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function comparePrereleaseIdentifiers(left: string, right: string): number {
  const numericPattern = /^\d+$/u;
  const leftNumeric = numericPattern.test(left);
  const rightNumeric = numericPattern.test(right);
  if (leftNumeric && rightNumeric) {
    return compareNumericIdentifiers(left, right);
  }
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

export function semanticVersionMajor(version: string): string {
  return parseSemanticVersion(version).core[0];
}

export function compareSemanticVersions(left: string, right: string): number {
  const leftVersion = parseSemanticVersion(left);
  const rightVersion = parseSemanticVersion(right);
  for (let index = 0; index < leftVersion.core.length; index += 1) {
    const leftPart = leftVersion.core[index];
    const rightPart = rightVersion.core[index];
    if (leftPart !== undefined && rightPart !== undefined) {
      const comparison = compareNumericIdentifiers(leftPart, rightPart);
      if (comparison !== 0) return comparison;
    }
  }

  if (leftVersion.prerelease === undefined) {
    return rightVersion.prerelease === undefined ? 0 : 1;
  }
  if (rightVersion.prerelease === undefined) return -1;

  const length = Math.max(
    leftVersion.prerelease.length,
    rightVersion.prerelease.length,
  );
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = leftVersion.prerelease[index];
    const rightIdentifier = rightVersion.prerelease[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    const comparison = comparePrereleaseIdentifiers(
      leftIdentifier,
      rightIdentifier,
    );
    if (comparison !== 0) return comparison;
  }
  return 0;
}
