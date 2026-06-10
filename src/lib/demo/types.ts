/**
 * Minimal supabase-like client surface used by the seeder. The real
 * `supabase` client from `@/integrations/supabase/client` satisfies this
 * shape; tests inject a mock that records calls.
 */
export interface SeedQueryBuilder {
  select: (cols?: string) => SeedQueryBuilder;
  eq: (col: string, val: unknown) => SeedQueryBuilder;
  in: (col: string, vals: unknown[]) => SeedQueryBuilder;
  is: (col: string, val: unknown) => SeedQueryBuilder;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
  limit: (n: number) => SeedQueryBuilder;
  order: (col: string, opts?: { ascending?: boolean }) => SeedQueryBuilder;
  insert: (rows: unknown) => Promise<{ data: unknown; error: unknown }>;
  upsert: (
    rows: unknown,
    opts?: { onConflict?: string },
  ) => Promise<{ data: unknown; error: unknown }>;
  update: (patch: unknown) => SeedQueryBuilder;
  delete: () => SeedQueryBuilder;
  then?: unknown;
}

export interface SeedClient {
  from: (table: string) => SeedQueryBuilder;
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string; email?: string | null } | null };
      error: unknown;
    }>;
  };
}

export interface SeedContext {
  client: SeedClient;
  userId: string;
  companyId: string;
}

export interface SeedReport {
  ok: boolean;
  version: number;
  alreadySeeded: boolean;
  companyId?: string;
  steps: Record<string, { created: number; skipped: number }>;
  errors: string[];
}
