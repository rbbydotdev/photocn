"use client";

import { RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export interface PanelResetHeaderProps {
  title: string;
  description?: string;
  onReset?: () => void;
  resetDisabled?: boolean;
  /** When true, the trailing separator is omitted. Most panels want it. */
  noSeparator?: boolean;
}

/**
 * The shared header strip used by every sidebar panel: title + description on
 * the left, "Reset" button on the right, separator below.
 */
export function PanelResetHeader({
  title,
  description,
  onReset,
  resetDisabled = false,
  noSeparator = false,
}: PanelResetHeaderProps) {
  return (
    <>
      <div className="flex min-h-12 items-center justify-between gap-3 px-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          {description ? (
            <p className="truncate text-xs text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        <Button
          disabled={resetDisabled || !onReset}
          onClick={onReset}
          size="sm"
          type="button"
          variant="outline"
        >
          <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
          Reset
        </Button>
      </div>
      {noSeparator ? null : <Separator />}
    </>
  );
}
