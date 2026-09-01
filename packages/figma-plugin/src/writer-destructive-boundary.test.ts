import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const PRODUCTION_WRITER_SOURCES = [
  "packages/figma-plugin/src/variables-writer.ts",
  "packages/figma-plugin/src/figma-variables-port.ts",
  "packages/figma-plugin/src/button-writer.ts",
  "packages/figma-plugin/src/figma-button-port.ts",
  "packages/figma-plugin/src/button-instance-writer.ts",
  "packages/figma-plugin/src/figma-button-instance-port.ts",
] as const;

const FORBIDDEN_MUTATORS = new Set([
  "deleteVariable",
  "deleteVariableCollection",
  "detachInstance",
  "remove",
  "removeAsync",
  "swapComponent",
]);

function destructiveOperations(sourcePath: string): string[] {
  const absolutePath = resolve(process.cwd(), sourcePath);
  const source = ts.createSourceFile(
    absolutePath,
    readFileSync(absolutePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const findings: string[] = [];
  function visit(node: ts.Node): void {
    if (ts.isDeleteExpression(node)) {
      findings.push(`${sourcePath}:delete-expression`);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      FORBIDDEN_MUTATORS.has(node.expression.name.text)
    ) {
      const position = source.getLineAndCharacterOfPosition(
        node.getStart(source),
      );
      findings.push(
        `${sourcePath}:${String(position.line + 1)}:${node.expression.name.text}`,
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return findings;
}

describe("Figma Writer destructive boundary", () => {
  it("exposes convergence and recovery without delete, detach or component swap", () => {
    expect(PRODUCTION_WRITER_SOURCES.flatMap(destructiveOperations)).toEqual(
      [],
    );
  });
});
