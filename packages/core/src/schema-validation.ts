import type * as z from "zod";

import type { JsonObject } from "./json.js";

export interface SchemaValidationIssue extends JsonObject {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface ProvidedSchemaVersion extends JsonObject {
  readonly schemaVersion: string;
}

export function toJsonPointer(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return "/";
  }

  return path
    .map((segment) =>
      String(segment).replaceAll("~", "~0").replaceAll("/", "~1"),
    )
    .map((segment) => `/${segment}`)
    .join("");
}

export function toValidationIssues(
  error: z.ZodError,
): readonly SchemaValidationIssue[] {
  const diagnostics: SchemaValidationIssue[] = [];

  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        diagnostics.push({
          code: issue.code,
          message: `Unknown property '${key}'.`,
          path: toJsonPointer([...issue.path, key]),
        });
      }
      continue;
    }

    diagnostics.push({
      code: issue.code,
      message: issue.message,
      path: toJsonPointer(issue.path),
    });
  }

  return diagnostics;
}

function hasSchemaVersion(
  input: object,
): input is { readonly schemaVersion: unknown } {
  return Object.hasOwn(input, "schemaVersion");
}

export function getProvidedSchemaVersion(
  input: unknown,
): ProvidedSchemaVersion | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  if (!hasSchemaVersion(input) || input.schemaVersion === undefined) {
    return undefined;
  }

  return {
    schemaVersion:
      typeof input.schemaVersion === "string"
        ? input.schemaVersion
        : `invalid-type:${typeof input.schemaVersion}`,
  };
}
