import type { FigmaInputPlan } from "@agent-design-system-kit/core";

import type {
  ButtonTextBoundField,
  ButtonVariablePort,
} from "./button-writer.js";
import { TextAdapter, VariableAdapter } from "./figma-button-port.js";
import type {
  FigmaInputPort,
  InputComponentBoundField,
  InputComponentPort,
  InputComponentSetPort,
  InputFieldBoundField,
  InputFieldPort,
  InputTextPort,
  InputVariantChildPort,
} from "./input-writer.js";

type InputBoundField =
  ButtonTextBoundField | InputComponentBoundField | InputFieldBoundField;

function boundVariableId(
  node: SceneNode,
  field: InputBoundField,
): string | undefined {
  const bindings = node.boundVariables as
    | Record<string, VariableAlias | readonly VariableAlias[] | undefined>
    | undefined;
  const binding = bindings?.[field];
  return Array.isArray(binding)
    ? (binding as readonly VariableAlias[])[0]?.id
    : (binding as VariableAlias | undefined)?.id;
}

class InputTextAdapter extends TextAdapter implements InputTextPort {
  readonly kind = "text" as const;
}

class FieldAdapter implements InputFieldPort {
  readonly kind = "field" as const;

  constructor(
    readonly actual: FrameNode,
    private readonly variables: ReadonlyMap<string, VariableAdapter>,
    private readonly wrapText: (node: TextNode) => InputTextAdapter,
  ) {}

