function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPlatformMarkerCandidate(serialized: string): boolean {
  try {
    const value = JSON.parse(serialized) as unknown;
    return (
      isRecord(value) &&
      (value.assetType === "official-platform-instance" ||
        (typeof value.bindingId === "string" &&
          typeof value.componentKey === "string" &&
          typeof value.platformTargetId === "string"))
    );
  } catch {
    return serialized.includes("official-platform-instance");
  }
}
