import type {
  ButtonInstanceComponentPort,
  ButtonInstanceComponentSetPort,
  ButtonInstanceNodePort,
  FigmaButtonInstancePort,
} from "./button-instance-writer.js";

class InstanceAdapter implements ButtonInstanceNodePort {
  constructor(readonly actual: InstanceNode) {}

  get id(): string {
    return this.actual.id;
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

  async getMainComponentId(): Promise<string | null> {
    return (await this.actual.getMainComponentAsync())?.id ?? null;
  }
  getProperties(): Readonly<Record<string, string | boolean>> {
    return Object.fromEntries(
      Object.entries(this.actual.componentProperties).map(([name, value]) => [
        name,
        value.value,
      ]),
    );
  }
  setProperties(properties: Readonly<Record<string, string>>): void {
    this.actual.setProperties(properties);
  }
  getSharedPluginData(namespace: string, key: string): string {
    return this.actual.getSharedPluginData(namespace, key);
  }
  setSharedPluginData(namespace: string, key: string, value: string): void {
    this.actual.setSharedPluginData(namespace, key, value);
  }
}

class ComponentAdapter implements ButtonInstanceComponentPort {
  constructor(readonly actual: ComponentNode) {}

  get id(): string {
    return this.actual.id;
  }
  get name(): string {
    return this.actual.name;
  }
  createInstance(): ButtonInstanceNodePort {
    return new InstanceAdapter(this.actual.createInstance());
  }
  getSharedPluginData(namespace: string, key: string): string {
    return this.actual.getSharedPluginData(namespace, key);
  }
  setSharedPluginData(namespace: string, key: string, value: string): void {
    this.actual.setSharedPluginData(namespace, key, value);
  }
}

class ComponentSetAdapter implements ButtonInstanceComponentSetPort {
  constructor(readonly actual: ComponentSetNode) {}

  get id(): string {
    return this.actual.id;
  }
  get children(): readonly ButtonInstanceComponentPort[] {
    return this.actual.children
      .filter((node): node is ComponentNode => node.type === "COMPONENT")
      .map((node) => new ComponentAdapter(node));
  }
  get componentPropertyDefinitions() {
    return this.actual.componentPropertyDefinitions;
  }
  getSharedPluginData(namespace: string, key: string): string {
    return this.actual.getSharedPluginData(namespace, key);
  }
  setSharedPluginData(namespace: string, key: string, value: string): void {
    this.actual.setSharedPluginData(namespace, key, value);
  }
}

export function createFigmaButtonInstancePort(
  figmaApi: PluginAPI,
): FigmaButtonInstancePort {
  let pagesLoaded = false;
  async function loadPages(): Promise<void> {
    if (!pagesLoaded) {
      await figmaApi.loadAllPagesAsync();
      pagesLoaded = true;
    }
  }
  return {
    document: {
      getSharedPluginData: (namespace, key) =>
        figmaApi.root.getSharedPluginData(namespace, key),
      setSharedPluginData: (namespace, key, value) =>
        figmaApi.root.setSharedPluginData(namespace, key, value),
    },
    appendToCurrentPage(instance) {
      if (!(instance instanceof InstanceAdapter)) {
        throw new Error("Instance is not owned by this Figma adapter.");
      }
      figmaApi.currentPage.appendChild(instance.actual);
    },
    async getComponentSetById(nodeId) {
      const node = await figmaApi.getNodeByIdAsync(nodeId);
      return node?.type === "COMPONENT_SET"
        ? new ComponentSetAdapter(node)
        : null;
    },
    async getComponentSets() {
      await loadPages();
      return figmaApi.root
        .findAllWithCriteria({ types: ["COMPONENT_SET"] })
        .map((node) => new ComponentSetAdapter(node));
    },
    async getInstances() {
      await loadPages();
      return figmaApi.root
        .findAllWithCriteria({ types: ["INSTANCE"] })
        .map((node) => new InstanceAdapter(node));
    },
  };
}
