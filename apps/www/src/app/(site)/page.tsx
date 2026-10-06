import Link from "next/link";

import { AgentPromptButton } from "@/components/home/agent-prompt-button";
import { Bento } from "@/components/home/bento";
import { buttonVariants } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-7xl flex-col px-4 sm:px-6">
      <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 py-16 text-center md:py-20 lg:py-24">
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl md:text-6xl">
          The photo editor for shadcn/ui
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground text-pretty">
          Typed React components on a WebGL engine.
          <br className="hidden sm:block" /> Add the whole editor with one command, or compose your own.
        </p>
        <div className="flex flex-col items-center gap-4">
          <div className="flex flex-wrap justify-center gap-3">
            <Link className={buttonVariants({ size: "lg", className: "min-w-36" })} href="/docs">
              Get Started
            </Link>
            <Link className={buttonVariants({ size: "lg", variant: "outline", className: "min-w-36" })} href="/docs/canvas">
              View Components
            </Link>
          </div>
          <AgentPromptButton />
        </div>
      </section>
      <Bento />
    </main>
  );
}
