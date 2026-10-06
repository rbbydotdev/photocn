import { ComponentPreview } from "@/components/site/component-preview";
import { DocsPage, P, Section } from "@/components/site/prose";

export const metadata = { title: "Headless" };

export default function HeadlessPage() {
  return (
    <DocsPage
      description="Bring your own design system. The engine and controller have no UI opinions."
      title="Headless"
    >
      <Section>
        <P>
          <code>useImageEditorState()</code> from <code>photocn/react</code> returns the same API the
          components use. Attach <code>canvasRef</code> to a <code>{"<canvas>"}</code> (keyed by{" "}
          <code>canvasKey</code>) and{" "}
          <code>stageRef</code> to its container. Everything else is up to you, and no registry code is
          needed. To share the state with children, pass it to{" "}
          <code>{"<ImageEditorProvider editor={editor}>"}</code>.
        </P>
        <ComponentPreview name="headless" />
      </Section>
      <Section title="Lower-level building blocks">
        <P>
          To go deeper, <code>photocn/hooks</code> exposes the primitives the controller is built from:{" "}
          <code>useMiniPhotoEditor</code>, <code>useEditorHistory</code>, <code>useCropGeometry</code>,{" "}
          <code>useHistogram</code> and <code>useExifMetadata</code>. The framework-agnostic core
          (<code>photocn</code>, <code>photocn/gl</code>, <code>photocn/exif</code>) works without React.
        </P>
      </Section>
    </DocsPage>
  );
}
