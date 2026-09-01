import type { FigmaButtonPlan } from "@agent-design-system-kit/core";

import type {
  ButtonBoundField,
  ButtonComponentPort,
  ButtonComponentSetPort,
  ButtonTextBoundField,
  ButtonTextPort,
  ButtonVariablePort,
  FigmaButtonPort,
} from "./button-writer.js";

function boundVariableId(
  node: SceneNode,
  field: ButtonBoundField | ButtonTextBoundField,
): string | undefined {
  const binding = node.boundVariables?.[field];
  return Array.isArray(binding) ? binding[0]?.id : binding?.id;
}

class VariableAdapter implements ButtonVariablePort {
  constructor(readonly actual: Variable) {}

  get id(): string {
    return this.actual.id;
  }

  get resolvedType(): "COLOR" | "FLOAT" | "STRING" {
    const type = this.actual.resolvedType;
    if (type !== "COLOR" && type !== "FLOAT" && type !== "STRING") {
      throw new Error(`Variable '${this.actual.id}' has an unsupported type.`);
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

class TextAdapter implements ButtonTextPort {
  constructor(
    readonly actual: TextNode,
    private readonly variables: ReadonlyMap<string, VariableAdapter>,
  ) {}

  get characters(): string {
    return this.actual.characters;
  }
  set characters(value: string) {
    this.actual.characters = value;
  }
  get componentPropertyReferences(): { characters?: string } | null {
    return this.actual.componentPropertyReferences;
  }
  set componentPropertyReferences(value: { characters?: string } | null) {
    this.actual.componentPropertyReferences = value;
  }
  get fills(): unknown {
    return this.actual.fills;
  }
  set fills(value: unknown) {
    this.actual.fills = value as readonly Paint[];
  }
  get fontName(): { family: string; style: string } {
    if (this.actual.fontName === figma.mixed) {
      throw new Error("A managed Button label has mixed fonts.");
    }
    return this.actual.fontName;
  }
  set fontName(value: { family: string; style: string }) {
    this.actual.fontName = value;
  }
  get fontSize(): number {
    if (this.actual.fontSize === figma.mixed) {
      throw new Error("A managed Button label has mixed font sizes.");
    }
    return this.actual.fontSize;
  }
  set fontSize(value: number) {
    this.actual.fontSize = value;
  }
  get letterSpacing(): { unit: "PIXELS"; value: number } {
    const spacing = this.actual.letterSpacing;
    if (spacing === figma.mixed || spacing.unit !== "PIXELS") {
      throw new Error(
        "A managed Button label has incompatible letter spacing.",
      );
    }
    return { unit: "PIXELS", value: spacing.value };
  }
  set letterSpacing(value: { unit: "PIXELS"; value: number }) {
    this.actual.letterSpacing = value;
  }
  get lineHeight(): { unit: "PERCENT"; value: number } {
    const lineHeight = this.actual.lineHeight;
    if (lineHeight === figma.mixed || lineHeight.unit !== "PERCENT") {
      throw new Error("A managed Button label has incompatible line height.");
    }
    return { unit: "PERCENT", value: lineHeight.value };
  }
  set lineHeight(value: { unit: "PERCENT"; value: number }) {
    this.actual.lineHeight = value;
  }
  get name(): string {
    return this.actual.name;
  }
  set name(value: string) {
    this.actual.name = value;
  }

  getSharedPluginData(namespace: string, key: string): string {
    return this.actual.getSharedPluginData(namespace, key);
  }
  setSharedPluginData(namespace: string, key: string, value: string): void {
    this.actual.setSharedPluginData(namespace, key, value);
  }
  setBoundVariable(
    field: ButtonTextBoundField,
    variable: ButtonVariablePort,
  ): boolean {
    if (boundVariableId(this.actual, field) === variable.id) return false;
    const actual = this.variables.get(variable.id)?.actual;
    if (actual === undefined)
      throw new Error("Variable is not owned by this adapter.");
    this.actual.setBoundVariable(field, actual);
    return true;
  }
}

class ComponentAdapter implements ButtonComponentPort {
  constructor(
    readonly actual: ComponentNode,
    private readonly variables: ReadonlyMap<string, VariableAdapter>,
    private readonly wrapText: (node: TextNode) => TextAdapter,
  ) {}

  get id(): string {
    return this.actual.id;
  }
  get children(): readonly ButtonTextPort[] {
    return this.actual.children
      .filter((node): node is TextNode => node.type === "TEXT")
      .map(this.wrapText);
  }
  get totalChildCount(): number {
    return this.actual.children.length;
  }
  get cornerRadius(): number {
    if (this.actual.cornerRadius === figma.mixed)
      throw new Error("Managed Button has mixed corner radii.");
    return this.actual.cornerRadius;
  }
  set cornerRadius(value: number) {
    this.actual.cornerRadius = value;
  }
  get counterAxisAlignItems(): "CENTER" {
    return this.actual.counterAxisAlignItems as "CENTER";
  }
  set counterAxisAlignItems(value: "CENTER") {
    this.actual.counterAxisAlignItems = value;
  }
  get counterAxisSizingMode(): "FIXED" {
    return this.actual.counterAxisSizingMode as "FIXED";
  }
  set counterAxisSizingMode(value: "FIXED") {
    this.actual.counterAxisSizingMode = value;
  }
  get description(): string {
    return this.actual.description;
  }
  set description(value: string) {
    this.actual.description = value;
  }
  get fills(): unknown {
    return this.actual.fills;
  }
  set fills(value: unknown) {
    this.actual.fills = value as readonly Paint[];
  }
  get layoutMode(): "HORIZONTAL" {
    return this.actual.layoutMode as "HORIZONTAL";
  }
  set layoutMode(value: "HORIZONTAL") {
    this.actual.layoutMode = value;
  }
  get name(): string {
    return this.actual.name;
  }
  set name(value: string) {
    this.actual.name = value;
  }
  get opacity(): number {
    return this.actual.opacity;
  }
  set opacity(value: number) {
    this.actual.opacity = value;
  }
  get paddingLeft(): number {
    return this.actual.paddingLeft;
  }
  set paddingLeft(value: number) {
    this.actual.paddingLeft = value;
  }
  get paddingRight(): number {
    return this.actual.paddingRight;
  }
  set paddingRight(value: number) {
    this.actual.paddingRight = value;
  }
  get primaryAxisAlignItems(): "CENTER" {
    return this.actual.primaryAxisAlignItems as "CENTER";
  }
  set primaryAxisAlignItems(value: "CENTER") {
    this.actual.primaryAxisAlignItems = value;
  }
  get primaryAxisSizingMode(): "AUTO" {
    return this.actual.primaryAxisSizingMode as "AUTO";
  }
  set primaryAxisSizingMode(value: "AUTO") {
    this.actual.primaryAxisSizingMode = value;
  }
  get strokeAlign(): "INSIDE" {
    return this.actual.strokeAlign as "INSIDE";
  }
  set strokeAlign(value: "INSIDE") {
    this.actual.strokeAlign = value;
  }
  get strokes(): unknown {
    return this.actual.strokes;
  }
  set strokes(value: unknown) {
    this.actual.strokes = value as readonly Paint[];
  }
  get strokeWeight(): number {
    if (this.actual.strokeWeight === figma.mixed) {
      throw new Error("Managed Button has mixed stroke weights.");
    }
    return this.actual.strokeWeight;
  }
  set strokeWeight(value: number) {
    this.actual.strokeWeight = value;
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

  appendChild(node: ButtonTextPort): void {
    const adapter = node instanceof TextAdapter ? node : undefined;
    if (adapter === undefined)
      throw new Error("Text node is not owned by this adapter.");
    this.actual.appendChild(adapter.actual);
  }
  getSharedPluginData(namespace: string, key: string): string {
    return this.actual.getSharedPluginData(namespace, key);
  }
  setSharedPluginData(namespace: string, key: string, value: string): void {
    this.actual.setSharedPluginData(namespace, key, value);
  }
  resizeHeight(height: number): boolean {
    if (this.actual.height === height) return false;
    this.actual.resizeWithoutConstraints(this.actual.width, height);
    return true;
  }
  setBoundVariable(
    field: ButtonBoundField,
    variable: ButtonVariablePort,
  ): boolean {
    if (boundVariableId(this.actual, field) === variable.id) return false;
    const actual = this.variables.get(variable.id)?.actual;
    if (actual === undefined)
      throw new Error("Variable is not owned by this adapter.");
    this.actual.setBoundVariable(field, actual);
    return true;
  }
}

class ComponentSetAdapter implements ButtonComponentSetPort {
  constructor(
    readonly actual: ComponentSetNode,
    private readonly wrapComponent: (node: ComponentNode) => ComponentAdapter,
  ) {}
  get id(): string {
    return this.actual.id;
  }
  get children(): readonly ButtonComponentPort[] {
    return this.actual.children
      .filter((node): node is ComponentNode => node.type === "COMPONENT")
      .map(this.wrapComponent);
  }
  get componentPropertyDefinitions() {
    return this.actual.componentPropertyDefinitions;
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
  addComponentProperty(
    name: string,
    type: "TEXT",
    defaultValue: string,
  ): string {
    return this.actual.addComponentProperty(name, type, defaultValue);
  }
  editComponentProperty(
    name: string,
    value: { defaultValue?: string; name?: string },
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

class ButtonPortAdapter implements FigmaButtonPort {
  private readonly variables = new Map<string, VariableAdapter>();
  private readonly texts = new Map<string, TextAdapter>();
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
    variable: ButtonVariablePort,
    binding: Extract<
      FigmaButtonPlan["variants"][number]["bindings"][number],
      { kind: "color" }
    >,
  ): unknown {
    const actual = this.variables.get(variable.id)?.actual;
    if (actual === undefined)
      throw new Error("Variable is not owned by this adapter.");
    const paint: SolidPaint = {
      type: "SOLID",
      color: {
        r: binding.fallback.r,
        g: binding.fallback.g,
        b: binding.fallback.b,
      },
      opacity: binding.fallback.a,
    };
    return [
      this.figmaApi.variables.setBoundVariableForPaint(paint, "color", actual),
    ];
  }

  combineAsVariants(
    components: readonly ButtonComponentPort[],
  ): ButtonComponentSetPort {
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

  createComponent(): ButtonComponentPort {
    return this.wrapComponent(this.figmaApi.createComponent());
  }
  createText(): ButtonTextPort {
    return this.wrapText(this.figmaApi.createText());
  }
  async getComponentSets(): Promise<readonly ButtonComponentSetPort[]> {
    await this.loadPages();
    return this.figmaApi.root
      .findAll((node) => node.type === "COMPONENT_SET")
      .map((node) => this.wrapComponentSet(node as ComponentSetNode));
  }
  async getComponents(): Promise<readonly ButtonComponentPort[]> {
    await this.loadPages();
    return this.figmaApi.root
      .findAll((node) => node.type === "COMPONENT")
      .map((node) => this.wrapComponent(node as ComponentNode));
  }
  async getVariables(): Promise<readonly ButtonVariablePort[]> {
    return (await this.figmaApi.variables.getLocalVariablesAsync()).map(
      (variable) => this.wrapVariable(variable),
    );
  }
  loadFont(family: string, style: string): Promise<void> {
    return this.figmaApi.loadFontAsync({ family, style });
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
  private wrapText = (node: TextNode): TextAdapter => {
    const existing = this.texts.get(node.id);
    if (existing !== undefined) return existing;
    const adapter = new TextAdapter(node, this.variables);
    this.texts.set(node.id, adapter);
    return adapter;
  };
  private wrapComponent = (node: ComponentNode): ComponentAdapter => {
    const existing = this.components.get(node.id);
    if (existing !== undefined) return existing;
    const adapter = new ComponentAdapter(node, this.variables, this.wrapText);
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

export function createFigmaButtonPort(figmaApi: PluginAPI): FigmaButtonPort {
  return new ButtonPortAdapter(figmaApi);
}
