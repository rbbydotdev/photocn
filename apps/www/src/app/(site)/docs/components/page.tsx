import { InstallCommand } from "@/components/site/install-command";
import { DocsPage, P, Section } from "@/components/site/prose";
import { registryItemUrl } from "@/lib/site";

import registry from "../../../../../registry.json";

export const metadata = { title: "Components" };

const exportsByItem: Record<string, string[]> = {
  "image-editor": ["ImageEditor", "ImageEditorStatusBadge"],
  "image-editor-layout": ["ImageEditorLayout"],
  "image-editor-canvas": ["ImageEditorCanvas", "ImageEditorEmptyState", "EditorCropWorkspace", "PerspectiveOverlay", "BlurCenterOverlay"],
  "image-editor-toolbar": ["ImageEditorToolbar", "ImageEditorUndoButton", "ImageEditorRedoButton", "ImageEditorOpenButton", "ImageEditorResetButton", "ImageEditorCompareButton", "EditorToolbar"],
  "image-editor-histogram": ["ImageEditorHistogram"],
  "image-editor-tool-panel": ["ImageEditorToolPanel", "defaultToolPanels"],
  "image-editor-panel-header": ["PanelResetHeader"],
  "image-editor-adjustments": ["ImageEditorAdjustments", "AdjustmentPanel"],
  "image-editor-filters": ["ImageEditorFilters", "FiltersPanel"],
  "image-editor-curves": ["ImageEditorCurves", "CurvesPanel"],
  "image-editor-blur": ["ImageEditorBlur", "BlurPanel"],
  "image-editor-crop": ["ImageEditorCrop", "CompositionPanel"],
  "image-editor-blend": ["ImageEditorBlend", "BlenderPanel"],
  "image-editor-metadata": ["ImageEditorMetadata", "MetadataPanel"],
  "image-editor-export": ["ImageEditorExportDialog"],
  "image-editor-recipes": ["ImageEditorRecipes", "RecipeActions"],
  "image-editor-command-menu": ["ImageEditorCommandMenu", "EditorCommandDialog"],
  "image-editor-devtools": ["ImageEditorDevtools"],
};

export default function ComponentsPage() {
  return (
    <DocsPage
      description="Every piece is its own registry item. Installing one also installs what it depends on."
      title="Components"
    >
      <P>
        Components named <code>ImageEditor*</code> read the nearest provider and take no required
        props. Each panel file also exports a plain controlled version (value and onChange).
        Files are installed into <code>components/image-editor/</code>.
      </P>
      {registry.items.map((item) => (
        <Section id={item.name} key={item.name} title={item.title}>
          <P>{item.description}</P>
          <div className="flex flex-wrap gap-1.5">
            {(exportsByItem[item.name] ?? []).map((name) => (
              <code className="rounded-md border bg-muted/40 px-1.5 py-0.5 font-mono text-xs" key={name}>
                {name}
              </code>
            ))}
          </div>
          <InstallCommand items={registryItemUrl(item.name)} />
        </Section>
      ))}
    </DocsPage>
  );
}
