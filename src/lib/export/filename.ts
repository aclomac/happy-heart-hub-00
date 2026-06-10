// Consistent, filesystem-safe filenames for every report export.

export type ReportFilenameOptions = {
  from?: string | Date | null;
  to?: string | Date | null;
  ext: "csv" | "pdf" | "xlsx" | "json";
  prefix?: string; // default "erpovo"
  timestamp?: boolean; // include HHMMSS suffix (useful when no date range)
};

function toIsoDate(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function reportFilename(slug: string, opts: ReportFilenameOptions): string {
  const prefix = slugify(opts.prefix ?? "erpovo");
  const safeSlug = slugify(slug) || "report";
  const from = toIsoDate(opts.from);
  const to = toIsoDate(opts.to);

  const parts: string[] = [prefix, safeSlug];
  if (from && to) parts.push(`${from}_${to}`);
  else if (from) parts.push(from);
  else if (to) parts.push(to);

  if (opts.timestamp || (!from && !to)) {
    const now = new Date();
    const stamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
    parts.push(stamp);
  }

  return `${parts.join("-")}.${opts.ext}`;
}
