# Backfill daily function executions v2

Backfills `usage.daily_function_executions_v2` after Stage A. It is deliberately a one-off script rather than a ClickHouse migration.

## Prerequisites

- Stage A has deployed and the v2 MV has been live for at least one full UTC day.
- `CLICKHOUSE_URL` points to the target ClickHouse instance. The script accepts only a local host by default; production runs must explicitly pass `--allow-remote`.
- Run after 01:00 UTC so the previous day is closed.

## Run

Install this directory's dependency, then build and dry-run first:

```sh
npm install
npm run dry-run -- --deployed-on YYYY-MM-DD --allow-remote
```

Run the backfill only after reviewing the emitted SQL:

```sh
npm run run -- --deployed-on YYYY-MM-DD --allow-remote
```

Use `--from YYYY-MM-DD` and `--to YYYY-MM-DD` to resume a bounded range. The script processes days oldest to newest and is idempotent: each day is deleted with `mutations_sync = 2` before its replacement aggregate is inserted.

Days before the current `raw_events` floor are copied from v1 with `duration_seconds = 0` and `compute_gbs = 0`; exact per-execution values are unrecoverable after raw-event TTL. Days at or after the raw floor are recomputed from `raw_events FINAL`.
