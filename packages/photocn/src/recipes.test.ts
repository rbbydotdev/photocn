import { describe, expect, it } from "vitest";

import { createEditorParams, type CurveChannels } from "./editor-params";
import { applyRecipe, buildRecipe } from "./recipes";

const contrast: CurveChannels = [
  [[0, 0], [0.25, 0.1], [0.75, 0.9], [1, 1]],
  null,
  [[0, 0], [1, 1]],
  [[0, 0.1], [1, 1]],
];
const image = (src: string) => ({ src, currentSrc: src }) as unknown as HTMLImageElement;

describe("recipes", () => {
  it("is null for an unedited photo", () => {
    expect(buildRecipe(createEditorParams())).toBeNull();
  });

  it("saves curves, dropping straight channels", () => {
    const params = createEditorParams();
    params.curve.curvepoints = contrast;
    expect(buildRecipe(params)?.curves).toEqual([contrast[0], null, null, contrast[3]]);
  });

  it("skips curves that are all straight lines", () => {
    const params = createEditorParams();
    params.curve.curvepoints = [[[0, 0], [1, 1]], null, null, null];
    expect(buildRecipe(params)).toBeNull();
  });

  it("saves the blur focus point", () => {
    const params = createEditorParams();
    Object.assign(params.blur, { bokehstrength: 0.6, centerX: 0.3, centerY: 0.7 });
    expect(buildRecipe(params)?.blur).toMatchObject({ bokehstrength: 0.6, centerX: 0.3, centerY: 0.7 });
  });

  it("saves the blend image by URL, but not a page-lifetime blob: URL", () => {
    const params = createEditorParams();
    params.blender.blendmap = image("data:image/webp;base64,AAAA");
    params.blender.blendmix = 0.3;
    expect(buildRecipe(params)?.blend).toEqual({ src: "data:image/webp;base64,AAAA", mix: 0.3 });
    params.blender.blendmap = image("blob:http://x/1");
    expect(buildRecipe(params)).toBeNull();
  });

  it("round-trips every saved section", () => {
    const params = createEditorParams();
    params.lights.exposure = 0.4;
    params.colors.temperature = -0.5;
    params.colors.saturation = 0.2;
    params.effects.vignette = 0.3;
    params.curve.curvepoints = contrast;
    params.blender.blendmap = image("https://example.com/texture.jpg");
    params.blender.blendmix = 0.25;
    Object.assign(params.blur, { gaussianstrength: 0.5, centerX: 0.2 });
    params.geometry = { ...params.geometry, quarterTurns: 1, straighten: 5 };

    const recipe = JSON.parse(JSON.stringify(buildRecipe(params)));
    const restored = applyRecipe(createEditorParams(), recipe);
    expect(restored.lights.exposure).toBe(0.4);
    expect(restored.colors).toMatchObject({ temperature: -0.5, saturation: 0.2 });
    expect(restored.effects.vignette).toBe(0.3);
    expect(restored.curve.curvepoints).toEqual([contrast[0], null, null, contrast[3]]);
    expect(restored.blur).toMatchObject({ gaussianstrength: 0.5, centerX: 0.2 });
    expect(restored.geometry).toMatchObject({ quarterTurns: 1, straighten: 5 });
    // The image itself is loaded by the caller from recipe.blend.src.
    expect(restored.blender.blendmix).toBe(0.25);
    expect(recipe.blend.src).toBe("https://example.com/texture.jpg");
  });

  it("clears curves and blend when the recipe has none", () => {
    const params = createEditorParams();
    params.curve.curvepoints = contrast;
    params.blender.blendmap = image("https://example.com/t.jpg");
    const next = applyRecipe(params, { version: 1, lights: { exposure: 0.1 } });
    expect(next.curve.curvepoints).toBe(0);
    expect(next.blender.blendmap).toBe(0);
  });
});
