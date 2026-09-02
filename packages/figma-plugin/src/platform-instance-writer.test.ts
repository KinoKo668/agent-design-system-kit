import {
  figmaPlatformInstancePlanSchema,
  type FigmaPlatformInstancePlan,
} from "@agent-design-system-kit/core";
import { describe, expect, it, vi } from "vitest";

import {
  insertFigmaPlatformInstance,
  type FigmaPlatformInstancePort,
  type PlatformInstanceNodePort,
} from "./platform-instance-writer.js";
import {
  HATCHKIT_SHARED_NAMESPACE,
  MANAGED_ASSET_SHARED_KEY,
  bindFigmaLibraryFile,
  type SharedPluginDataPort,
} from "./variables-writer.js";

const FILE_BINDING_ID = "00000000-0000-4000-8000-000000000001";
const DIGEST = `sha256:${"3".repeat(64)}`;

function sharedData(): SharedPluginDataPort {
  const values = new Map<string, string>();
  return {
    getSharedPluginData: (namespace, key) =>
      values.get(`${namespace}/${key}`) ?? "",
    setSharedPluginData: (namespace, key, value) =>
      values.set(`${namespace}/${key}`, value),
  };
}

class FakeInstance implements PlatformInstanceNodePort {
  readonly data = sharedData();
  readonly id = "300:400";
  name = "";
  properties: Readonly<Record<string, string>> = {};
  removed = false;
  throwOnSetProperties = false;
  x = 0;
  y = 0;
  constructor(
    readonly main: { readonly key: string; readonly remote: boolean } | null,
  ) {}
  getMainComponent() {
    return Promise.resolve(this.main);
  }
  remove() {
    this.removed = true;
  }
  setProperties(properties: Readonly<Record<string, string>>) {
    if (this.throwOnSetProperties) throw new Error("stale property API");
    this.properties = properties;
  }
  getSharedPluginData(namespace: string, key: string) {
    return this.data.getSharedPluginData(namespace, key);
  }
  setSharedPluginData(namespace: string, key: string, value: string) {
    this.data.setSharedPluginData(namespace, key, value);
  }
}

function plan(): FigmaPlatformInstancePlan {
  return figmaPlatformInstancePlanSchema.parse({
    constraints: {
      allowComponentMutation: false,
      allowDetach: false,
      allowFallback: false,
      requireRemote: true,
    },
    instance: {
      stableId: "hatch-demo/instance/settings/save-button",
      x: 120,
      y: 240,
    },
    propertyOverrides: [
      {
        contractPropertyId: "label",
        figmaPropertyName: "Label#123:456",
        value: "Save",
      },
    ],
    schemaVersion: "1.0.0",
    selectedVariantId: "appearance-primary/state-default",
    source: {
      approvalId: "approval.platform-binding.button.ios-26-phone.1.0.0",
      bindingId: "button/ios-26-phone",
      bindingVersion: "1.0.0",
      componentContentDigest: DIGEST,
      componentId: "button",
      componentKey: "apple_button_key_100",
      componentVersion: "1.0.0",
      contentDigest: DIGEST,
      fileBindingId: FILE_BINDING_ID,
      libraryId: "apple/ios-ipados-26",
      libraryKey: "apple_library_key_26",
      platformTargetContentDigest: DIGEST,
      platformTargetId: "ios-26-phone",
      platformTargetVersion: "1.0.0",
      projectId: "hatch-demo",
      vendor: "apple",
      verifiedAt: "2026-09-02T12:00:00Z",
    },
  });
}

function setup(
  mainRemote = true,
  fileRole: "design-page" | "design-system-library" = "design-page",
) {
  const document = sharedData();
  bindFigmaLibraryFile(document, {
    fileBindingId: FILE_BINDING_ID,
    fileRole,
    projectId: "hatch-demo",
    schemaVersion: "1.0.0",
  });
  const instances: FakeInstance[] = [];
  const instance = new FakeInstance({
    key: "apple_button_key_100",
    remote: mainRemote,
  });
  const importComponentByKey = vi.fn(() =>
    Promise.resolve({
      createInstance: () => instance,
      key: "apple_button_key_100",
      remote: true,
    }),
  );
  const port: FigmaPlatformInstancePort = {
    document,
    appendToCurrentPage: (candidate) => {
      instances.push(candidate as FakeInstance);
    },
    getInstances: () => Promise.resolve(instances),
    importComponentByKey,
  };
  return { importComponentByKey, instance, instances, port };
}

