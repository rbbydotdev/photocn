import { CodeBlock } from "@/components/site/code-block";
import { ComponentPreview } from "@/components/site/component-preview";
import { DocsPage, P, Section } from "@/components/site/prose";

export const metadata = { title: "Saving edits" };

export default function SavingPage() {
  return (
    <DocsPage description="Save the rendered image, the edit itself, or both." title="Saving edits">
      <Section title="Upload the result">
        <P>
          <code>onSave</code> adds a Save button to the export dialog. It receives the encoded{" "}
          <code>Blob</code> at full resolution; for JPEG, the original EXIF is kept.
        </P>
        <CodeBlock
          code={`<ImageEditor
  src={photo.url}
  onSave={async ({ blob, filename }) => {
    const body = new FormData();
    body.append("file", blob, filename);
    await fetch("/api/photos", { method: "POST", body });
  }}
/>`}
        />
        <P>
          Or call it yourself: <code>await editor.exportImage({"{ format: \"webp\", quality: 0.9 }"})</code>.
        </P>
      </Section>
      <Section title="Save the edit, not the pixels">
        <P>
          Edits are plain data. <code>onParamsChange</code> fires on every change, and{" "}
          <code>buildRecipe(params)</code> turns the params into a small JSON diff that you can store and
          re-apply later with <code>editor.recipes.apply(recipe)</code>. Pass{" "}
          <code>defaultParams</code> to restore a full session.
        </P>
        <ComponentPreview name="controlled" />
      </Section>
    </DocsPage>
  );
}
