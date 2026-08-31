import * as z from "zod";

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*))*))?(?:\+([0-9a-z-]+(?:\.[0-9a-z-]+)*))?$/iu;
const STABLE_ID_SEGMENT_PATTERN = /^[a-z][a-z0-9-]*$/u;
const STABLE_ASSET_ID_PATTERN = /^[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*$/u;
const CONTENT_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;

export const strictSemverSchema = z
  .string()
  .regex(SEMVER_PATTERN, "Must be a complete Semantic Version such as 1.0.0.");

export const stableIdSegmentSchema = z
  .string()
  .max(64, "Must contain at most 64 characters.")
  .regex(
    STABLE_ID_SEGMENT_PATTERN,
    "Must be one lowercase ASCII kebab-case segment.",
  );

export const stableAssetIdSchema = z
  .string()
  .max(192, "Must contain at most 192 characters.")
  .regex(
    STABLE_ASSET_ID_PATTERN,
    "Must contain lowercase ASCII kebab-case segments separated by '/'.",
  );

export const contentDigestSchema = z
  .string()
  .regex(
    CONTENT_DIGEST_PATTERN,
    "Must use the form sha256:<64 lowercase hexadecimal characters>.",
  );
