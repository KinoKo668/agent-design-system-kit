/*
 * SPIKE-001: prove that a local Figma plugin can create and then safely
 * re-resolve Variables, a four-variant Button Component Set, and an Instance.
 *
 * This file intentionally has no build step. The experiment must not decide the
 * production monorepo/tooling choices that belong to ADR-001.
 */

const SHARED_NAMESPACE = "agent_design_system_kit";
const SHARED_KEY = "stable-id";
const SPIKE_PREFIX = "spike-001";

const IDS = Object.freeze({
  page: `${SPIKE_PREFIX}/page/button`,
  documentation: `${SPIKE_PREFIX}/documentation/button`,
  primitiveCollection: `${SPIKE_PREFIX}/collection/primitives`,
  semanticCollection: `${SPIKE_PREFIX}/collection/semantics`,
  componentSet: "button",
  instance: `${SPIKE_PREFIX}/instance/button-demo`
});

const PRIMITIVE_TOKENS = Object.freeze([
  colorToken("color/indigo/600", "#4F46E5"),
  colorToken("color/white", "#FFFFFF"),
  colorToken("color/gray/950", "#111827"),
  colorToken("color/gray/400", "#9CA3AF"),
  colorToken("color/gray/300", "#D1D5DB"),
  colorToken("color/gray/200", "#E5E7EB")
]);

const SEMANTIC_TOKENS = Object.freeze([
  aliasToken("button/color/primary/background/default", "color/indigo/600", ["FRAME_FILL", "SHAPE_FILL"]),
  aliasToken("button/color/primary/content/default", "color/white", ["TEXT_FILL"]),
  aliasToken("button/color/secondary/background/default", "color/white", ["FRAME_FILL", "SHAPE_FILL"]),
  aliasToken("button/color/secondary/content/default", "color/gray/950", ["TEXT_FILL"]),
  aliasToken("button/color/secondary/border/default", "color/gray/300", ["STROKE_COLOR"]),
  aliasToken("button/color/background/disabled", "color/gray/200", ["FRAME_FILL", "SHAPE_FILL"]),
  aliasToken("button/color/content/disabled", "color/gray/400", ["TEXT_FILL"]),
  aliasToken("button/color/border/disabled", "color/gray/300", ["STROKE_COLOR"]),
  floatToken("button/size/medium/height", 40, ["WIDTH_HEIGHT"]),
  floatToken("button/spacing/medium/padding-x", 16, ["GAP"]),
  floatToken("button/radius", 8, ["CORNER_RADIUS"]),
  floatToken("button/stroke-width", 1, ["STROKE_FLOAT"]),
  // Figma OPACITY variables use percentage values: 100 resolves to node opacity 1.
  floatToken("button/opacity/enabled", 100, ["OPACITY"]),
  floatToken("button/opacity/disabled", 55, ["OPACITY"]),
  stringToken("button/label/font-family", "Inter", ["FONT_FAMILY"]),
  stringToken("button/label/font-style", "Medium", ["FONT_STYLE"]),
  floatToken("button/label/font-size", 14, ["FONT_SIZE"]),
  floatToken("button/label/line-height", 20, ["LINE_HEIGHT"])
]);

function colorToken(name, value) {
  return { name, type: "COLOR", value, scopes: [] };
}

function aliasToken(name, aliasOf, scopes) {
  return { name, type: "COLOR", aliasOf, scopes };
}

function floatToken(name, value, scopes) {
  return { name, type: "FLOAT", value, scopes };
}

