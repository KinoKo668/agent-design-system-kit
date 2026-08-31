import type { JsonArray, JsonObject, JsonValue } from "./json.js";

export const REDACTED_VALUE = "[REDACTED]" as const;
export const REDACTED_FIGMA_URL = "[REDACTED_FIGMA_URL]" as const;
export const REDACTED_PATH = "[REDACTED_PATH]" as const;

const SENSITIVE_FIELD_NAMES = new Set([
  "apikey",
  "authorization",
  "authorizationheader",
  "bridgetoken",
  "clientsecret",
  "cookie",
  "figmaaccesstoken",
  "figmafilekey",
  "figmanodeid",
  "idempotencykey",
  "password",
  "passwd",
  "privatekey",
  "refreshtoken",
  "sessiontoken",
  "setcookie",
  "token",
  "xfigmatoken",
]);

const BEARER_CREDENTIAL_PATTERN = /\bBearer\s+[^\s,;]+/giu;
const FIGMA_HEADER_PATTERN = /(\bX-Figma-Token\s*:\s*)[^\s,;]+/giu;
const SECRET_ASSIGNMENT_PATTERN =
  /\b([A-Z][A-Z0-9_]*(?:API_KEY|PASSWORD|PASSWD|PRIVATE_KEY|SECRET|TOKEN))\s*=\s*([^\s]+)/gu;
const FIGMA_URL_PATTERN =
  /https?:\/\/(?:www\.)?figma\.com\/(?:board|design|file|proto)\/[^\s"'<>]+/giu;
const POSIX_PERSONAL_PATH_PATTERN =
  /\/(?:Users|home)\/[^/\s"'<>]+(?:\/[^\s"'<>]*)?/gu;
const WINDOWS_PERSONAL_PATH_PATTERN =
  /[A-Za-z]:\\Users\\[^\\\s"'<>]+(?:\\[^\s"'<>]*)?/gu;

export interface RedactionOptions {
  /** Exact runtime secret values that must be removed wherever they occur. */
  readonly sensitiveValues: readonly string[];
}

function normalizeFieldName(fieldName: string): string {
  return fieldName.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");
}

export function isSensitiveFieldName(fieldName: string): boolean {
  return SENSITIVE_FIELD_NAMES.has(normalizeFieldName(fieldName));
}

function redactExactValues(
  input: string,
  sensitiveValues: readonly string[],
): string {
  const uniqueValues = [...new Set(sensitiveValues)]
    .filter((value) => value.length > 0)
    .sort((left, right) => right.length - left.length);

  return uniqueValues.reduce(
    (redacted, value) => redacted.split(value).join(REDACTED_VALUE),
    input,
  );
}

export function redactSensitiveText(
  input: string,
  options: RedactionOptions,
): string {
  return redactExactValues(input, options.sensitiveValues)
    .replaceAll(BEARER_CREDENTIAL_PATTERN, `Bearer ${REDACTED_VALUE}`)
    .replaceAll(FIGMA_HEADER_PATTERN, `$1${REDACTED_VALUE}`)
    .replaceAll(SECRET_ASSIGNMENT_PATTERN, `$1=${REDACTED_VALUE}`)
    .replaceAll(FIGMA_URL_PATTERN, REDACTED_FIGMA_URL)
    .replaceAll(POSIX_PERSONAL_PATH_PATTERN, REDACTED_PATH)
    .replaceAll(WINDOWS_PERSONAL_PATH_PATTERN, REDACTED_PATH);
}

function isJsonArray(input: JsonValue): input is JsonArray {
  return Array.isArray(input);
}

export function redactJsonValue(
  input: JsonValue,
  options: RedactionOptions,
): JsonValue {
  if (typeof input === "string") {
    return redactSensitiveText(input, options);
  }

  if (isJsonArray(input)) {
    return input.map((value) => redactJsonValue(value, options));
  }

  if (input !== null && typeof input === "object") {
    return redactJsonObject(input, options);
  }

  return input;
}

export function redactJsonObject(
  input: JsonObject,
  options: RedactionOptions,
): JsonObject {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      isSensitiveFieldName(key)
        ? REDACTED_VALUE
        : redactJsonValue(value, options),
    ]),
  );
}
