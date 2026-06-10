// Mirror of useExport for print actions — same toast/empty-state UX.

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { EmptyExportError } from "./exportGuards";

export type UsePrintOptions = {
  successMessage?: string;
  errorMessage?: string;
  emptyMessage?: string;
};

export function usePrint(options: UsePrintOptions = {}) {
  const [printing, setPrinting] = useState(false);

  const run = useCallback(
    async (task: () => Promise<void> | void) => {
      if (printing) return;
      setPrinting(true);
      try {
        await task();
        if (options.successMessage) toast.success(options.successMessage);
      } catch (err) {
        if (err instanceof EmptyExportError) {
          toast.warning(options.emptyMessage ?? err.message);
        } else {
          const msg = err instanceof Error ? err.message : "Print failed";
          toast.error(options.errorMessage ?? msg);
        }
      } finally {
        setPrinting(false);
      }
    },
    [printing, options.successMessage, options.errorMessage, options.emptyMessage],
  );

  return { printing, run };
}
