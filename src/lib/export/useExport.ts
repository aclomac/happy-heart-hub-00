// Reusable hook that wraps an export action with loading state and toasts.
// Pair with any CSV/PDF/Print trigger to disable the button while exporting.

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { EmptyExportError } from "./exportGuards";

export type UseExportOptions = {
  successMessage?: string;
  errorMessage?: string;
  emptyMessage?: string;
};

export function useExport(options: UseExportOptions = {}) {
  const [exporting, setExporting] = useState(false);

  const run = useCallback(
    async (task: () => Promise<void> | void) => {
      if (exporting) return;
      setExporting(true);
      try {
        await task();
        toast.success(options.successMessage ?? "Export complete");
      } catch (err) {
        if (err instanceof EmptyExportError) {
          toast.warning(options.emptyMessage ?? err.message);
        } else {
          const msg = err instanceof Error ? err.message : "Export failed";
          toast.error(options.errorMessage ?? msg);
        }
      } finally {
        setExporting(false);
      }
    },
    [exporting, options.successMessage, options.errorMessage, options.emptyMessage],
  );

  return { exporting, run };
}
