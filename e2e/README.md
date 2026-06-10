# ERPOVO Restore E2E Tests

End-to-end Playwright suite that verifies the soft-delete / restore
lifecycle across the 13 key ERPOVO modules plus permissions, permanent
delete, and report exclusion.

> **Local setup shortcut:** copy `.env.e2e.example` to `.env.e2e` at the repo
> root and fill it in, then `set -a; source .env.e2e; set +a` before running
> any `test:e2e*` command.

The suite is **opt-in**. It is not part of `bun run test` (Vitest unit +
static suite) so the default developer loop stays fast. CI calls
`bun run test:all`, which runs typecheck + Vitest and then runs E2E
**only when the required env vars are configured**.

---

## Required environment variables

| Variable                                 | Where to get it                                                                              |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| `E2E_BASE_URL`                           | URL of a running ERPOVO instance, e.g. `http://localhost:8080` or a Lovable preview URL.     |
| `E2E_OWNER_EMAIL` / `E2E_OWNER_PASSWORD` | Credentials of an **owner or admin** of the seeded test company.                             |
| `E2E_USER_EMAIL` / `E2E_USER_PASSWORD`   | Credentials of a **normal member** without the `recycle_bin` permission.                     |
| `SUPABASE_URL`                           | Supabase project URL (same one the app reads from `VITE_SUPABASE_URL`).                      |
| `SUPABASE_SERVICE_ROLE_KEY`              | Service-role key — used by the seeder, audit assertions, and cleanup. **Never** commit this. |
| `E2E_COMPANY_ID`                         | UUID of the company that owns the seeded test data.                                          |

Optional:

| Variable            | Default | Purpose                                                                      |
| ------------------- | ------- | ---------------------------------------------------------------------------- |
| `E2E_FORCE_LOGIN`   | `0`     | Set to `1` to re-login both roles even if `e2e/.auth/*.json` already exists. |
| `E2E_SKIP_TEARDOWN` | `0`     | Set to `1` to skip the post-run cleanup (useful when debugging).             |

---

## One-time local setup

```bash
# 1. Install browser binaries (cached afterwards)
bunx playwright install --with-deps chromium

# 2. Export the env vars above (or put them in a .env you source manually)
export E2E_BASE_URL=http://localhost:8080
export E2E_OWNER_EMAIL=...
export E2E_OWNER_PASSWORD=...
export E2E_USER_EMAIL=...
export E2E_USER_PASSWORD=...
export SUPABASE_URL=https://<ref>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...
export E2E_COMPANY_ID=<uuid>
```

---

## Running

| Command                                          | Behavior                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `bun run test`                                   | Vitest unit + static suite. Never runs E2E.                                                       |
| `bun run test:unit`                              | Just the `src/test/unit/**` suite.                                                                |
| `bun run test:static`                            | Just the static `deleted_at` query scan.                                                          |
| `bun run test:e2e`                               | **Strict** Playwright run. Fails with a clear message if env vars are missing.                    |
| `bun run test:e2e:ui`                            | Same, in Playwright's interactive UI.                                                             |
| `bash scripts/run-e2e.sh --skip-if-unconfigured` | Playwright run that **exits 0 with a note** when env vars are missing. Used by `test:all` and CI. |
| `bun run test:all`                               | Typecheck + Vitest + safe E2E. The canonical CI entrypoint.                                       |

If `bun run test:e2e` is called without env, it prints which vars are
missing and exits with status `1`. The `--skip-if-unconfigured` form is
the one to wire into CI workflows that don't always have credentials.

---

## CI wiring example

```yaml
- name: Tests
  env:
    E2E_BASE_URL: ${{ secrets.E2E_BASE_URL }}
    E2E_OWNER_EMAIL: ${{ secrets.E2E_OWNER_EMAIL }}
    E2E_OWNER_PASSWORD: ${{ secrets.E2E_OWNER_PASSWORD }}
    E2E_USER_EMAIL: ${{ secrets.E2E_USER_EMAIL }}
    E2E_USER_PASSWORD: ${{ secrets.E2E_USER_PASSWORD }}
    SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
    E2E_COMPANY_ID: ${{ secrets.E2E_COMPANY_ID }}
  run: bun run test:all
```

`test:all` automatically skips Playwright on PRs from forks (where
secrets aren't exposed) and runs it on protected branches.

---

## Layout

```
e2e/
  fixtures/    # global setup + seed/cleanup + storage-state auth
  helpers/     # toast / recycle-bin / audit / balance helpers
  specs/       # one spec per module + cross-cutting suites
scripts/
  run-e2e.sh   # CI-friendly wrapper (strict by default, --skip-if-unconfigured)
```

Each module spec follows the same 4-test template:

1. delete shows undo toast, removes from list, appears in recycle bin, audits `deleted`
2. undo toast restores record, no duplicate balance/stock posting, audits `restored`
3. recycle-bin restore returns record, double-click is idempotent
4. blocked restore surfaces clear message + audits `blocked_restore` (where applicable)

Cross-cutting:

- `permissions.spec.ts` — owner can access `/app/recycle-bin`; normal user cannot.
- `permanent-delete.spec.ts` — strong dialog, audit preserved, blocked for non-admins.
- `reports-after-restore.spec.ts` — totals drop on delete, return on restore, stay dropped after permanent delete.
