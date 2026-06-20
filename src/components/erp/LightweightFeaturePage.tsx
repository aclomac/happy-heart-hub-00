import type { ReactNode } from "react";
import { AdvancedModuleButton } from "@/components/erp/AdvancedModuleButton";
import { PageHeader } from "@/components/erp/PageHeader";

type Column = { key: string; label: string; align?: "left" | "right" };

type LightweightFeaturePageProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  moduleName: string;
  importPath: string;
  columns?: Column[];
  emptyText?: string;
  children?: ReactNode;
};

export function LightweightFeaturePage({
  title,
  subtitle,
  actionLabel,
  moduleName,
  importPath,
  columns = [],
  emptyText = "No rows loaded yet.",
  children,
}: LightweightFeaturePageProps) {
  return (
    <div className="space-y-4">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {actionLabel ? (
              <button
                type="button"
                className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm"
              >
                {actionLabel}
              </button>
            ) : null}
            <AdvancedModuleButton moduleName={moduleName} importPath={importPath} />
          </div>
        }
      />
      {children}
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="erp-table min-w-full">
          <thead>
            <tr>
              {(columns.length ? columns : [{ key: "name", label: title }]).map((column) => (
                <th key={column.key} className={column.align === "right" ? "text-right" : undefined}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={Math.max(columns.length, 1)} className="py-10 text-center text-sm text-muted-foreground">
                {emptyText}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}