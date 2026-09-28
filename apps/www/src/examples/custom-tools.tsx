"use client";

import { CropIcon, SlidersHorizontalIcon, StickerIcon, WandSparklesIcon } from "lucide-react";
import { useImageEditor } from "photocn/react";

import { Button } from "@/components/ui/button";
import { ImageEditor } from "@/registry/image-editor/image-editor";

// The full editor, trimmed to three built-in tools plus one of your own.
export default function CustomToolsExample() {
  return (
    <ImageEditor
      className="h-[640px] overflow-hidden rounded-xl border"
      defaultTool="filters"
      panels={{ stamp: <StampPanel /> }}
      showRecipes={false}
      src="/samples/dog.jpg"
      tools={[
        { value: "filters", label: "Filters", icon: WandSparklesIcon },
        { value: "adjust", label: "Adjust", icon: SlidersHorizontalIcon },
        { value: "compose", label: "Crop", icon: CropIcon },
        { value: "stamp", label: "Looks", icon: StickerIcon },
      ]}
    />
  );
}

// Custom panels get the same API as the built-in ones.
function StampPanel() {
  const editor = useImageEditor();
  const looks = {
    Moody: { exposure: -0.15, contrast: 0.35, shadows: -0.2 },
    Airy: { exposure: 0.2, contrast: -0.15, highlights: -0.3 },
    Punchy: { contrast: 0.45, bloom: 0.15 },
  } as const;
  return (
    <div className="flex flex-col gap-2 p-4">
      <h2 className="text-sm font-semibold">One-tap looks</h2>
      {Object.entries(looks).map(([name, look]) => (
        <Button
          key={name}
          onClick={() => editor.adjust.setLights({ ...editor.adjust.value.lights, ...look })}
          variant="outline"
        >
          {name}
        </Button>
      ))}
    </div>
  );
}
