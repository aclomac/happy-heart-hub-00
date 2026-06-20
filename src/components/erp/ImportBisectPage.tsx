import { useState } from "react";
import { PageHeader } from "@/components/erp/PageHeader";
import { recordAdvancedModuleStatus } from "@/lib/nav-safe";

type Step = { name: string; importPath: string };

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function resolveDebugImportPath(importPath: string): string {
  if (importPath.startsWith("/disabled-heavy-routes/")) return `/src${importPath}`;
  return importPath;
}

export function ImportBisectPage({ title, steps }: { title: string; steps: Step[] }) {
  const [active, setActive] = useState("Idle");
  const [log, setLog] = useState<string[]>([]);

  const run = async () => {
    setLog([]);
    for (const step of steps) {
      setActive(`Loading module: ${step.name}`);
      setLog((prev) => [...prev, `Waiting: ${step.name}`]);
      recordAdvancedModuleStatus(step.name, "bisect waiting");
      await delay(1000);
      recordAdvancedModuleStatus(step.name, "bisect loading");
      try {
        await import(/* @vite-ignore */ resolveDebugImportPath(step.importPath));
        setLog((prev) => [...prev, `Loaded: ${step.name}`]);
        recordAdvancedModuleStatus(step.name, "bisect loaded");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Import failed";
        setLog((prev) => [...prev, `Failed: ${step.name} — ${message}`]);
        recordAdvancedModuleStatus(step.name, `bisect failed: ${message}`);
      }
    }
    setActive("Done");
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <PageHeader title={title} subtitle="Imports one disabled heavy module at a time with a 1 second delay." />
      <div className="space-y-4 rounded-md border bg-card p-4">
        <div className="text-sm font-medium text-foreground">{active}</div>
        <button type="button" onClick={run} className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
          Start import bisect
        </button>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {log.map((entry, index) => (
            <li key={`${entry}-${index}`}>{entry}</li>
          ))}
        </ul>
      </div>
    </main>
  );
}