const context = {
  approvalId: "approval.platform-binding.button.ios-26-phone.1.0.0",
  fileBindingId: FILE_BINDING_ID,
  operationId: "00000000-0000-4000-8000-000000000002",
  projectId: "hatch-demo",
};

describe("insertFigmaPlatformInstance", () => {
  it("imports the exact published key and preserves a remote Instance", async () => {
    const fixture = setup();
    const result = await insertFigmaPlatformInstance(
      fixture.port,
      plan(),
      context,
    );

    expect(fixture.importComponentByKey).toHaveBeenCalledWith(
      "apple_button_key_100",
    );
    expect(fixture.instance.properties).toEqual({
      "Label#123:456": "Save",
    });
    expect(result).toMatchObject({
      component: { key: "apple_button_key_100", remote: true },
      instance: { action: "created", detached: false, nodeId: "300:400" },
    });
  });

  it("returns unchanged for an exact retry without importing again", async () => {
    const fixture = setup();
    await insertFigmaPlatformInstance(fixture.port, plan(), context);
    const result = await insertFigmaPlatformInstance(
      fixture.port,
      plan(),
      context,
    );

    expect(result.instance.action).toBe("unchanged");
    expect(fixture.importComponentByKey).toHaveBeenCalledTimes(1);
  });

  it("converges a previously appended creating marker to applied", async () => {
    const fixture = setup();
    await insertFigmaPlatformInstance(fixture.port, plan(), context);
    fixture.instance.data.setSharedPluginData(
      HATCHKIT_SHARED_NAMESPACE,
      MANAGED_ASSET_SHARED_KEY,
      fixture.instance.data
        .getSharedPluginData(
          HATCHKIT_SHARED_NAMESPACE,
          MANAGED_ASSET_SHARED_KEY,
        )
        .replace('"phase":"applied"', '"phase":"creating"'),
    );

    const result = await insertFigmaPlatformInstance(
      fixture.port,
      plan(),
      context,
    );

    expect(result.instance.action).toBe("recovered");
    expect(
      fixture.instance.data.getSharedPluginData(
        HATCHKIT_SHARED_NAMESPACE,
        MANAGED_ASSET_SHARED_KEY,
      ),
    ).toContain('"phase":"applied"');
  });

  it("removes an unattached Instance when the approved property API is stale", async () => {
    const fixture = setup();
    fixture.instance.throwOnSetProperties = true;

    await expect(
      insertFigmaPlatformInstance(fixture.port, plan(), context),
    ).rejects.toMatchObject({ code: "CONTENT_DIGEST_CONFLICT" });
    expect(fixture.instance.removed).toBe(true);
    expect(fixture.instances).toHaveLength(0);
  });

  it("rejects a non-remote Main Component", async () => {
    const fixture = setup(false);
    await expect(
      insertFigmaPlatformInstance(fixture.port, plan(), context),
    ).rejects.toMatchObject({
      code: "IDENTITY_CONFLICT",
    });
  });

  it("turns inaccessible Library imports into a recoverable access error", async () => {
    const fixture = setup();
    fixture.port.importComponentByKey = () => Promise.reject(new Error("no"));
    await expect(
      insertFigmaPlatformInstance(fixture.port, plan(), context),
    ).rejects.toMatchObject({
      code: "CREDENTIAL_REQUIRED",
    });
  });

  it("refuses to place page UI into a design-system library file", async () => {
    const fixture = setup(true, "design-system-library");
    await expect(
      insertFigmaPlatformInstance(fixture.port, plan(), context),
    ).rejects.toMatchObject({ code: "FILE_BINDING_MISMATCH" });
  });
});
