import type {
  FigmaStyleObservation,
  StyleAuditKind,
} from "@agent-design-system-kit/core";

import type { FigmaStyleAuditPort } from "./style-audit-runner.js";
import {
  HATCHKIT_SHARED_NAMESPACE,
  MANAGED_ASSET_SHARED_KEY,
} from "./variables-writer.js";

interface AuditVariable {
  readonly id: string;
  getSharedPluginData(namespace: string, key: string): string;
}

interface AuditSceneNode {
  readonly boundVariables?: unknown;
  readonly cornerRadius?: unknown;
  readonly fills?: unknown;
  readonly fontName?: unknown;
  readonly fontSize?: unknown;
  readonly id: string;
  readonly itemSpacing?: unknown;
  readonly letterSpacing?: unknown;
  readonly name: string;
  readonly opacity?: unknown;
  readonly paddingBottom?: unknown;
  readonly paddingLeft?: unknown;
  readonly paddingRight?: unknown;
  readonly paddingTop?: unknown;
  readonly strokes?: unknown;
  readonly strokeWeight?: unknown;
  readonly type: string;
}

type NumericStyleField =
  | "cornerRadius"
  | "itemSpacing"
  | "opacity"
  | "paddingBottom"
  | "paddingLeft"
  | "paddingRight"
  | "paddingTop"
  | "strokeWeight";

interface StyleAuditFigmaApi {
  readonly currentPage: {
    readonly id: string;
    readonly name: string;
    findAll(): readonly AuditSceneNode[];
  };
  readonly mixed: unknown;
  readonly root: {
    getSharedPluginData(namespace: string, key: string): string;
    setSharedPluginData(namespace: string, key: string, value: string): void;
  };
  readonly variables: {
    getLocalVariablesAsync(): Promise<readonly AuditVariable[]>;
  };
}

