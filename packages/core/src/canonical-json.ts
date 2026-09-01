function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function serializeCanonicalJson(
  value: unknown,
  ancestors: WeakSet<object>,
): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        "Canonical JSON does not support non-finite numbers.",
      );
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new TypeError(`Canonical JSON does not support ${typeof value}.`);
  }
  if (ancestors.has(value)) {
    throw new TypeError("Canonical JSON does not support circular values.");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw new TypeError("Canonical JSON does not support sparse arrays.");
        }
        items.push(serializeCanonicalJson(value[index], ancestors));
      }
      return `[${items.join(",")}]`;
    }
    if (!isPlainObject(value)) {
      throw new TypeError("Canonical JSON only supports plain objects.");
    }

    const record = value as Readonly<Record<string, unknown>>;
    const properties = Object.keys(record)
      .sort()
      .map((key) => {
        const serializedKey = JSON.stringify(key);
        return `${serializedKey}:${serializeCanonicalJson(record[key], ancestors)}`;
      });
    return `{${properties.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalizeJson(value: unknown): string {
  return serializeCanonicalJson(value, new WeakSet());
}
