# Compose: crop & transform

How photocn handles geometry: what the user can do, the order it is applied in, and how the state is stored. The model follows Apple Photos, Lightroom and Pintura, which agree on nearly everything.

## What other editors do

| | Apple Photos | Lightroom | Pintura | Snapseed |
| --- | --- | --- | --- | --- |
| Controls in one tool | crop, ratio, 90°, flip, straighten, vertical/horizontal | crop, ratio, orientation, straighten, flip, Upright + sliders | crop, ratio, 90°, flip, fine rotation, zoom | split: Crop / Rotate / Perspective |
| Order applied | fixed | fixed: lens → transform → crop | fixed: "crop is set first, then rotated" | order of the stack |
| Crop destructive? | no, reopen and widen any time | no, stored as 0–1 edges + angle | no, just state | re-openable via Stacks |
| Straighten | frame fixed, image rotates and zooms under it | same (Constrain to Image) | same (`imageCropLimitToImage: true`) | trims corners |
| Scale slider | no (zoom = smaller crop) | only in Transform, to recover edges | zoom input inside crop | Perspective → Scale |
| Resize | not in editor | export dialog | separate Resize tool (`imageTargetSize`) | separate tool |
| Crop view | full image, dimmed outside frame | same | same (`cropMaskOpacity`) | same |
| Other tools | see the cropped result; post-crop vignette follows the crop | same | decorations follow the crop | — |

Sources: Pintura [crop](https://pqina.nl/pintura/docs/v8/api/plugins/crop/), [properties](https://pqina.nl/pintura/docs/v8/api/image-editor/properties/) and [resize](https://pqina.nl/pintura/docs/v8/api/plugins/resize/) docs; Apple [iPhone](https://support.apple.com/guide/iphone/crop-rotate-flip-straighten-photos-videos-iph0f3ebb1dd/ios) and [Mac](https://support.apple.com/guide/photos/crop-and-straighten-photos-and-videos-pht13f0918f0/mac) guides; Adobe [Lightroom Classic crop](https://helpx.adobe.com/lightroom-classic/desktop/help/crop-rotate-straighten.html) and [XMP crs namespace](https://developer.adobe.com/xmp/docs/xmp-namespaces/crs/); Snapseed [Crop](https://support.google.com/snapseed/answer/3112888), [Perspective](https://support.google.com/snapseed/answer/6157686) and [Stacks](https://support.google.com/snapseed/answer/6155543). Adobe's help pages could only be checked through search excerpts.

## The model

**The order of clicks doesn't matter; the order of operations is fixed.** Geometry is one small state that is always rendered from the original pixels:

```
source ─▶ orientation (flip, 90° turns) ─▶ perspective (sliders, corners) ─▶ straighten ─▶ crop ─▶ output size (export only)
```

Nothing is baked in. Every render, all of it collapses into one 3×3 projective matrix that maps each output pixel back to a source pixel, and one shader pass samples the original through it (`src/geometry.ts`, `renderGeometry` in minigl). That means:

- a crop can be reopened and widened after any other edit;
- straightening after cropping never shows empty corners;
- 90° turns and flips change the output dimensions correctly in the preview *and* the export;
- undo/redo is just params history.

### State (`params.geometry`)

```ts
interface GeometryParams {
  quarterTurns: 0 | 1 | 2 | 3; // clockwise 90° turns
  flipX: boolean;              // mirror (applied before the turns)
  straighten: number;          // degrees, -45..45, clockwise positive
  perspectiveX: number;        // horizontal keystone, -1..1
  perspectiveY: number;        // vertical keystone, -1..1
  corners: Quad | null;        // advanced: where the image corners go
  crop: Rect | null;           // the user's crop, normalized to the oriented frame; null = everything
  aspectRatio: number | null;  // locked crop ratio (w/h), null = free
}
```

Coordinates are normalized (0–1) in the **oriented frame**: the image after flip and 90° turns, before perspective and straighten. Normalized values survive the preview proxy, full-resolution export and recipes applied to other photos.

### Rules

1. **Limit to image.** The crop that gets rendered is the user's crop, shrunk about its center (keeping its ratio) until it fits inside the warped image. The user's crop is kept as-is, so straightening back to 0° restores it. That's Apple's behavior.
2. **The frame stays put.** In the crop tool the view fits the rendered crop to the stage. When straighten or perspective shrinks the crop, the frame keeps its size on screen and the image appears to zoom in under it. During a handle drag the view is frozen; on release it animates to re-fit.
3. **Turns rotate everything you see.** Rotating 90° or flipping is a display-side operation: the crop, straighten, perspective and corners are transformed so the picture turns as a whole. A 4:5 crop becomes 5:4. The ratio control also has a portrait/landscape toggle.
4. **No scale slider.** Zooming is a smaller crop: drag the handles, or scroll or pinch inside the frame.
5. **Perspective is two sliders.** "Vertical" fixes converging verticals, "Horizontal" fixes shots taken at an angle. "Adjust corners" is the advanced mode: it shows the whole image and lets you drag each corner; the crop is fitted afterwards.
6. **Resize is an export option.** Output width/height (aspect locked) live in the export dialog and scale the final render. They are not part of the edit.
7. **The crop tool shows the whole image; every other tool shows the result.** Adjustments, the histogram, vignette and the blur focus point all work on the cropped output.
8. **Reset in the crop tool resets geometry only.** "Reset" in the toolbar resets everything.

### Interactions (crop tool)

| Gesture | Effect |
| --- | --- |
| Drag a corner/edge handle | resize the crop (ratio kept when locked), limited to the image |
| Drag inside the frame | move the image under the frame |
| Scroll / pinch inside the frame | zoom (crop smaller/larger) |
| Straighten slider | rotate the image under the fixed frame, auto-zoom |
| Vertical / Horizontal sliders | keystone under the fixed frame, auto-zoom |
| ⟲ / ⟳ | quarter turn of the whole picture |
| Flip | mirror what you see |
| Release a handle | the view eases (240 ms) to re-fit the new crop; instant with reduced motion |

### Keyboard (crop tool active, focus not in a text field)

| Keys | Action |
| --- | --- |
| R / ⇧R | rotate right / left |
| H · V | flip horizontal · vertical |
| X | portrait ⇄ landscape |
| [ · ] | straighten −/+0.5° (⇧ ±5°) |
| ← → ↑ ↓ | move the image under the frame (⇧ ×10) |
| Esc | cancel the drag in progress (no undo step) · leave corner mode |
| ⌫ / Delete | reset geometry |
| ↵ | done: back to the previous tool |
| ⌘Z / ⇧⌘Z | undo / redo (every tool) |

Arrows, Enter and ⌫ are left alone while a slider, button or menu has focus. The logic is `handleCropKey` in `photocn/react`, so headless UIs get the same shortcuts.

## Loading older params

Params saved before this model had separate `trs`, `crop`, `perspective2` and `resizer` sections. `normalizeEditorParams()` (used automatically by `defaultParams` and `setParams`) converts them:

- `crop.canvas_angle + trs.angle` → quarter turns + a ±45° straighten (positive = clockwise, as the old UI showed it)
- `trs.fliph` / `trs.flipv` → orientation (a vertical flip is a horizontal flip plus a half turn)
- `crop.appliedCrop` (pixels) → normalized crop, once the image size is known (applied without an undo step)
- `trs.scale` (zoom) → a proportionally smaller, centered crop
- `perspective2.before/after` → the `corners` quad
- `crop.ar` → `aspectRatio`
- `resizer` → returned as `outputSize`, since resizing is now an export option
