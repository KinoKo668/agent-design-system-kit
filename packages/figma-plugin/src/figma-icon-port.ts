import type { FigmaIconPlan } from "@agent-design-system-kit/core";

import type {
  FigmaIconPort,
  IconComponentPort,
  IconComponentSetPort,
  IconFrameBoundField,
  IconGlyphPort,
  IconVariablePort,
} from "./icon-writer.js";

function boundVariableId(
  node: ComponentNode,
  field: IconFrameBoundField,
): string | undefined {
  const binding = node.boundVariables?.[field];
  return binding?.id;
}

class VariableAdapter implements IconVariablePort {
  constructor(readonly actual: Variable) {}

  get id(): string {
    return this.actual.id;
  }
  get resolvedType(): "COLOR" | "FLOAT" {
    const type = this.actual.resolvedType;
    if (type !== "COLOR" && type !== "FLOAT") {
      throw new Error(
        `Icon Variable '${this.actual.id}' has an unsupported type.`,
      );
    }
    return type;
  }
  getSharedPluginData(namespace: string, key: string): string {
    return this.actual.getSharedPluginData(namespace, key);
  }
  setSharedPluginData(namespace: string, key: string, value: string): void {
    this.actual.setSharedPluginData(namespace, key, value);
  }
}

class GlyphAdapter implements IconGlyphPort {
  constructor(readonly actual: VectorNode) {}

  get id(): string {
    return this.actual.id;
  }
  get fills(): unknown {
    return this.actual.fills;
  }
  set fills(value: unknown) {
    this.actual.fills = value as readonly Paint[];
  }
  get height(): number {
    return this.actual.height;
  }
  get name(): string {
    return this.actual.name;
  }
  set name(value: string) {
    this.actual.name = value;
  }
  get strokeCap(): "ROUND" {
    if (this.actual.strokeCap !== "ROUND") {
      return this.actual.strokeCap as "ROUND";
    }
    return "ROUND";
  }
  set strokeCap(value: "ROUND") {
    this.actual.strokeCap = value;
  }
  get strokeJoin(): "ROUND" {
    if (this.actual.strokeJoin !== "ROUND") {
      return this.actual.strokeJoin as "ROUND";
    }
    return "ROUND";
  }
  set strokeJoin(value: "ROUND") {
    this.actual.strokeJoin = value;
  }
  get strokes(): unknown {
    return this.actual.strokes;
  }
  set strokes(value: unknown) {
    this.actual.strokes = value as readonly Paint[];
  }
  get strokeWeight(): number {
    if (this.actual.strokeWeight === figma.mixed) {
      throw new Error("Managed Icon Glyph has mixed stroke weights.");
    }
    return this.actual.strokeWeight;
  }
  set strokeWeight(value: number) {
    this.actual.strokeWeight = value;
  }
  get vectorPaths(): readonly {
    readonly data: string;
    readonly windingRule: "NONE";
  }[] {
    return this.actual.vectorPaths as readonly {
      readonly data: string;
      readonly windingRule: "NONE";
    }[];
  }
  set vectorPaths(
    value: readonly { readonly data: string; readonly windingRule: "NONE" }[],
  ) {
    this.actual.vectorPaths = value;
  }
  get width(): number {
    return this.actual.width;
  }
  get x(): number {
    return this.actual.x;
  }
  set x(value: number) {
    this.actual.x = value;
  }
  get y(): number {
    return this.actual.y;
  }
  set y(value: number) {
    this.actual.y = value;
  }
  resize(width: number, height: number): boolean {
    if (this.actual.width === width && this.actual.height === height)
      return false;
    this.actual.resize(width, height);
    return true;
  }
  getSharedPluginData(namespace: string, key: string): string {
    return this.actual.getSharedPluginData(namespace, key);
  }
  setSharedPluginData(namespace: string, key: string, value: string): void {
    this.actual.setSharedPluginData(namespace, key, value);
  }
}

class ComponentAdapter implements IconComponentPort {
  constructor(
    readonly actual: ComponentNode,
    private readonly variables: ReadonlyMap<string, VariableAdapter>,
    private readonly wrapGlyph: (node: VectorNode) => GlyphAdapter,
  ) {}

  get children(): readonly IconGlyphPort[] {
    return this.actual.children
      .filter((node): node is VectorNode => node.type === "VECTOR")
      .map(this.wrapGlyph);
  }
  get id(): string {
    return this.actual.id;
  }
  get totalChildCount(): number {
    return this.actual.children.length;
  }
  get description(): string {
    return this.actual.description;
  }
  set description(value: string) {
    this.actual.description = value;
  }
  get name(): string {
    return this.actual.name;
  }
  set name(value: string) {
    this.actual.name = value;
  }
  get x(): number {
    return this.actual.x;
  }
  set x(value: number) {
    this.actual.x = value;
  }
  get y(): number {
    return this.actual.y;
  }
  set y(value: number) {
    this.actual.y = value;
  }
  appendChild(node: IconGlyphPort): void {
    const adapter = node instanceof GlyphAdapter ? node : undefined;
    if (adapter === undefined)
      throw new Error("Glyph is not owned by this adapter.");
    this.actual.appendChild(adapter.actual);
  }
  resize(size: number): boolean {
    if (this.actual.width === size && this.actual.height === size) return false;
    this.actual.resizeWithoutConstraints(size, size);
    return true;
  }
  setBoundVariable(
    field: IconFrameBoundField,
    variable: IconVariablePort,
  ): boolean {
    if (boundVariableId(this.actual, field) === variable.id) return false;
    const actual = this.variables.get(variable.id)?.actual;
    if (actual === undefined)
      throw new Error("Variable is not owned by this adapter.");
    this.actual.setBoundVariable(field, actual);
    return true;
  }
  getSharedPluginData(namespace: string, key: string): string {
    return this.actual.getSharedPluginData(namespace, key);
  }
  setSharedPluginData(namespace: string, key: string, value: string): void {
    this.actual.setSharedPluginData(namespace, key, value);
  }
}