function stringToken(name, value, scopes) {
  return { name, type: "STRING", value, scopes };
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Unsupported color value: ${hex}`);
  }
  return {
    r: parseInt(normalized.slice(0, 2), 16) / 255,
    g: parseInt(normalized.slice(2, 4), 16) / 255,
    b: parseInt(normalized.slice(4, 6), 16) / 255
  };
}

function buildVariantSpecs() {
  return ["Primary", "Secondary"].flatMap((appearance) =>
    ["Default", "Disabled"].map((state) => ({ appearance, state }))
  );
}

function stableIdForVariable(collectionId, variableName) {
  return `${collectionId}/variable/${variableName}`;
}

function codeSyntaxFor(variableName) {
  return `var(--ads-${variableName.replace(/\//g, "-")})`;
}

function getStableId(entity) {
  return entity.getSharedPluginData(SHARED_NAMESPACE, SHARED_KEY);
}

function setStableId(entity, stableId) {
  entity.setSharedPluginData(SHARED_NAMESPACE, SHARED_KEY, stableId);
}

function findUnique(items, predicate, description) {
  const matches = items.filter(predicate);
  if (matches.length > 1) {
    throw new Error(`Identity conflict: found ${matches.length} ${description} records.`);
  }
  return matches[0] || null;
}

async function ensurePage(report) {
  const pages = [...figma.root.children];
  let page = findUnique(pages, (candidate) => getStableId(candidate) === IDS.page, "Button pages");

  if (!page) {
    const nameMatches = pages.filter((candidate) => candidate.name === "SPIKE-001 / Button");
    if (nameMatches.length > 1) {
      throw new Error("Identity conflict: multiple pages are named SPIKE-001 / Button.");
    }
    const adopted = Boolean(nameMatches[0]);
    page = nameMatches[0] || figma.createPage();
    page.name = "SPIKE-001 / Button";
    setStableId(page, IDS.page);
    (adopted ? report.reused : report.created).push({
      type: "PAGE",
      id: page.id,
      stableId: IDS.page,
      ...(adopted ? { adopted: true } : {})
    });
  } else {
    report.reused.push({ type: "PAGE", id: page.id, stableId: IDS.page });
  }

  await figma.setCurrentPageAsync(page);
  await page.loadAsync();
  return page;
}

async function ensureCollection(stableId, name, report) {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  let collection = findUnique(
    collections,
    (candidate) => getStableId(candidate) === stableId,
    `${name} collections`
  );

  if (!collection) {
    const nameMatches = collections.filter((candidate) => candidate.name === name);
    if (nameMatches.length > 1) {
      throw new Error(`Identity conflict: multiple collections are named ${name}.`);
    }
    const adopted = Boolean(nameMatches[0]);
    collection = nameMatches[0] || figma.variables.createVariableCollection(name);
    setStableId(collection, stableId);
    (adopted ? report.reused : report.created).push({
      type: "VARIABLE_COLLECTION",
      id: collection.id,
      stableId,
      ...(adopted ? { adopted: true } : {})
    });
  } else {
    report.reused.push({ type: "VARIABLE_COLLECTION", id: collection.id, stableId });
  }

  if (collection.modes.length !== 1) {
    throw new Error(`${name} must have exactly one mode in SPIKE-001; found ${collection.modes.length}.`);
  }
  collection.renameMode(collection.modes[0].modeId, "Value");
  collection.hiddenFromPublishing = true;
  return collection;
}

async function ensureVariable(collection, collectionStableId, definition, primitiveVariables, report) {
  const allVariables = await figma.variables.getLocalVariablesAsync();
  const stableId = stableIdForVariable(collectionStableId, definition.name);
  const candidates = allVariables.filter((variable) => variable.variableCollectionId === collection.id);
  let variable = findUnique(
    candidates,
    (candidate) => getStableId(candidate) === stableId,
    `${definition.name} variables`
  );

  if (!variable) {
    const nameMatches = candidates.filter((candidate) => candidate.name === definition.name);
    if (nameMatches.length > 1) {
      throw new Error(`Identity conflict: duplicate variable ${definition.name}.`);
    }
    const adopted = Boolean(nameMatches[0]);
    variable = nameMatches[0] || figma.variables.createVariable(definition.name, collection, definition.type);
    setStableId(variable, stableId);
    (adopted ? report.reused : report.created).push({
      type: "VARIABLE",
      id: variable.id,
      stableId,
      ...(adopted ? { adopted: true } : {})
    });
  } else {
    report.reused.push({ type: "VARIABLE", id: variable.id, stableId });
  }

  if (variable.resolvedType !== definition.type) {
    throw new Error(`Variable ${definition.name} has type ${variable.resolvedType}; expected ${definition.type}.`);
  }

  const modeId = collection.modes[0].modeId;
  const value = definition.aliasOf
    ? figma.variables.createVariableAlias(required(primitiveVariables[definition.aliasOf], definition.aliasOf))
    : definition.type === "COLOR"
      ? hexToRgb(definition.value)
      : definition.value;

  variable.name = definition.name;
  variable.description = "SPIKE-001 experimental value. Not an approved product design decision.";
  variable.scopes = [...definition.scopes];
  variable.hiddenFromPublishing = true;
  variable.setValueForMode(modeId, value);
  variable.setVariableCodeSyntax("WEB", codeSyntaxFor(definition.name));
  return variable;
}

async function ensureVariables(report) {
  const primitiveCollection = await ensureCollection(
    IDS.primitiveCollection,
    "ADS Spike / Primitives",
    report
  );
  const semanticCollection = await ensureCollection(
    IDS.semanticCollection,
    "ADS Spike / Button Semantics",
    report
  );

  const primitives = {};
  for (const definition of PRIMITIVE_TOKENS) {
    primitives[definition.name] = await ensureVariable(
      primitiveCollection,
      IDS.primitiveCollection,
      definition,
      primitives,
      report
    );
  }

  const semantics = {};
  for (const definition of SEMANTIC_TOKENS) {
    semantics[definition.name] = await ensureVariable(
      semanticCollection,
      IDS.semanticCollection,
      definition,
      primitives,
      report
    );
  }

  return { primitiveCollection, semanticCollection, primitives, semantics };
}

function required(value, name) {
  if (!value) throw new Error(`Required asset not found: ${name}`);
  return value;
}

function bindColor(variable) {
  return figma.variables.setBoundVariableForPaint(
    { type: "SOLID", color: { r: 0, g: 0, b: 0 } },
    "color",
    variable
  );
}

function findLabel(component) {
  return component.findOne((node) => node.type === "TEXT" && node.name === "Label");
}

function applyVariant(component, spec, semantics) {
  const disabled = spec.state === "Disabled";
  const primary = spec.appearance === "Primary";

  component.name = `Appearance=${spec.appearance}, State=${spec.state}`;
  component.description = "Experimental Button variant created by SPIKE-001.";
  component.layoutMode = "HORIZONTAL";
  component.resize(100, 40);
  component.primaryAxisSizingMode = "AUTO";
  component.counterAxisSizingMode = "FIXED";
  component.primaryAxisAlignItems = "CENTER";
  component.counterAxisAlignItems = "CENTER";

  component.setBoundVariable("height", semantics["button/size/medium/height"]);
  component.setBoundVariable("paddingLeft", semantics["button/spacing/medium/padding-x"]);
  component.setBoundVariable("paddingRight", semantics["button/spacing/medium/padding-x"]);
  component.setBoundVariable("topLeftRadius", semantics["button/radius"]);
  component.setBoundVariable("topRightRadius", semantics["button/radius"]);
  component.setBoundVariable("bottomLeftRadius", semantics["button/radius"]);
  component.setBoundVariable("bottomRightRadius", semantics["button/radius"]);
  component.setBoundVariable(
    "opacity",
    semantics[disabled ? "button/opacity/disabled" : "button/opacity/enabled"]
  );

  const backgroundToken = disabled
    ? "button/color/background/disabled"
    : primary
      ? "button/color/primary/background/default"
      : "button/color/secondary/background/default";
  component.fills = [bindColor(semantics[backgroundToken])];

  if (primary) {
    component.strokes = [];
  } else {
    const borderToken = disabled
      ? "button/color/border/disabled"
      : "button/color/secondary/border/default";
    component.strokes = [bindColor(semantics[borderToken])];
    component.strokeAlign = "INSIDE";
    component.setBoundVariable("strokeWeight", semantics["button/stroke-width"]);
  }

  const label = required(findLabel(component), `${component.name} Label`);
  label.fontName = { family: "Inter", style: "Medium" };
  label.fontSize = 14;
  label.lineHeight = { unit: "PIXELS", value: 20 };
  label.textAutoResize = "WIDTH_AND_HEIGHT";
  label.fills = [
    bindColor(
      semantics[
        disabled
          ? "button/color/content/disabled"
          : primary
            ? "button/color/primary/content/default"
            : "button/color/secondary/content/default"
      ]
    )
  ];
  label.setBoundVariable("fontFamily", semantics["button/label/font-family"]);
  label.setBoundVariable("fontStyle", semantics["button/label/font-style"]);
  label.setBoundVariable("fontSize", semantics["button/label/font-size"]);
  label.setBoundVariable("lineHeight", semantics["button/label/line-height"]);
}

function createVariant(spec, semantics) {
  const component = figma.createComponent();
  const label = figma.createText();
  label.name = "Label";
  label.characters = "Button";
  component.appendChild(label);
  applyVariant(component, spec, semantics);
  return component;
}

function getVariant(componentSet, spec) {
  return componentSet.children.find(
    (child) =>
      child.type === "COMPONENT" &&
      child.variantProperties &&
      child.variantProperties.Appearance === spec.appearance &&
      child.variantProperties.State === spec.state
  );
}

function positionVariantGrid(componentSet) {
  const specs = buildVariantSpecs();
  const gapX = 32;
  const gapY = 24;
  const padding = 32;

  for (const spec of specs) {
    const child = required(getVariant(componentSet, spec), `${spec.appearance}/${spec.state}`);
    const column = spec.state === "Default" ? 0 : 1;
    const row = spec.appearance === "Primary" ? 0 : 1;
    child.x = padding + column * (140 + gapX);
    child.y = padding + row * (40 + gapY);
  }

  const maxX = Math.max(...componentSet.children.map((child) => child.x + child.width));
  const maxY = Math.max(...componentSet.children.map((child) => child.y + child.height));
  componentSet.resizeWithoutConstraints(maxX + padding, maxY + padding);
}

function ensureLabelProperty(componentSet) {
  const existingKeys = Object.entries(componentSet.componentPropertyDefinitions)
    .filter(([, definition]) => definition.type === "TEXT")
    .map(([key]) => key)
    .filter((key) => key.split("#")[0] === "Label");

  if (existingKeys.length > 1) {
    throw new Error("Identity conflict: Button has multiple Label component properties.");
  }

  const labelKey = existingKeys[0] || componentSet.addComponentProperty("Label", "TEXT", "Button");
  for (const child of componentSet.children) {
    const label = required(findLabel(child), `${child.name} Label`);
    label.componentPropertyReferences = { characters: labelKey };
  }
  return labelKey;
}

async function ensureComponentSet(page, semantics, report) {
  const allComponentSets = figma.root.findAllWithCriteria({ types: ["COMPONENT_SET"] });
  let componentSet = findUnique(
    allComponentSets,
    (candidate) => getStableId(candidate) === IDS.componentSet,
    "Button Component Sets"
  );

  if (!componentSet) {
    const nameMatches = page
      .findAllWithCriteria({ types: ["COMPONENT_SET"] })
      .filter((candidate) => candidate.name === "Button");
    if (nameMatches.length > 1) {
      throw new Error("Identity conflict: multiple Button Component Sets exist without stable identity.");
    }
    if (nameMatches.length === 1) {
      componentSet = nameMatches[0];
      if (componentSet.children.length !== 4) {
        throw new Error("The existing Button cannot be adopted because it does not have four variants.");
      }
      setStableId(componentSet, IDS.componentSet);
      report.reused.push({
        type: "COMPONENT_SET",
        id: componentSet.id,
        stableId: IDS.componentSet,
        adopted: true
      });
    } else {
      const variants = buildVariantSpecs().map((spec) => createVariant(spec, semantics));
      componentSet = figma.combineAsVariants(variants, page);
      componentSet.name = "Button";
      componentSet.x = 480;
      componentSet.y = 40;
      setStableId(componentSet, IDS.componentSet);
      report.created.push({ type: "COMPONENT_SET", id: componentSet.id, stableId: IDS.componentSet });
    }
  } else {
    if (componentSet.parent !== page) {
      throw new Error("The stable Button Component Set exists outside the SPIKE-001 Button page.");
    }
    report.reused.push({ type: "COMPONENT_SET", id: componentSet.id, stableId: IDS.componentSet });
  }

  if (componentSet.children.length !== 4) {
    throw new Error(`Button must contain exactly four variants; found ${componentSet.children.length}.`);
  }

  for (const spec of buildVariantSpecs()) {
    const variant = required(getVariant(componentSet, spec), `${spec.appearance}/${spec.state}`);
    applyVariant(variant, spec, semantics);
  }

  componentSet.description =
    "SPIKE-001 proof: Medium Button with Appearance (Primary/Secondary), State (Default/Disabled), and editable Label. Experimental values only.";
  positionVariantGrid(componentSet);
  const labelKey = ensureLabelProperty(componentSet);
  return { componentSet, labelKey };
}

async function ensureDocumentation(page, report) {
  const frames = page.findAllWithCriteria({ types: ["FRAME"] });
  let frame = findUnique(
    frames,
    (candidate) => getStableId(candidate) === IDS.documentation,
    "Button documentation frames"
  );

  if (!frame) {
    const nameMatches = frames.filter((candidate) => candidate.name === "SPIKE-001 / Notes");
    if (nameMatches.length > 1) {
      throw new Error("Identity conflict: multiple SPIKE-001 documentation frames exist.");
    }
    if (nameMatches.length === 1) {
      frame = nameMatches[0];
      setStableId(frame, IDS.documentation);
      report.reused.push({
        type: "FRAME",
        id: frame.id,
        stableId: IDS.documentation,
        adopted: true
      });
    } else {
      frame = figma.createFrame();
      frame.name = "SPIKE-001 / Notes";
      frame.x = 40;
      frame.y = 40;
      frame.resize(360, 220);
      frame.layoutMode = "VERTICAL";
      frame.primaryAxisSizingMode = "AUTO";
      frame.counterAxisSizingMode = "FIXED";
      frame.paddingTop = 24;
      frame.paddingRight = 24;
      frame.paddingBottom = 24;
      frame.paddingLeft = 24;
      frame.itemSpacing = 12;
      frame.fills = [{ type: "SOLID", color: hexToRgb("#F8FAFC") }];
      setStableId(frame, IDS.documentation);

      const title = figma.createText();
      title.name = "Title";
      title.fontName = { family: "Inter", style: "Bold" };
      title.fontSize = 24;
      title.characters = "SPIKE-001 / Button";
      frame.appendChild(title);

      const body = figma.createText();
      body.name = "Description";
      body.fontName = { family: "Inter", style: "Regular" };
      body.fontSize = 13;
      body.lineHeight = { unit: "PIXELS", value: 20 };
      body.characters =
        "验证 Variables、4 个 Variant、Label 属性、真实 Instance 与重复运行幂等性。\n\n画面中的数值只用于技术实验，不代表已批准的产品视觉规范。";
      body.resize(312, 20);
      body.textAutoResize = "HEIGHT";
      frame.appendChild(body);
      report.created.push({ type: "FRAME", id: frame.id, stableId: IDS.documentation });
    }
  } else {
    report.reused.push({ type: "FRAME", id: frame.id, stableId: IDS.documentation });
  }
  return frame;
}

async function ensureInstance(page, componentSet, labelKey, report) {
  const instances = figma.root.findAllWithCriteria({ types: ["INSTANCE"] });
  let instance = findUnique(
    instances,
    (candidate) => getStableId(candidate) === IDS.instance,
    "Button demo Instances"
  );

  if (!instance) {
    const nameMatches = instances.filter((candidate) => candidate.name === "Button / Demo Instance");
    if (nameMatches.length > 1) {
      throw new Error("Identity conflict: multiple Button demo Instances exist.");
    }
    if (nameMatches.length === 1) {
      instance = nameMatches[0];
      const mainComponent = await instance.getMainComponentAsync();
      if (!mainComponent || mainComponent.parent !== componentSet) {
        throw new Error("The existing demo Instance does not belong to the SPIKE-001 Button.");
      }
      setStableId(instance, IDS.instance);
      report.reused.push({
        type: "INSTANCE",
        id: instance.id,
        stableId: IDS.instance,
        adopted: true
      });
    } else {
      const defaultVariant = required(
        getVariant(componentSet, { appearance: "Primary", state: "Default" }),
        "Primary/Default variant"
      );
      instance = defaultVariant.createInstance();
      instance.name = "Button / Demo Instance";
      instance.x = 480;
      instance.y = componentSet.y + componentSet.height + 80;
      setStableId(instance, IDS.instance);
      report.created.push({ type: "INSTANCE", id: instance.id, stableId: IDS.instance });
    }
  } else {
    if (instance.parent !== page) {
      throw new Error("The stable Button demo Instance exists outside the SPIKE-001 Button page.");
    }
    report.reused.push({ type: "INSTANCE", id: instance.id, stableId: IDS.instance });
  }

  instance.setProperties({ Appearance: "Primary", State: "Default", [labelKey]: "继续" });
  return instance;
}

async function validateResult(page, componentSet, instance, variables) {
  const variantNames = componentSet.children.map((child) => child.name).sort();
  const expectedNames = buildVariantSpecs()
    .map((spec) => `Appearance=${spec.appearance}, State=${spec.state}`)
    .sort();
  const variantMatrixValid = JSON.stringify(variantNames) === JSON.stringify(expectedNames);
  const mainComponent = await instance.getMainComponentAsync();

  return {
    pageId: page.id,
    componentSetId: componentSet.id,
    componentSetKey: componentSet.key,
    instanceId: instance.id,
    variableCount: Object.keys(variables.primitives).length + Object.keys(variables.semantics).length,
    variantCount: componentSet.children.length,
    variantMatrixValid,
    instanceIsReal: Boolean(mainComponent && mainComponent.parent === componentSet),
    instanceProperties: instance.componentProperties,
    stableIds: {
      componentSet: getStableId(componentSet),
      instance: getStableId(instance)
    }
  };
}

async function runSpike() {
  if (figma.editorType !== "figma") {
    throw new Error("SPIKE-001 can only run in a Figma Design file.");
  }

  const report = { created: [], reused: [] };
  await figma.loadAllPagesAsync();
  await Promise.all([
    figma.loadFontAsync({ family: "Inter", style: "Regular" }),
    figma.loadFontAsync({ family: "Inter", style: "Medium" }),
    figma.loadFontAsync({ family: "Inter", style: "Bold" })
  ]);

  const page = await ensurePage(report);
  const variables = await ensureVariables(report);
  await ensureDocumentation(page, report);
  const { componentSet, labelKey } = await ensureComponentSet(page, variables.semantics, report);
  const instance = await ensureInstance(page, componentSet, labelKey, report);
  const validation = await validateResult(page, componentSet, instance, variables);

  figma.currentPage.selection = [componentSet, instance];
  figma.viewport.scrollAndZoomIntoView([componentSet, instance]);
  return { operation: "SPIKE-001", report, validation };
}

if (typeof figma !== "undefined") {
  figma.showUI(__html__, { width: 440, height: 560, themeColors: true });
  figma.ui.onmessage = async (message) => {
    if (message.type === "close") {
      figma.closePlugin();
      return;
    }
    if (message.type !== "run-spike") return;

    try {
      const result = await runSpike();
      figma.ui.postMessage({ type: "result", ok: true, result });
    } catch (error) {
      figma.ui.postMessage({
        type: "result",
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    SHARED_NAMESPACE,
    IDS,
    PRIMITIVE_TOKENS,
    SEMANTIC_TOKENS,
    buildVariantSpecs,
    codeSyntaxFor,
    hexToRgb,
    stableIdForVariable
  };
}