interface SolidPaintValue extends Record<string, unknown> {
  readonly color: {
    readonly b: number;
    readonly g: number;
    readonly r: number;
  };
  readonly opacity?: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function solidPaint(value: unknown): value is SolidPaintValue {
  return (
    record(value) &&
    value.type === "SOLID" &&
    value.visible !== false &&
    record(value.color) &&
    [value.color.r, value.color.g, value.color.b].every(
      (channel) => typeof channel === "number" && Number.isFinite(channel),
    ) &&
    (value.opacity === undefined ||
      (typeof value.opacity === "number" && Number.isFinite(value.opacity)))
  );
}

function variableStableId(variable: AuditVariable): string | null {
  let value: unknown;
  try {
    value = JSON.parse(
      variable.getSharedPluginData(
        HATCHKIT_SHARED_NAMESPACE,
        MANAGED_ASSET_SHARED_KEY,
      ) || "null",
    ) as unknown;
  } catch {
    return null;
  }
  if (
    !record(value) ||
    value.schemaVersion !== "1.0.0" ||
    value.assetType !== "token-set" ||
    value.role !== "variable" ||
    value.phase !== "applied" ||
    typeof value.projectId !== "string" ||
    typeof value.assetId !== "string" ||
    typeof value.majorVersion !== "number" ||
    !Number.isSafeInteger(value.majorVersion) ||
    typeof value.slotId !== "string"
  ) {
    return null;
  }
  return `${value.projectId}/token-set/${value.assetId}/variables/major-${String(value.majorVersion)}/variable/${value.slotId}`;
}

function bindings(node: AuditSceneNode): Readonly<Record<string, unknown>> {
  return record(node.boundVariables) ? node.boundVariables : {};
}

function referenceId(value: unknown): string | null {
  const candidate: unknown = Array.isArray(value) ? value[0] : value;
  return record(candidate) && typeof candidate.id === "string"
    ? candidate.id
    : null;
}

function fieldBindingId(
  node: AuditSceneNode,
  field: string,
  fallbacks: readonly string[] = [],
): string | null {
  const values = bindings(node);
  return (
    referenceId(values[field]) ??
    fallbacks.map((fallback) => referenceId(values[fallback])).find(Boolean) ??
    null
  );
}

function paintBindingId(
  paint: Readonly<Record<string, unknown>>,
): string | null {
  if (!record(paint.boundVariables)) return null;
  return referenceId(paint.boundVariables.color);
}

function displayNumber(value: number, suffix = "px"): string {
  return `${Number(value.toFixed(4)).toString()}${suffix}`;
}

function displayColor(paint: SolidPaintValue): string {
  const channel = (value: number) => Math.round(value * 255);
  return `rgba(${String(channel(paint.color.r))}, ${String(channel(paint.color.g))}, ${String(channel(paint.color.b))}, ${String(paint.opacity ?? 1)})`;
}

function createObservation(
  node: AuditSceneNode,
  variableIds: ReadonlyMap<string, string | null>,
  input: {
    readonly actual: string;
    readonly bindingId: string | null;
    readonly field: string;
    readonly kind: StyleAuditKind;
  },
): FigmaStyleObservation {
  return {
    actual: input.actual,
    binding:
      input.bindingId === null
        ? null
        : {
            id: input.bindingId,
            stableId: variableIds.get(input.bindingId) ?? null,
          },
    field: input.field,
    kind: input.kind,
    node: {
      id: node.id,
      name: (node.name || node.type).slice(0, 256),
      type: node.type,
    },
  };
}

function paintObservations(
  node: AuditSceneNode,
  variableIds: ReadonlyMap<string, string | null>,
  field: "fills" | "strokes",
): FigmaStyleObservation[] {
  const value = node[field];
  if (!Array.isArray(value)) return [];
  return value.flatMap((paint: unknown, index) =>
    solidPaint(paint)
      ? [
          createObservation(node, variableIds, {
            actual: displayColor(paint),
            bindingId: paintBindingId(paint),
            field: `${field}[${String(index)}].color`,
            kind: "color",
          }),
        ]
      : [],
  );
}

function numericObservation(
  node: AuditSceneNode,
  variableIds: ReadonlyMap<string, string | null>,
  field: NumericStyleField,
  kind: "dimension" | "opacity",
  shouldAudit: (value: number) => boolean,
  fallbacks: readonly string[] = [],
): FigmaStyleObservation[] {
  const value = node[field];
  return typeof value === "number" && shouldAudit(value)
    ? [
        createObservation(node, variableIds, {
          actual: displayNumber(value, kind === "opacity" ? "" : "px"),
          bindingId: fieldBindingId(node, field, fallbacks),
          field,
          kind,
        }),
      ]
    : [];
}

function textObservations(
  node: AuditSceneNode,
  variableIds: ReadonlyMap<string, string | null>,
  mixed: unknown,
): FigmaStyleObservation[] {
  if (node.type !== "TEXT") return [];
  const observations: FigmaStyleObservation[] = [];
  if (
    node.fontName !== mixed &&
    record(node.fontName) &&
    typeof node.fontName.family === "string" &&
    typeof node.fontName.style === "string"
  ) {
    observations.push(
      createObservation(node, variableIds, {
        actual: node.fontName.family,
        bindingId: fieldBindingId(node, "fontFamily"),
        field: "fontFamily",
        kind: "typography",
      }),
      createObservation(node, variableIds, {
        actual: node.fontName.style,
        bindingId: fieldBindingId(node, "fontWeight"),
        field: "fontWeight",
        kind: "typography",
      }),
    );
  }
  if (node.fontSize !== mixed && typeof node.fontSize === "number") {
    observations.push(
      createObservation(node, variableIds, {
        actual: displayNumber(node.fontSize),
        bindingId: fieldBindingId(node, "fontSize"),
        field: "fontSize",
        kind: "typography",
      }),
    );
  }
  if (
    node.letterSpacing !== mixed &&
    record(node.letterSpacing) &&
    typeof node.letterSpacing.value === "number" &&
    (node.letterSpacing.unit === "PIXELS" ||
      node.letterSpacing.unit === "PERCENT")
  ) {
    observations.push(
      createObservation(node, variableIds, {
        actual:
          node.letterSpacing.unit === "PIXELS"
            ? displayNumber(node.letterSpacing.value)
            : `${String(node.letterSpacing.value)}%`,
        bindingId: fieldBindingId(node, "letterSpacing"),
        field: "letterSpacing",
        kind: "typography",
      }),
    );
  }
  return observations;
}

function observationsFor(
  node: AuditSceneNode,
  variableIds: ReadonlyMap<string, string | null>,
  mixed: unknown,
): FigmaStyleObservation[] {
  const hasVisibleStroke =
    Array.isArray(node.strokes) &&
    node.strokes.some(
      (paint: unknown) => record(paint) && paint.visible !== false,
    );
  return [
    ...paintObservations(node, variableIds, "fills"),
    ...paintObservations(node, variableIds, "strokes"),
    ...numericObservation(
      node,
      variableIds,
      "opacity",
      "opacity",
      (value) => value < 1,
    ),
    ...numericObservation(
      node,
      variableIds,
      "cornerRadius",
      "dimension",
      (value) => value > 0,
      [
        "topLeftRadius",
        "topRightRadius",
        "bottomLeftRadius",
        "bottomRightRadius",
      ],
    ),
    ...(
      ["paddingLeft", "paddingRight", "paddingTop", "paddingBottom"] as const
    ).flatMap((field) =>
      numericObservation(
        node,
        variableIds,
        field,
        "dimension",
        (value) => value > 0,
      ),
    ),
    ...numericObservation(
      node,
      variableIds,
      "itemSpacing",
      "dimension",
      (value) => value > 0,
    ),
    ...(hasVisibleStroke
      ? numericObservation(
          node,
          variableIds,
          "strokeWeight",
          "dimension",
          (value) => value > 0,
          [
            "strokeTopWeight",
            "strokeRightWeight",
            "strokeBottomWeight",
            "strokeLeftWeight",
          ],
        )
      : []),
    ...textObservations(node, variableIds, mixed),
  ];
}

export function createFigmaStyleAuditPort(
  figmaApi: StyleAuditFigmaApi,
): FigmaStyleAuditPort {
  return {
    document: {
      getSharedPluginData: (namespace, key) =>
        figmaApi.root.getSharedPluginData(namespace, key),
      setSharedPluginData: (namespace, key, value) =>
        figmaApi.root.setSharedPluginData(namespace, key, value),
    },
    getCurrentPage: () => ({
      id: figmaApi.currentPage.id,
      name: (figmaApi.currentPage.name || "Page").slice(0, 256),
    }),
    async getStyleObservations() {
      const variables = await figmaApi.variables.getLocalVariablesAsync();
      const variableIds = new Map(
        variables.map((variable) => [variable.id, variableStableId(variable)]),
      );
      return figmaApi.currentPage
        .findAll()
        .flatMap((node) => observationsFor(node, variableIds, figmaApi.mixed));
    },
  };
}
