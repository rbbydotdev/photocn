import { CodeBlock } from "@/components/site/code-block";
import { ComponentPreview } from "@/components/site/component-preview";
import { DocsPage, P, Section } from "@/components/site/prose";

export const metadata = { title: "Compose your own" };

export default function CompositionPage() {
  return (
    <DocsPage
      description="Wrap any layout in a provider and place the pieces wherever you want."
      title="Compose your own"
    >
      <Section title="How it fits together">
        <P>
          <code>{"<ImageEditorProvider>"}</code> owns the image, the edit params and the undo
          history. Every <code>ImageEditor*</code> component below it reads the provider through{" "}
          <code>useImageEditor()</code>, so they stay in sync without any wiring from you.
        </P>
        <CodeBlock
          code={`<ImageEditorProvider src={file} onParamsChange={save}>
  <ImageEditorCanvas />          {/* the image */}
  <ImageEditorAdjustments />     {/* any panel */}
  <ImageEditorUndoButton />      {/* any control */}
  <MyOwnThing />                 {/* useImageEditor() inside */}
</ImageEditorProvider>`}
        />
      </Section>
      <Section title="A compact editor">
        <P>Canvas, adjustments, history, compare and export: five pieces.</P>
        <ComponentPreview name="compose-your-own" />
      </Section>
      <Section title="Your own controls">
        <P>
          The filter strip below is custom JSX. It lists <code>editor.filters.presets</code>, calls{" "}
          <code>editor.filters.select()</code>, and renders the shared canvas.
        </P>
        <ComponentPreview name="filter-strip" />
      </Section>
      <Section title="Controlled pieces">
        <P>
          Each panel file also exports its plain controlled version (<code>AdjustmentPanel</code>,{" "}
          <code>CurvesPanel</code>, <code>FiltersPanel</code>, and so on) that takes <code>value</code> and{" "}
          <code>onChange</code>. Use those to drive a panel from your own state, or outside a provider.
        </P>
      </Section>
    </DocsPage>
  );
}
