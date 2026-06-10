# ERPOVO

![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)

> Replace `OWNER/REPO` in the badge URL above with your actual GitHub
> organisation and repository name.

ERPOVO is a Vyapar-style ERP built on TanStack Start, React 19, Tailwind v4,
and Lovable Cloud (Supabase). The application UI, theme, navigation, and
subscription gating are considered stable — see `e2e/README.md` and the plan
files under `.lovable/` for module-level documentation.

## Getting started

```bash
bun install
bun run dev
```

The dev server runs on http://localhost:8080.

## Testing

| Command                 | What it does                                                             |
| ----------------------- | ------------------------------------------------------------------------ |
| `bun run typecheck`     | Strict TypeScript check (`tsc --noEmit`).                                |
| `bun run test:unit`     | Vitest unit suite (`src/test/unit`).                                     |
| `bun run test:static`   | Static guarantees (e.g. `deleted_at` filter coverage).                   |
| `bun run test:coverage` | Full Vitest run with v8 coverage report under `coverage/`.               |
| `bun run test:all`      | Typecheck + Vitest + Playwright (E2E auto-skips when env is missing).    |
| `bun run test:e2e`      | Playwright Restore E2E suite — requires the env vars in `e2e/README.md`. |
| `bun run test:e2e:ui`   | Interactive Playwright UI mode for debugging.                            |

E2E setup, required environment variables, CI behaviour, and debugging tips
live in [`e2e/README.md`](e2e/README.md).

## Code quality

| Command                 | What it does                                              |
| ----------------------- | --------------------------------------------------------- |
| `bun run lint`          | ESLint check (flat config, TS + react-hooks + prettier).  |
| `bun run lint:fix`      | Auto-fix lint and formatting issues where possible.       |
| `bun run format`        | Prettier write across the repo.                           |
| `bun run format:check`  | Prettier check — fails CI if anything is unformatted.     |
| `bun run test:coverage` | Vitest coverage report (v8) with safe initial thresholds. |

Coverage thresholds are intentionally conservative for the initial rollout
(see `vitest.config.ts`). Raise them as the unit/static suites grow.

## Local quality gates

Run any of these locally before pushing — CI mirrors the same checks:

| Command                 | When                                               |
| ----------------------- | -------------------------------------------------- |
| `bun run typecheck`     | Strict TypeScript (`tsc --noEmit`).                |
| `bun run lint`          | ESLint flat config.                                |
| `bun run lint:fix`      | Auto-fix lint + Prettier where possible.           |
| `bun run format`        | Format the whole repo with Prettier.               |
| `bun run format:check`  | Verify formatting — CI fails if anything is dirty. |
| `bun run test:unit`     | Vitest unit suite.                                 |
| `bun run test:static`   | Static guarantees (e.g. `deleted_at` filter).      |
| `bun run test:coverage` | Vitest + v8 coverage with thresholds.              |
| `bun run test:all`      | Typecheck + Vitest + safe Playwright wrapper.      |
| `bun run test:e2e`      | Full Playwright suite (requires `.env.e2e`).       |

### Git hooks (Husky + lint-staged)

After `bun install`, Husky wires two hooks via the `prepare` script:

- **pre-commit** — runs `lint-staged` only on the files you staged. Prettier
  rewrites them in place, then ESLint `--fix` runs. Fast and developer-friendly.
- **pre-push** — runs the stronger gate: `typecheck`, `lint`, `format:check`,
  `test:unit`, `test:static`, and `scripts/run-e2e.sh --skip-if-unconfigured`.
  The E2E wrapper safely skips when `.env.e2e` is not configured.

To fix formatting locally before commit: `bun run format`.
To bypass hooks for a one-off commit (not recommended): `git commit --no-verify`.

E2E always requires the values in `.env.e2e` (see `e2e/README.md`); without
them every E2E command/hook skips cleanly with a clear message. CI uploads
both `coverage/` and the Playwright report/test-results as artifacts.

## CI

GitHub Actions runs on every push and pull request:

- **verify** — install, typecheck, unit + static tests, coverage report, build.
  Coverage is uploaded as an artifact (`coverage`) but does not fail the build.
- **e2e** — optional Playwright job. Runs on `push` to `main` or
  `workflow_dispatch` when the required E2E secrets are configured. Always
  uploads `playwright-report/` and `test-results/` so failures can be
  inspected (videos, traces, screenshots).

Both jobs use Bun's dependency cache; the E2E job additionally caches the
Playwright browser binaries under `~/.cache/ms-playwright`.

## Stack

- TanStack Start v1 (React 19 + Vite 7)
- Tailwind CSS v4
- Lovable Cloud (Supabase: auth, database, storage)
- Playwright for E2E, Vitest for unit/static tests

## Publish checklist (Phase 10)

Final readiness checklist before promoting a build to demo/production.

### Environment variables

Auto-provisioned by Lovable Cloud (do not edit `.env` manually):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Server-only (available to TanStack server functions at runtime):

- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

### Backend / migrations

- All schema lives under `supabase/migrations/`.
- RLS, soft-delete, audit, role and subscription policies are enforced
  by migrations; no manual dashboard edits required.
- Re-running migrations is idempotent.

### Demo seed

- Demo owner: `admin@erpovo.com` / `12345678`.
- Use the **Demo Login** button on `/login` or call the seeder from
  `src/lib/demo/seedDemo.ts` — the seed is idempotent and safe to re-run.

### Commands

| Step       | Command                                          |
| ---------- | ------------------------------------------------ |
| Typecheck  | `bun run typecheck`                              |
| Lint       | `bun run lint`                                   |
| Format     | `bun run format:check`                           |
| Unit tests | `bun run test:unit`                              |
| Static     | `bun run test:static`                            |
| Coverage   | `bun run test:coverage`                          |
| All        | `bun run test:all`                               |
| Build      | `bun run build`                                  |
| E2E (opt.) | `bash scripts/run-e2e.sh --skip-if-unconfigured` |

### Deployment

- Frontend changes go live via **Publish → Update** in the Lovable editor.
- Server functions and migrations deploy automatically with the build.
- Stable URLs: `project--<id>.lovable.app` (prod) and
  `project--<id>-dev.lovable.app` (preview).

### Post-deploy smoke test

1. Open the published URL → landing renders, no console errors.
2. Log in with the demo account → redirects to `/companies`.
3. Pick a company → dashboard loads with seeded numbers.
4. Create a Sales invoice → appears in list and Day Book.
5. Open Reports → P&L, Balance Sheet, Trial Balance reconcile.
6. Export a report to PDF and CSV → downloads succeed.
7. Open Recycle Bin → soft-deleted items listed and restorable.
8. Visit `/app/admin/security-tests` as the admin → checks pass.

### Known optional limitations

- Premium modules (Payroll/Employees/Attendance) require Gold/Pro plan.
- Device limit is enforced per subscription tier.
- E2E suite requires `.env.e2e` to be configured (see `e2e/README.md`).
