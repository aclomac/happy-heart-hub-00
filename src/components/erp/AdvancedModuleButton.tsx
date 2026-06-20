import { useState } from "react";
import { recordAdvancedModuleStatus } from "@/lib/nav-safe";

type AdvancedModuleButtonProps = {
  moduleName: string;
  importPath: string;
};

const productionDisabled = import.meta.env.PROD;

export function AdvancedModuleButton({ moduleName, importPath }: AdvancedModuleButtonProps) {
  const [status, setStatus] = useState(productionDisabled ? "Disabled in production" : "Idle");

  const load = async () => {
    setStatus(`Loading module: ${moduleName}`);
    recordAdvancedModuleStatus(moduleName, "loading");
    try {
      await import(/* @vite-ignore */ importPath);
      setStatus(`Loaded module: ${moduleName}`);
      recordAdvancedModuleStatus(moduleName, "loaded");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed";
      setStatus(`Failed module: ${moduleName}`);
      recordAdvancedModuleStatus(moduleName, `failed: ${message}`);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={load}
        disabled={productionDisabled}
        className="inline-flex items-center rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        Load advanced version
      </button>
      <span className="text-xs text-muted-foreground">{status}</span>
    </div>
  );
}