class ComponentSetAdapter implements IconComponentSetPort {
  constructor(
    readonly actual: ComponentSetNode,
    private readonly wrapComponent: (node: ComponentNode) => ComponentAdapter,
  ) {}
  get children(): readonly IconComponentPort[] {
    return this.actual.children
      .filter((node): node is ComponentNode => node.type === "COMPONENT")
      .map(this.wrapComponent);
  }
  get componentPropertyDefinitions() {
    return this.actual.componentPropertyDefinitions;
  }
  get id(): string {
    return this.actual.id;
  }
  get description(): string {
    return this.actual.description;
  }
  set description(value: string) {
    this.actual.description = value;
  }
  get name(): string {
    return this.actual.name;
  }
  set name(value: string) {
    this.actual.name = value;
  }
  editComponentProperty(
    name: string,
    value: { defaultValue?: string },
  ): string {
    return this.actual.editComponentProperty(name, value);
  }
  getSharedPluginData(namespace: string, key: string): string {
    return this.actual.getSharedPluginData(namespace, key);
  }
  setSharedPluginData(namespace: string, key: string, value: string): void {
    this.actual.setSharedPluginData(namespace, key, value);
  }
}

class IconPortAdapter implements FigmaIconPort {
  private readonly variables = new Map<string, VariableAdapter>();
  private readonly glyphs = new Map<string, GlyphAdapter>();
  private readonly components = new Map<string, ComponentAdapter>();
  private readonly componentSets = new Map<string, ComponentSetAdapter>();
  private pagesLoaded = false;
  readonly document;

  constructor(private readonly figmaApi: PluginAPI) {
    this.document = {
      getSharedPluginData: (namespace: string, key: string) =>
        figmaApi.root.getSharedPluginData(namespace, key),
      setSharedPluginData: (namespace: string, key: string, value: string) =>
        figmaApi.root.setSharedPluginData(namespace, key, value),
    };
  }

  bindColor(
    variable: IconVariablePort,
    fallback: FigmaIconPlan["glyph"]["color"]["fallback"],
  ): unknown {
    const actual = this.variables.get(variable.id)?.actual;
    if (actual === undefined)
      throw new Error("Variable is not owned by this adapter.");
    const paint: SolidPaint = {
      type: "SOLID",
      color: { r: fallback.r, g: fallback.g, b: fallback.b },
      opacity: fallback.a,
    };
    return [
      this.figmaApi.variables.setBoundVariableForPaint(paint, "color", actual),
    ];
  }
  combineAsVariants(
    components: readonly IconComponentPort[],
  ): IconComponentSetPort {
    const actual = components.map((component) => {
      const adapter = this.components.get(component.id);
      if (adapter === undefined)
        throw new Error("Component is not owned by this adapter.");
      return adapter.actual;
    });
    return this.wrapComponentSet(
      this.figmaApi.combineAsVariants(actual, this.figmaApi.currentPage),
    );
  }
  createComponent(): IconComponentPort {
    return this.wrapComponent(this.figmaApi.createComponent());
  }
  createGlyph(): IconGlyphPort {
    return this.wrapGlyph(this.figmaApi.createVector());
  }
  async getComponentSets(): Promise<readonly IconComponentSetPort[]> {
    await this.loadPages();
    return this.figmaApi.root
      .findAll((node) => node.type === "COMPONENT_SET")
      .map((node) => this.wrapComponentSet(node as ComponentSetNode));
  }
  async getComponents(): Promise<readonly IconComponentPort[]> {
    await this.loadPages();
    return this.figmaApi.root
      .findAll((node) => node.type === "COMPONENT")
      .map((node) => this.wrapComponent(node as ComponentNode));
  }
  async getVariables(): Promise<readonly IconVariablePort[]> {
    return (await this.figmaApi.variables.getLocalVariablesAsync()).map(
      (variable) => this.wrapVariable(variable),
    );
  }

  private async loadPages(): Promise<void> {
    if (this.pagesLoaded) return;
    await this.figmaApi.loadAllPagesAsync();
    this.pagesLoaded = true;
  }
  private wrapVariable(variable: Variable): VariableAdapter {
    const existing = this.variables.get(variable.id);
    if (existing !== undefined) return existing;
    const adapter = new VariableAdapter(variable);
    this.variables.set(variable.id, adapter);
    return adapter;
  }
  private wrapGlyph = (node: VectorNode): GlyphAdapter => {
    const existing = this.glyphs.get(node.id);
    if (existing !== undefined) return existing;
    const adapter = new GlyphAdapter(node);
    this.glyphs.set(node.id, adapter);
    return adapter;
  };
  private wrapComponent = (node: ComponentNode): ComponentAdapter => {
    const existing = this.components.get(node.id);
    if (existing !== undefined) return existing;
    const adapter = new ComponentAdapter(node, this.variables, this.wrapGlyph);
    this.components.set(node.id, adapter);
    return adapter;
  };
  private wrapComponentSet(node: ComponentSetNode): ComponentSetAdapter {
    const existing = this.componentSets.get(node.id);
    if (existing !== undefined) return existing;
    const adapter = new ComponentSetAdapter(node, this.wrapComponent);
    this.componentSets.set(node.id, adapter);
    return adapter;
  }
}

export function createFigmaIconPort(figmaApi: PluginAPI): FigmaIconPort {
  return new IconPortAdapter(figmaApi);
}
