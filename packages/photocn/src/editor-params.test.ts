import { describe, expect, it } from "vitest";
import {
  createEditorParams,
  editorParamSections,
  resetEditorParams,
  setSectionSkipped,
} from "./editor-params";

describe("createEditorParams", () => {
  it("includes every declared section", () => {
    const params = createEditorParams();
    for (const section of editorParamSections) {
      expect(params[section]).toBeDefined();
    }
  });

  it("returns zeroed transform/crop and centered blur defaults", () => {
    const params = createEditorParams();
    expect(params.trs).toMatchObject({ angle: 0, scale: 0, fliph: 0, flipv: 0 });
    expect(params.crop).toMatchObject({ glcrop: 0, ar: 0, arindex: 0 });
    expect(params.blur).toMatchObject({
      bokehstrength: 0,
      bokehlensout: 0.5,
      gaussianstrength: 0,
      gaussianlensout: 0.5,
      centerX: 0.5,
      centerY: 0.5,
    });
    expect(params.blender.blendmix).toBe(0.5);
  });

  it("returns a fresh object each call (not a shared reference)", () => {
    const a = createEditorParams();
    const b = createEditorParams();
    a.lights.exposure = 0.5;
    expect(b.lights.exposure).toBe(0);
  });
});

describe("resetEditorParams", () => {
  it("restores all sections to defaults in place", () => {
    const params = createEditorParams();
    params.lights.exposure = 0.7;
    params.colors.saturation = -0.3;
    params.crop.glcrop = { left: 1, top: 1, width: 10, height: 10 };

    resetEditorParams(params);

    expect(params.lights.exposure).toBe(0);
    expect(params.colors.saturation).toBe(0);
    expect(params.crop.glcrop).toBe(0);
  });

  it("clears keys that are not part of the default shape", () => {
    const params = createEditorParams();
    (params.lights as unknown as Record<string, unknown>).extra = "stale";

    resetEditorParams(params);

    expect((params.lights as unknown as Record<string, unknown>).extra).toBeUndefined();
  });

  it("does not replace the section objects (preserves references)", () => {
    const params = createEditorParams();
    const lightsRef = params.lights;

    resetEditorParams(params);

    expect(params.lights).toBe(lightsRef);
  });
});

describe("setSectionSkipped", () => {
  it("toggles the $skip flag on a section", () => {
    const params = createEditorParams();
    setSectionSkipped(params, "lights", true);
    expect(params.lights.$skip).toBe(true);
    setSectionSkipped(params, "lights", false);
    expect(params.lights.$skip).toBe(false);
  });
});

describe("editorParamSections", () => {
  it("exposes a stable section order", () => {
    expect(editorParamSections).toEqual([
      "trs",
      "crop",
      "lights",
      "colors",
      "effects",
      "curve",
      "filters",
      "perspective",
      "perspective2",
      "blender",
      "resizer",
      "blur",
    ]);
  });
});