  get children(): readonly InputTextPort[] {
    return this.actual.children
      .filter((node): node is TextNode => node.type === "TEXT")
      .map(this.wrapText);
  }
  get totalChildCount(): number {
    return this.actual.children.length;
  }
  get cornerRadius(): number {
    if (this.actual.cornerRadius === figma.mixed)
      throw new Error("Managed Input Field has mixed corner radii.");
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
  get primaryAxisSizingMode(): "FIXED" {
    return this.actual.primaryAxisSizingMode as "FIXED";
  }
  set primaryAxisSizingMode(value: "FIXED") {
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
    if (this.actual.strokeWeight === figma.mixed)
      throw new Error("Managed Input Field has mixed stroke weights.");
    return this.actual.strokeWeight;
  }
  set strokeWeight(value: number) {
    this.actual.strokeWeight = value;
  }
  appendChild(node: InputTextPort): void {
    const adapter = node instanceof InputTextAdapter ? node : undefined;
    if (adapter === undefined)
      throw new Error("Input Text is not owned by this adapter.");
    this.actual.appendChild(adapter.actual);
  }
  resize(width: number, height: number): boolean {
    if (this.actual.width === width && this.actual.height === height)
      return false;
    this.actual.resizeWithoutConstraints(width, height);
    return true;
  }
  setBoundVariable(
    field: InputFieldBoundField,
    variable: ButtonVariablePort,
  ): boolean {
    if (boundVariableId(this.actual, field) === variable.id) return false;
    const actual = this.variables.get(variable.id)?.actual;
    if (actual === undefined)
      throw new Error("Input Variable is not owned by this adapter.");
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

class ComponentAdapter implements InputComponentPort {
  constructor(
    readonly actual: ComponentNode,
    private readonly variables: ReadonlyMap<string, VariableAdapter>,
    private readonly wrapText: (node: TextNode) => InputTextAdapter,
    private readonly wrapField: (node: FrameNode) => FieldAdapter,
  ) {}

  get id(): string {
    return this.actual.id;
  }
  get children(): readonly InputVariantChildPort[] {
    const children: InputVariantChildPort[] = [];
    for (const node of this.actual.children) {
      if (node.type === "TEXT") children.push(this.wrapText(node));
      if (node.type === "FRAME") children.push(this.wrapField(node));
    }
    return children;
  }
  get totalChildCount(): number {
    return this.actual.children.length;
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
  get itemSpacing(): number {
    return this.actual.itemSpacing;
  }
  set itemSpacing(value: number) {
    this.actual.itemSpacing = value;
  }
  get layoutMode(): "VERTICAL" {
    return this.actual.layoutMode as "VERTICAL";
  }
  set layoutMode(value: "VERTICAL") {
    this.actual.layoutMode = value;
  }
  get name(): string {
    return this.actual.name;
  }
  set name(value: string) {
    this.actual.name = value;
  }
  get primaryAxisSizingMode(): "AUTO" {
    return this.actual.primaryAxisSizingMode as "AUTO";
  }
  set primaryAxisSizingMode(value: "AUTO") {
    this.actual.primaryAxisSizingMode = value;
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
  appendChild(node: InputVariantChildPort): void {
    const actual =
      node instanceof InputTextAdapter
        ? node.actual
        : node instanceof FieldAdapter
          ? node.actual
          : undefined;
    if (actual === undefined)
      throw new Error("Input child is not owned by this adapter.");
    this.actual.appendChild(actual);
  }
  resizeWidth(width: number): boolean {
    if (this.actual.width === width) return false;
    this.actual.resizeWithoutConstraints(width, this.actual.height);
    return true;
  }
  setBoundVariable(
    field: InputComponentBoundField,
    variable: ButtonVariablePort,
  ): boolean {
    if (boundVariableId(this.actual, field) === variable.id) return false;
    const actual = this.variables.get(variable.id)?.actual;
    if (actual === undefined)
      throw new Error("Input Variable is not owned by this adapter.");
    this.actual.setBoundVariable(field, actual);
    return true;
  }
  setChildrenOrder(children: readonly InputVariantChildPort[]): boolean {
    const actual = children.map((child) =>
      child instanceof InputTextAdapter
        ? child.actual
        : child instanceof FieldAdapter
          ? child.actual
          : undefined,
    );
    if (actual.some((node) => node === undefined))
      throw new Error("Input child order contains a foreign node.");
    if (
      actual.every(
        (node, index) => this.actual.children[index]?.id === node?.id,
      )
    ) {
      return false;
    }
    actual.forEach((node, index) => {
      if (node !== undefined) this.actual.insertChild(index, node);
    });
    return true;
  }
  getSharedPluginData(namespace: string, key: string): string {
    return this.actual.getSharedPluginData(namespace, key);
  }
  setSharedPluginData(namespace: string, key: string, value: string): void {
    this.actual.setSharedPluginData(namespace, key, value);
  }
}

class ComponentSetAdapter implements InputComponentSetPort {
  constructor(
    readonly actual: ComponentSetNode,
    private readonly wrapComponent: (node: ComponentNode) => ComponentAdapter,
  ) {}
  get id(): string {
    return this.actual.id;
  }
  get children(): readonly InputComponentPort[] {
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

class InputPortAdapter implements FigmaInputPort {
  private readonly variables = new Map<string, VariableAdapter>();
  private readonly texts = new Map<string, InputTextAdapter>();
  private readonly fields = new Map<string, FieldAdapter>();
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
      FigmaInputPlan["sharedBindings"][number],
      { kind: "color" }
    >,
  ): unknown {
    const actual = this.variables.get(variable.id)?.actual;
    if (actual === undefined)
      throw new Error("Input Variable is not owned by this adapter.");
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
    components: readonly InputComponentPort[],
  ): InputComponentSetPort {
    const actual = components.map((component) => {
      const adapter = this.components.get(component.id);
      if (adapter === undefined)
        throw new Error("Input Component is not owned by this adapter.");
      return adapter.actual;
    });
    return this.wrapComponentSet(
      this.figmaApi.combineAsVariants(actual, this.figmaApi.currentPage),
    );
  }
  createComponent(): InputComponentPort {
    return this.wrapComponent(this.figmaApi.createComponent());
  }
  createFrame(): InputFieldPort {
    return this.wrapField(this.figmaApi.createFrame());
  }
  createText(): InputTextPort {
    return this.wrapText(this.figmaApi.createText());
  }
  async getComponentSets(): Promise<readonly InputComponentSetPort[]> {
    await this.loadPages();
    return this.figmaApi.root
      .findAll((node) => node.type === "COMPONENT_SET")
      .map((node) => this.wrapComponentSet(node as ComponentSetNode));
  }
  async getComponents(): Promise<readonly InputComponentPort[]> {
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
  private wrapText = (node: TextNode): InputTextAdapter => {
    const existing = this.texts.get(node.id);
    if (existing !== undefined) return existing;
    const adapter = new InputTextAdapter(node, this.variables);
    this.texts.set(node.id, adapter);
    return adapter;
  };
  private wrapField = (node: FrameNode): FieldAdapter => {
    const existing = this.fields.get(node.id);
    if (existing !== undefined) return existing;
    const adapter = new FieldAdapter(node, this.variables, this.wrapText);
    this.fields.set(node.id, adapter);
    return adapter;
  };
  private wrapComponent = (node: ComponentNode): ComponentAdapter => {
    const existing = this.components.get(node.id);
    if (existing !== undefined) return existing;
    const adapter = new ComponentAdapter(
      node,
      this.variables,
      this.wrapText,
      this.wrapField,
    );
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

export function createFigmaInputPort(figmaApi: PluginAPI): FigmaInputPort {
  return new InputPortAdapter(figmaApi);
}
