// Defensive helpers used by every export pipeline.

export class EmptyExportError extends Error {
  constructor(msg = "Nothing to export — adjust your filters and try again.") {
    super(msg);
    this.name = "EmptyExportError";
  }
}

export function assertNotEmpty<T>(rows: T[]): T[] {
  if (!Array.isArray(rows) || rows.length === 0) throw new EmptyExportError();
  return rows;
}

/** Strip rows that look soft-deleted, even if the upstream query forgot. */
export function scopeActive<T extends { deleted_at?: string | null | undefined }>(rows: T[]): T[] {
  return rows.filter((r) => !r || r.deleted_at == null);
}

/** Strip rows whose company_id doesn't match. */
export function scopeCompany<T extends { company_id?: string | null | undefined }>(
  rows: T[],
  companyId: string | null | undefined,
): T[] {
  if (!companyId) return rows;
  return rows.filter((r) => !r.company_id || r.company_id === companyId);
}
