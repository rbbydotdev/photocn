/** Blocks: ready-made editors built from the photocn components. */
export const blocks = [
  { name: "editor", title: "Editor", description: "The full editor, filling the screen, with a ⌘K command menu.", file: "editor.tsx", height: 720 },
  { name: "editor-minimal", title: "Minimal editor", description: "Adjust, filters and crop, plus export. Nothing else.", file: "editor-minimal.tsx", height: 640 },
  { name: "editor-mobile", title: "Mobile editor", description: "Photo first, tools at the bottom, controls in a sheet.", file: "editor-mobile.tsx", height: 760, mobile: true },
  { name: "avatar-cropper", title: "Avatar cropper", description: "Pick a photo, frame it in a square, save a 512px avatar.", file: "avatar-cropper.tsx", height: 520 },
  { name: "upload-editor", title: "Upload editor", description: "Drop a photo, edit it, then upload the result.", file: "upload-editor.tsx", height: 720 },
  { name: "filter-picker", title: "Filter picker", description: "A phone-style row of looks with a strength slider.", file: "filter-picker.tsx", height: 700 },
  { name: "before-after", title: "Before / after", description: "Drag to compare the original with the edit.", file: "before-after.tsx", height: 640 },
  { name: "batch-looks", title: "Batch looks", description: "Choose one look and apply it to many photos at once.", file: "batch-looks.tsx", height: 520 },
] as const;

export type BlockName = (typeof blocks)[number]["name"];
