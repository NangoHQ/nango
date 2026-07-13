# Scripts

Maintenance and developer scripts for the monorepo. Run them from the **repo root** via the npm aliases below — each wraps `tsx scripts/<name>.ts`. Scripts run through `tsx` and are not part of the TypeScript build (`tsconfig.build.json`); they resolve workspace packages (`@nangohq/*`) via npm-workspace hoisting.

## Index

| Command | Script | Purpose |
| --- | --- | --- |
| `npm run seed:clickhouse` | `seed-clickhouse.ts` | Seed local ClickHouse with synthetic usage data for the billing/usage dashboard |
| `npm run docs:generate` | `docs-gen-snippets.ts`, `docs-generate-llms.ts` | Regenerate doc snippets and `llms.txt` |
| `npm run changelog:providers` | `provider-changelog.ts` | Generate the provider changelog |
| `npm run changelog:integrations` | `pre-built-integrations-changelog.ts` | Generate the pre-built-integrations changelog |
| `npm run update:providers:scopes:all` / `:new` | `validation/providers/sync-scopes.ts` | Sync OAuth2 provider scopes |
| `npm run test:providers` | `validation/providers/validate.ts` | Validate `providers.yaml` |

One-off migrations live under `scripts/one-off/`, each with its own README.

## `seed:clickhouse` — local usage/billing data

Populates the local ClickHouse `usage` database with synthetic usage events so the **Billing & usage** dashboard renders real-looking data locally — no deployed backend and no ingestion pipeline (metering/ActiveMQ) needed. See the header of [`seed-clickhouse.ts`](./seed-clickhouse.ts) for what it writes and how the materialized views aggregate it.

```bash
npm run seed:clickhouse                          # reset + seed the last 60 days
npm run seed:clickhouse -- --account 3 --days 90 # target one account, longer window
npm run seed:clickhouse -- --no-reset            # append instead of dropping the DB first
```

By default it seeds the local accounts that have more than one environment (the real orgs, e.g. `Nango's Team`), skipping the throwaway fixture accounts.

**Prerequisites** — ClickHouse running (`npm run dev:docker`) and, to view the data in the dashboard, these in your root `.env`:

```bash
CLICKHOUSE_URL=http://default:@localhost:8123
FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_PERCENTAGE=100   # route all local accounts' reads to ClickHouse
FLAG_ALLOW_OVERRIDE_GETUSAGE_SERVICE=true              # allow ?source=clickhouse|orb per request
FLAG_PLAN_ENABLED=true                                 # else the endpoint returns feature_disabled
FLAG_USAGE_ENABLED=true
NANGO_REDIS_URL=redis://localhost:6379                 # else the server uses a no-op usage tracker
```

The seed itself only needs `CLICKHOUSE_URL` and a Postgres connection; the flags above are what make the dashboard actually read and render the data. With no Orb configured, billing falls back to a no-op client automatically.

It drops and reseeds the `usage` database, so it refuses to run unless `CLICKHOUSE_URL` points at a local host (`localhost`/`127.0.0.1`). Pass `--allow-remote` to override.

**Shared across worktrees** — ClickHouse runs in the shared `clickhouse` Docker container, so every worktree reads the same `usage` database. Seed once from any worktree and the data is visible everywhere; there's no need to re-seed per worktree.

### Test data shape

The dataset is sized to exercise the breakdown filter combobox:

- **20 integrations** with overlapping names (`github`/`gitlab`, `google-calendar`/`google-drive`/`gmail`, …) for partial-string **integration search**.
- **Hundreds of connection UUIDs in prod** (dev holds ~10% as many), skewed like production (a few integrations have 60–150 connections, most have a handful) — far beyond the top-N breakdown cap (25) — for **connection pagination**. Connection ids are UUIDs, matching production.

Events span every usage metric (proxy, function executions/logs/compute, webhook forwards, records, connections, data transfer) and every breakdown dimension, across 60 days. Mix mirrors reality: dev has ~10% as many connections as prod, so prod carries ~90% of traffic across every metric; the Connections/Sync-records metrics reflect the real connection counts; and proxy/webhook/function runs include failures, with the function failure rate fluctuating day to day (mostly healthy, occasional spikes up to ~20%) rather than a flat rate.
