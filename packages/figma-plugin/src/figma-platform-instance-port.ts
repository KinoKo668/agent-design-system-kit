import type {
  FigmaPlatformInstancePort,
  PlatformInstanceNodePort,
  RemoteComponentPort,
} from "./platform-instance-writer.js";

class PlatformInstanceAdapter implements PlatformInstanceNodePort {
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
  async getMainComponent() {
    const component = await this.actual.getMainComponentAsync();
    return component === null
      ? null
      : { key: component.key, remote: component.remote };
  }
  remove(): void {
    this.actual.remove();
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

class RemoteComponentAdapter implements RemoteComponentPort {
  constructor(readonly actual: ComponentNode) {}
  get key(): string {
    return this.actual.key;
  }
  get remote(): boolean {
    return this.actual.remote;
  }
  createInstance(): PlatformInstanceNodePort {
    return new PlatformInstanceAdapter(this.actual.createInstance());
  }
}

export function createFigmaPlatformInstancePort(
  figmaApi: PluginAPI,
): FigmaPlatformInstancePort {
  let pagesLoaded = false;
  return {
    document: {
      getSharedPluginData: (namespace, key) =>
        figmaApi.root.getSharedPluginData(namespace, key),
      setSharedPluginData: (namespace, key, value) =>
        figmaApi.root.setSharedPluginData(namespace, key, value),
    },
    appendToCurrentPage(instance) {
      if (!(instance instanceof PlatformInstanceAdapter)) {
        throw new Error("Instance is not owned by this Figma adapter.");
      }
      figmaApi.currentPage.appendChild(instance.actual);
    },
    async getInstances() {
      if (!pagesLoaded) {
        await figmaApi.loadAllPagesAsync();
        pagesLoaded = true;
      }
      return figmaApi.root
        .findAllWithCriteria({ types: ["INSTANCE"] })
        .map((node) => new PlatformInstanceAdapter(node));
    },
    async importComponentByKey(key) {
      return new RemoteComponentAdapter(
        await figmaApi.importComponentByKeyAsync(key),
      );
    },
  };
}
