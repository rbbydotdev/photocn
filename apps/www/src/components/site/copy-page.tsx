"use client";

import { useState } from "react";
import { CheckIcon, ChevronDownIcon, CopyIcon, FileTextIcon, MessageSquareIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Copy the page as markdown, or hand it to an AI chat. */
export function CopyPage({ url, markdown }: { url: string; markdown: string }) {
  const [copied, setCopied] = useState(false);
  const mdUrl = `${url}.md`;
  const prompt = encodeURIComponent(
    `I'm reading the photocn docs: ${mdUrl}\nHelp me use it in my project. Read the page first, then answer my questions.`,
  );
  return (
    <div className="flex shrink-0 items-center" data-slot="copy-page">
      <Button
        className="rounded-r-none"
        onClick={async () => {
          await navigator.clipboard.writeText(markdown);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
        Copy page
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button aria-label="More page options" className="-ml-px rounded-l-none" size="icon-sm" variant="outline" />
          }
        >
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem render={<a href={mdUrl} rel="noreferrer" target="_blank" />}>
            <FileTextIcon /> View as Markdown
          </DropdownMenuItem>
          <DropdownMenuItem render={<a href={`https://chatgpt.com/?q=${prompt}`} rel="noreferrer" target="_blank" />}>
            <MessageSquareIcon /> Open in ChatGPT
          </DropdownMenuItem>
          <DropdownMenuItem render={<a href={`https://claude.ai/new?q=${prompt}`} rel="noreferrer" target="_blank" />}>
            <MessageSquareIcon /> Open in Claude
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
