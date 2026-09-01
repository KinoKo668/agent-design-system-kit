import type {
  FigmaVariableResolvedType,
  FigmaVariableScope,
} from "@agent-design-system-kit/core";

import type {
  FigmaVariablesPort,
  VariableCollectionPort,
  VariablePort,
} from "./variables-writer.js";

class CollectionAdapter implements VariableCollectionPort {
  readonly #collection: VariableCollection;

  constructor(collection: VariableCollection) {
    this.#collection = collection;
  }

  get actual(): VariableCollection {
    return this.#collection;
  }

  get defaultModeId(): string {
    return this.#collection.defaultModeId;
  }

  get id(): string {
    return this.#collection.id;
  }

  get hiddenFromPublishing(): boolean {
    return this.#collection.hiddenFromPublishing;
  }

  set hiddenFromPublishing(value: boolean) {
    this.#collection.hiddenFromPublishing = value;
  }

  get modes(): readonly { readonly modeId: string; readonly name: string }[] {
    return this.#collection.modes;
  }

  get name(): string {
    return this.#collection.name;
  }

  set name(value: string) {
    this.#collection.name = value;
  }

  addMode(name: string): string {
    return this.#collection.addMode(name);
  }

  getSharedPluginData(namespace: string, key: string): string {
    return this.#collection.getSharedPluginData(namespace, key);
  }

  renameMode(modeId: string, newName: string): void {
    this.#collection.renameMode(modeId, newName);
  }

  setSharedPluginData(namespace: string, key: string, value: string): void {
    this.#collection.setSharedPluginData(namespace, key, value);
  }
}

class VariableAdapter implements VariablePort {
  readonly #variable: Variable;

  constructor(variable: Variable) {
    this.#variable = variable;
  }

  get actual(): Variable {
    return this.#variable;
  }

  get codeSyntax(): Readonly<Record<string, string | undefined>> {
    return this.#variable.codeSyntax;
  }

  get description(): string {
    return this.#variable.description;
  }

  set description(value: string) {
    this.#variable.description = value;
  }

  get hiddenFromPublishing(): boolean {
    return this.#variable.hiddenFromPublishing;
  }

  set hiddenFromPublishing(value: boolean) {
    this.#variable.hiddenFromPublishing = value;
  }

  get id(): string {
    return this.#variable.id;
  }

  get name(): string {
    return this.#variable.name;
  }

  set name(value: string) {
    this.#variable.name = value;
  }

  get resolvedType(): FigmaVariableResolvedType {
    const type = this.#variable.resolvedType;
    if (type !== "COLOR" && type !== "FLOAT" && type !== "STRING") {
      throw new Error(
        `Variable type '${type}' is outside the FIG-003 contract.`,
      );
    }
    return type;
  }

  get scopes(): FigmaVariableScope[] {
    return this.#variable.scopes as FigmaVariableScope[];
  }

  set scopes(value: FigmaVariableScope[]) {
    this.#variable.scopes = value;
  }

  get valuesByMode(): Readonly<Record<string, unknown>> {
    return this.#variable.valuesByMode;
  }

  get variableCollectionId(): string {
    return this.#variable.variableCollectionId;
  }

  getSharedPluginData(namespace: string, key: string): string {
    return this.#variable.getSharedPluginData(namespace, key);
  }

  setSharedPluginData(namespace: string, key: string, value: string): void {
    this.#variable.setSharedPluginData(namespace, key, value);
  }

  setValueForMode(modeId: string, value: unknown): void {
    this.#variable.setValueForMode(modeId, value as VariableValue);
  }

  setVariableCodeSyntax(platform: "WEB", value: string): void {
    this.#variable.setVariableCodeSyntax(platform, value);
  }
}

class VariablesPortAdapter implements FigmaVariablesPort {
  readonly #figma: PluginAPI;
  readonly #collections = new Map<string, CollectionAdapter>();
  readonly #variables = new Map<string, VariableAdapter>();
  readonly document;

  constructor(figmaApi: PluginAPI) {
    this.#figma = figmaApi;
    this.document = {
      getSharedPluginData: (namespace: string, key: string) =>
        figmaApi.root.getSharedPluginData(namespace, key),
      setSharedPluginData: (namespace: string, key: string, value: string) =>
        figmaApi.root.setSharedPluginData(namespace, key, value),
    };
  }

  createAlias(variable: VariablePort): VariableAlias {
    const adapter = this.#variables.get(variable.id);
    if (adapter === undefined) {
      throw new Error(
        "Variable alias target is not owned by this Figma adapter.",
      );
    }
    return this.#figma.variables.createVariableAlias(adapter.actual);
  }

  createCollection(name: string): VariableCollectionPort {
    return this.wrapCollection(
      this.#figma.variables.createVariableCollection(name),
    );
  }

  createVariable(
    name: string,
    collection: VariableCollectionPort,
    resolvedType: FigmaVariableResolvedType,
  ): VariablePort {
    const adapter = this.#collections.get(collection.id);
    if (adapter === undefined) {
      throw new Error(
        "Variable Collection is not owned by this Figma adapter.",
      );
    }
    return this.wrapVariable(
      this.#figma.variables.createVariable(name, adapter.actual, resolvedType),
    );
  }

  async getCollections(): Promise<readonly VariableCollectionPort[]> {
    const collections =
      await this.#figma.variables.getLocalVariableCollectionsAsync();
    return collections.map((collection) => this.wrapCollection(collection));
  }

  async getVariables(): Promise<readonly VariablePort[]> {
    const variables = await this.#figma.variables.getLocalVariablesAsync();
    return variables.map((variable) => this.wrapVariable(variable));
  }

  private wrapCollection(collection: VariableCollection): CollectionAdapter {
    const existing = this.#collections.get(collection.id);
    if (existing !== undefined) return existing;
    const adapter = new CollectionAdapter(collection);
    this.#collections.set(collection.id, adapter);
    return adapter;
  }

  private wrapVariable(variable: Variable): VariableAdapter {
    const existing = this.#variables.get(variable.id);
    if (existing !== undefined) return existing;
    const adapter = new VariableAdapter(variable);
    this.#variables.set(variable.id, adapter);
    return adapter;
  }
}

export function createFigmaVariablesPort(
  figmaApi: PluginAPI,
): FigmaVariablesPort {
  return new VariablesPortAdapter(figmaApi);
}
