import { ComponentPreview } from "@/components/site/component-preview";
import { DocsPage, P, PropsTable, Section } from "@/components/site/prose";

export const metadata = { title: "The full editor" };

export default function EditorPage() {
  return (
    <DocsPage description="One component with every tool. Use it as is, or trim it down." title="The full editor">
      <Section>
        <ComponentPreview name="full-editor" />
      </Section>
      <Section title="Trim it, extend it">
        <P>
          Pass <code>tools</code> to choose which tools appear in the switcher, and <code>panels</code>{" "}
          to replace a built-in panel or add a panel for your own tool. Custom panels call{" "}
          <code>useImageEditor()</code> like the built-in ones do.
        </P>
        <ComponentPreview name="custom-tools" />
      </Section>
      <Section title="Props">
        <P>
          <code>ImageEditor</code> accepts every option of <code>useImageEditorState</code> (see the{" "}
          <a className="underline underline-offset-4" href="/docs/api">API reference</a>), plus:
        </P>
        <PropsTable
          rows={[
            ["editor", "ImageEditorApi", "State you created with useImageEditorState(). Otherwise the editor owns its state."],
            ["tools", "EditorToolbarTool[]", "Tools in the sidebar switcher. Default: all built-in tools."],
            ["panels", "Record<toolId, ReactNode>", "Replace or add sidebar panels per tool id."],
            ["showOpenButton", "boolean", "Show the Open button and the empty-state picker. Default true."],
            ["showRecipes", "boolean", "Show the recipe save/load buttons. Default true."],
            ["showHistogram", "boolean", "Show the histogram strip. Default true."],
            ["toolbarExtra", "ReactNode", "Extra toolbar content, placed before Export."],
            ["sidebarExtra", "ReactNode", "Content below the active panel."],
            ["onSave", "(result) => void | Promise<void>", "Adds a Save button to the export dialog, e.g. to upload the result."],
            ["children", "ReactNode", "Rendered inside the provider, e.g. <ImageEditorCommandMenu />."],
          ]}
        />
      </Section>
    </DocsPage>
  );
}
