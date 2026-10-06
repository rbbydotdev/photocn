"use client";

// Demo wrappers for the blocks (sample photos, centered layouts). Used by the
// /view/[name] previews and the home page. Not part of the registry.
import dynamic from "next/dynamic";
import type { ComponentType } from "react";

const d = <P extends object>(load: () => Promise<ComponentType<P>>) =>
  dynamic(load, { ssr: false }) as unknown as ComponentType<P>;

const Editor = d(() => import("./editor").then((m) => m.EditorBlock));
const EditorMinimal = d(() => import("./editor-minimal").then((m) => m.EditorMinimalBlock));
const EditorMobile = d(() => import("./editor-mobile").then((m) => m.EditorMobileBlock));
const AvatarCropper = d(() => import("./avatar-cropper").then((m) => m.AvatarCropper));
const UploadEditor = d(() => import("./upload-editor").then((m) => m.UploadEditor));
const FilterPicker = d(() => import("./filter-picker").then((m) => m.FilterPicker));
const BeforeAfter = d(() => import("./before-after").then((m) => m.BeforeAfter));
const BatchLooks = d(() => import("./batch-looks").then((m) => m.BatchLooks));

export const blockDemos: Record<string, ComponentType> = {
  editor: () => <Editor src="/samples/mountain-lake.jpg" />,
  "editor-minimal": () => <EditorMinimal src="/samples/street.jpg" />,
  "editor-mobile": () => <EditorMobile src="/samples/strawberries.jpg" />,
  "avatar-cropper": () => (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <AvatarCropper defaultSrc="/samples/portrait.jpg" />
    </div>
  ),
  "upload-editor": () => (
    <div className="mx-auto max-w-4xl p-6">
      <UploadEditor />
    </div>
  ),
  "filter-picker": () => (
    <div className="flex justify-center p-6">
      <FilterPicker className="w-full" src="/samples/dog.jpg" />
    </div>
  ),
  "before-after": () => (
    <div className="mx-auto max-w-3xl p-6">
      <BeforeAfter lights={{ exposure: 0.15, contrast: 0.25 }} src="/samples/mountain-lake.jpg" />
    </div>
  ),
  "batch-looks": () => (
    <div className="mx-auto max-w-4xl p-6">
      <BatchLooks
        photos={["/samples/dog.jpg", "/samples/street.jpg", "/samples/portrait.jpg", "/samples/strawberries.jpg"]}
      />
    </div>
  ),
};
