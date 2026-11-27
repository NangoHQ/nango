# Scripts

Maintenance and developer scripts for the monorepo. Run them from the **repo root** via the npm aliases below — each wraps `tsx scripts/<name>.ts`. Scripts run through `tsx` and are not part of the TypeScript build (`tsconfig.build.json`); they resolve workspace packages (`@nangohq/*`) via npm-workspace hoisting.

## Index

| Command | Script | Purpose |
| --- | --- | --- |
| `npm run seed:clickhouse` | `seed-clickhouse.ts` | Seed local ClickHouse with synthetic usage data for the billing/usage dashboard |
| `npm run seed:logs` | `seed-logs.ts` | Seed local Elasticsearch with synthetic operations and log lines for the Logs page, or run a live feed |
| `npm run docs:generate` | `docs-gen-snippets.ts`, `docs-generate-llms.ts` | Regenerate doc snippets and `llms.txt` |
| `npm run changelog:providers` | `provider-changelog.ts` | Generate the provider changelog |
| `npm run changelog:integrations` | `pre-built-integrations-changelog.ts` | Generate the pre-built-integrations changelog |
| `npm run update:providers:scopes:all` / `:new` | `validation/providers/sync-scopes.ts` | Sync OAuth2 provider scopes |
| `npm run test:providers` | `validation/providers/validate.ts` | Validate `providers.yaml` |
| `npm run internal-auth:key` | `generate-internal-auth-key.ts` | Print an Ed25519 key id, private key, and public-key list for jobs or server |

One-off migrations live under `scripts/one-off/`, each with its own README.

## `seed:logs` — local Logs page data

Fills the local logs with operations and log lines shaped like production traffic, so the Logs page can be tested against realistic volume. Only the shape comes from production (7-day aggregates of type, action, state, duration, lines per operation, line type and level); every value is generated.

```bash
npm run seed:logs                          # remove seeded docs, backfill 3 days at medium (~2 min)
npm run seed:logs -- --days 7 --level high # longer window, more traffic
npm run seed:logs -- --no-reset            # append instead of removing earlier seeded docs
npm run seed:logs -- --dry-run             # generate without writing, print the mix
npm run seed:logs -- --live --level low    # keep adding operations until Ctrl+C
npm run seed:logs -- --account 3 --env dev # another account or a single environment
```

**Traffic levels** are the busiest environment's rate; other environments get a ninth of it, like dev next to prod:

| Level | Operations | Source |
| --- | --- | --- |
| `low` | ~1 every 16s | p90 production environment |
| `medium` | ~1 every 2s | 10× low |
| `high` | ~2 per second | p99 production environment |

The backfill follows EU business hours (peak 08:00–18:00 Europe/Prague, nights at ~15%, weekends at 40%), averaging out to the level's rate over a week. Live mode runs at the flat rate. Each live operation starts as `running`, writes its lines as it goes and ends in its final state, with durations capped at 60s; Ctrl+C marks the ones still running as `cancelled`.

Seeded operation IDs start with `seed_`, which is what the reset deletes by, so real local operations survive it. The reset removes seeded data from every account and environment, not only the ones `--account` and `--env` select. Integrations and connections are fake (20 integrations, hundreds of connection UUIDs), so links from an operation to its connection lead nowhere.

**Prerequisites** — Elasticsearch running (`npm run dev:docker`), and to see the data in the webapp, in your root `.env`:

```bash
NANGO_LOGS_ENABLED=true
NANGO_LOGS_ES_URL=http://localhost:9500
```

It targets the `test@nango.dev` account by default and refuses a non-local `NANGO_LOGS_ES_URL` unless you pass `--allow-remote`. Elasticsearch is a shared Docker container, so seeded logs show up in every worktree.

## `seed:clickhouse` — local usage/billing data

Populates the local ClickHouse `usage` database with synthetic usage events so the **Billing & usage** dashboard renders real-looking data locally — no deployed backend and no ingestion pipeline (metering/ActiveMQ) needed. See the header of [`seed-clickhouse.ts`](./seed-clickhouse.ts) for what it writes and how the materialized views aggregate it.

```bash
npm run seed:clickhouse                          # reset + seed the last 60 days
npm run seed:clickhouse -- --account 3 --days 90 # target one account, longer window
npm run seed:clickhouse -- --no-reset            # append instead of dropping the DB first
npm run seed:clickhouse -- --verbose             # per-env progress + summary
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

Events span every usage metric (proxy, function executions/logs/compute, webhook forwards, records, connections, data transfer) and every breakdown dimension, across the seeded window (60 days by default). Mix mirrors reality: dev has ~10% as many connections as prod, so prod carries ~90% of traffic across every metric; connections grow ~10–20% over the window; flow metrics (runs, records, proxy, function time) dip on weekends, climb gradually through the month, and wobble day to day; and proxy/webhook/function runs include failures, with the function failure rate fluctuating day to day (mostly healthy, occasional spikes up to ~20%) rather than a flat rate.
