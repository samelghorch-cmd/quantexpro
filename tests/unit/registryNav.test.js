// P2-UI — registry Labs + fusion doublons nav
import { describe, it, expect } from "vitest";
import { SECTIONS, ALL_MODULES, MODULE_ALIASES, MODULE_COUNT } from "../../src/registry.js";
import { PAGES } from "../../src/pages/index.jsx";

describe("registry P2-UI", () => {
  it("expose une section Labs avec hub + ship + liveTv", () => {
    const labs = SECTIONS.find((s) => s.id === "labs");
    expect(labs).toBeTruthy();
    const ids = labs.modules.map((m) => m.id);
    expect(ids).toEqual(["labsHub", "sentiment", "shipTracker", "liveTv"]);
  });

  it("retire les doublons Quant Toolbox / Performance de la sidebar", () => {
    const ids = ALL_MODULES.map((m) => m.id);
    expect(ids).not.toContain("performanceTool");
    expect(ids).not.toContain("quantToolboxTool");
    expect(ids).toContain("performance");
    expect(ids).toContain("quantToolbox");
  });

  it("IDs modules uniques dans SECTIONS", () => {
    const ids = ALL_MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MODULE_COUNT).toBe(ids.length);
  });

  it("aliases naviguent vers les pages canonical", () => {
    expect(MODULE_ALIASES.performanceTool).toBe("performance");
    expect(MODULE_ALIASES.quantToolboxTool).toBe("quantToolbox");
    expect(PAGES.performanceTool).toBe(PAGES.performance);
    expect(PAGES.quantToolboxTool).toBe(PAGES.quantToolbox);
    expect(PAGES.labsHub).toBeTruthy();
    expect(PAGES.shipTracker).toBeTruthy();
    expect(PAGES.liveTv).toBeTruthy();
  });

  it("expose Alpha Forge dans Optimisation", () => {
    const opt = SECTIONS.find((s) => s.id === "optimisation");
    expect(opt.modules.some((m) => m.id === "alphaForge")).toBe(true);
    expect(PAGES.alphaForge).toBeTruthy();
  });
});
