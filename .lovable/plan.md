
# Phase 2 — Master Data Cloud Sync

## Current state (what already exists)

The existing `/app/items`, `/app/parties`, `/app/warehouses`, `/app/item-categories`, and `/app/party-groups` routes already use the real Supabase client with `.eq("company_id", companyId)` filters and `.is("deleted_at", null)` soft-delete checks. Cloud Mode users (signed in via Supabase Auth) already get cross-device sync today through RLS. Local Mode users continue to use the demo localStorage path (`src/lib/demo/*`) untouched.

So Phase 2 is mostly about **formalizing the adapter boundary, adding sync-status UX, and locking the behavior down with tests** — not rewriting the data layer.

## Scope of this phase

Only the five master-data tables: `items`, `item_categories`, `parties`, `party_groups`, `warehouses`. Zero changes to: sales / POS / stock movements / purchases / payments / payroll / ecommerce / backup / dashboard / invoice popup.

## Changes

### 1. New `src/lib/master-data/` module (adapter layer)

Thin, typed wrappers that pick the backend by launch mode. Each file exports `list`, `upsert`, `softDelete`, `getById`:

```
src/lib/master-data/
  index.ts              -- re-exports + `useMasterDataSyncStatus()` hook
  items.ts              -- listItems / upsertItem / softDeleteItem
  item-categories.ts
  parties.ts
  party-groups.ts
  warehouses.ts
  sync-status.ts        -- last-synced timestamps + pending counter in localStorage
  upload-adapter.ts     -- Phase-5 prep: `prepareLocalMasterDataForUpload()` reads
                           all demo records and returns cloud-shaped payloads
                           (DOES NOT upload yet)
```

Routing rule inside each adapter:
- `getLaunchMode() === "cloud"` AND signed-in → real Supabase
- otherwise → existing demo localStorage helpers (`getItems`, `getParties`, `getWarehouses`)

This is additive. The existing routes continue to compile and work as-is; the adapter is what new code (and tests) call.

### 2. Sync status indicator

- `src/lib/master-data/sync-status.ts` records `last_synced_at` and `pending_changes` per entity in `localStorage` under `erpovo:sync:<entity>`.
- New tiny component `src/components/erp/MasterDataSyncBadge.tsx` shows: ✓ Synced · "Last synced 2m ago" / ⏳ Pending / ⚠ Sync failed.
- Mount it once in the header of `/app/items`, `/app/parties`, `/app/warehouses` (one line per page, no layout shift).

### 3. Duplicate / idempotency guards (already partly there)

- Items: existing SKU dedup stays; adapter calls the same SQL pattern (`ilike sku` + `company_id` + `deleted_at IS NULL`).
- Parties: existing phone dedup (in `QuickAddCustomerDialog`) stays; adapter `upsertParty` also checks name-fallback when phone is empty.
- Warehouses: adapter `upsertWarehouse` rejects same-name duplicates per company.

### 4. Cross-company isolation

Cloud reads always include `.eq("company_id", currentCompanyId)`. RLS policies on `items` / `parties` / `warehouses` already use `has_company_access(auth.uid(), company_id)`, so a wrong company_id from the client cannot leak data. A test asserts that switching `companyId` re-queries.

### 5. Tests (new file `src/test/unit/master-data-sync.test.ts`)

Covers:
1. Local mode → `listItems` reads from `getItems()` localStorage, never calls supabase.
2. Local mode → `upsertItem` writes to `setItems()`, sets `pending_changes` flag.
3. Cloud mode → `listItems` calls `supabase.from("items").select().eq("company_id", X)`.
4. Cloud mode → `upsertItem` payload always contains `company_id`.
5. Cloud mode parties read scoped by `company_id`.
6. Cloud mode parties write contains `company_id`.
7. Cloud mode warehouses read scoped by `company_id`.
8. Wrong company → adapter never returns rows for a different `company_id`.
9. Duplicate SKU rejected with clear error.
10. Soft delete sets `deleted_at` and the next `list` call excludes the row.

Supabase calls are stubbed with a fake client (already-used pattern in `src/test/unit/`).

### 6. Phase 5 prep (no behavior change)

`upload-adapter.ts` exports `prepareLocalMasterDataForUpload(companyId)` returning `{ items, parties, warehouses, categories, groups }` — pure read of local demo store, no network. Phase 5 will consume this.

## What is intentionally NOT touched

- POS, sales, purchases, stock, payroll, payments, ecommerce, backup/restore code paths.
- Existing routes' inline supabase queries (left as-is; adapter is parallel).
- Auth flow, RLS policies, migrations.
- Google OAuth (deferred).
- In-app Local↔Cloud toggle UI (still Phase 2-or-later candidate; out of this slice).

## Verification

After the edits run, in order:
1. `bunx tsc --noEmit` — must pass
2. `bun run qa:critical` — must remain 128/128 + new master-data tests
3. `bun run build` — must pass

## Reporting

Final status block in the same format you used after Phase 1: Items/Parties/Warehouses cloud-sync verdict, local-mode-still-works verdict, Phase 2 complete YES/NO, Phase 3 readiness.
