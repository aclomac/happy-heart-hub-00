import { forwardRef } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Lock } from "lucide-react";

/**
 * A button that is visually disabled and shows a "Coming soon" tooltip on hover.
 * Use this to wrap any UI affordance that is not yet implemented, so the user
 * never silently clicks a dead button.
 */
export const ComingSoonButton = forwardRef<HTMLButtonElement, ButtonProps & { note?: string }>(
  ({ children, note, className, ...rest }, ref) => {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* span wrapper so the tooltip still fires on a disabled button */}
            <span className="inline-block">
              <Button
                ref={ref}
                {...rest}
                disabled
                aria-disabled="true"
                className={`opacity-50 cursor-not-allowed pointer-events-none ${className || ""}`}
              >
                {children}
                <Lock className="w-3 h-3 ml-1.5 opacity-70" aria-hidden />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <span className="text-xs">{note || "Coming soon"}</span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  },
);
ComingSoonButton.displayName = "ComingSoonButton";
