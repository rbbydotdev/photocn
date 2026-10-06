import { notFound } from "next/navigation";

import { blocks } from "@/lib/blocks";

import { BlockView } from "./block-view";

export const dynamicParams = false;

export function generateStaticParams() {
  return blocks.map((block) => ({ name: block.name }));
}

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const block = blocks.find((b) => b.name === name);
  return block ? { title: block.title, description: block.description } : {};
}

export default async function ViewPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!blocks.some((block) => block.name === name)) notFound();
  return <BlockView name={name} />;
}
