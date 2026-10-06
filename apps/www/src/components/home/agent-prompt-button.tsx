"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { agentPrompt } from "@/lib/agent-prompt";

export function AgentPromptButton() {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      className="h-7 text-muted-foreground"
      onClick={async () => {
        await navigator.clipboard.writeText(agentPrompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }}
      size="xs"
      variant="ghost"
    >
      {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
      {copied ? "Copied — paste into your agent" : "Copy prompt for your agent"}
    </Button>
  );
}
