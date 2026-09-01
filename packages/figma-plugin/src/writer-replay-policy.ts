import {
  ERROR_DEFINITIONS,
  type WriterCommandDelivery,
  type WriterPluginResult,
} from "@agent-design-system-kit/core";

export function shouldCacheWriterResult(
  commandType: WriterCommandDelivery["command"]["type"],
  result: WriterPluginResult,
): boolean {
  if (result.ok)
    return (
      commandType === "writer.ping" ||
      commandType === "audit.styles.scan" ||
      commandType === "audit.components.scan"
    );
  return ERROR_DEFINITIONS[result.error.code].retry === "do_not_retry";
}
