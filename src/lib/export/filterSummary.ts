// Convert a report's active filters into human-readable lines that can be
// embedded in CSV headers, PDF subtitles or print previews.

import { fmtDate } from "./format";

export type ReportFilterSummaryInput = {
  from?: string | Date | null;
  to?: string | Date | null;
  warehouse?: string | null;
  category?: string | null;
  party?: string | null;
  type?: string | null;
  status?: string | null;
  search?: string | null;
  extra?: Record<string, string | number | null | undefined>;
};

export function summarizeFilters(input: ReportFilterSummaryInput): string[] {
  const lines: string[] = [];

  const from = fmtDate(input.from ?? null);
  const to = fmtDate(input.to ?? null);
  if (from && to) lines.push(`Period: ${from} → ${to}`);
  else if (from) lines.push(`From: ${from}`);
  else if (to) lines.push(`To: ${to}`);

  if (input.warehouse) lines.push(`Warehouse: ${input.warehouse}`);
  if (input.category) lines.push(`Category: ${input.category}`);
  if (input.party) lines.push(`Party: ${input.party}`);
  if (input.type) lines.push(`Type: ${input.type}`);
  if (input.status) lines.push(`Status: ${input.status}`);
  if (input.search) lines.push(`Search: ${input.search}`);

  if (input.extra) {
    for (const [k, v] of Object.entries(input.extra)) {
      if (v === null || v === undefined || v === "") continue;
      lines.push(`${k}: ${v}`);
    }
  }

  return lines;
}

export function reportHeaderLines(args: {
  title: string;
  companyName?: string | null;
  filters?: ReportFilterSummaryInput;
  generatedAt?: Date;
}): string[] {
  const out: string[] = [];
  out.push(args.title);
  if (args.companyName) out.push(args.companyName);
  if (args.filters) {
    for (const line of summarizeFilters(args.filters)) out.push(line);
  }
  const at = args.generatedAt ?? new Date();
  out.push(`Generated: ${at.toISOString().slice(0, 19).replace("T", " ")}`);
  return out;
}
