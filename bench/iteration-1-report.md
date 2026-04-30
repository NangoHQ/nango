# NAN-5390 — ClickHouse metering read queries: iteration 1

**Date:** 2026-04-30
**Scope:** Validate whether ClickHouse read query performance is acceptable to power the billing usage page (`/plans/billing-usage`) in two modes: (1) drop-in replacement for the current Orb-backed query, and (2) the new "per-connection" breakdown that Orb cannot provide.

**TL;DR:** The new per-connection-breakdown dashboard is sub-500ms for 99%+ of customers. One outlier customer (account 3660) hits 1.2s in the worst-case combo — root-caused to three dashboard metrics sharing the same ClickHouse table; mitigatable in code without a schema change.

---

## Test setup

**Window:** 14 days, `2026-04-16` → `2026-04-30`. ClickHouse ingestion only began on 2026-04-15 for most aggregation tables, and on 2026-04-28 for `daily_records` and `daily_connections`. A full 30-day re-run should be repeated once ingestion catches up (~mid-May).

**Top-N:** 25 connections + an "rest" bucket (the dashboard's planned breakdown shape).

**Repeats:** Each scenario run 3 times; first run is cold-cache, 2nd & 3rd warm. Reported numbers are the average; min/max in the detailed JSON.

**Wall-time only:** Server-side metrics (`read_rows`, `memory_usage`, threads) from `system.query_log` were not collected — ClickHouse Cloud's per-node `query_log` plus the load-balanced HTTP endpoint means we'd need `GRANT REMOTE ON *.* …` to read across replicas, which we deemed unnecessary for this iteration. Wall time includes ~200ms of local-Mac → us-west-2 round-trip.

### Picked test accounts

Selected after Postgres-distribution analysis and a ClickHouse cross-check. Distribution percentiles in Postgres: p50=2 connections, p90=11, p95=44, p99=403, max=663,333 (one extreme outlier). 6,022 of ~16k accounts have at least one active connection.

| Bucket | Account | Postgres conns | ClickHouse distinct conns (30d) | Dominant table |
|---|---|---|---|---|
| small | 6519 | 76 | 25 | `daily_function_executions` |
| medium | 1372 | (n/a*) | 253 | `daily_function_executions` |
| large | 4327 | 1,993 | 1,708 | `daily_function_executions` (active across all 7 metric tables) |
| doomsday-fn | 3660 | 16,338 | 15,819 | `daily_function_executions` (2.24M source rows) |
| doomsday-px | 2976 | 663,333 | 82,397 | `daily_proxy` (proxy-only customer) |

\* 1372 was picked from a ClickHouse-side cardinality probe rather than the Postgres top-20.

### Postgres ↔ ClickHouse cross-check

Total active connections (`_nango_connections.deleted=false`) agree with the `daily_connections` ClickHouse gauge to within 0.1% across all picked accounts. The earlier "discrepancy" between Postgres connection count and ClickHouse `uniq(connection_id)` in event tables was a category confusion: total connections ≠ connections that emitted events in the window. Both numbers are correct; they measure different things. This means **top-N+rest cardinality is bounded by event-emitting connections, not total connections** — typically a much smaller number.

---

## The four use cases

Two axes:

- **Single query** vs **fan-out** — one metric vs all 7 dashboard metrics in parallel (mirrors what the future `getUsage()` would do via `Promise.allSettled`)
- **No breakdown** (drop-in for what Orb returns today) vs **with breakdown** (top-25 connections + rest, the new capability)

| | single query | fan-out (7 in parallel) |
|---|---|---|
| **no breakdown** | A | C |
| **with breakdown** | B | D |

---

## Results — wall time, ms (avg of 3 runs)

| Bucket | Account | A: single, no breakdown | B: single, breakdown | C: fan-out, no breakdown | D: fan-out, breakdown |
|---|---|---|---|---|---|
| small | 6519 | 406 | 313 | 451 | 243 |
| medium | 1372 | 217 | 323 | 253 | 262 |
| large | 4327 | 236 | 286 | 235 | 278 |
| **doomsday-fn** | **3660** | **259** | **581** | **424** | **1236** |
| doomsday-px | 2976 | 227 | 348 | 258 | 340 |

### Observations

1. **For all but one account, the worst case (D) is under 500ms.** That includes the 663k-Postgres-connection outlier 2976 — its dashboard with full per-connection breakdown is 340ms.

2. **Fan-out is essentially free.** Compare A → C: 1.0–1.17× for normal accounts. ClickHouse handles 7 concurrent queries from one client without contention — except in one specific case (below).

3. **The breakdown adds 20–50% on top of simple aggregation** for normal accounts (B/A ratio). Acceptable.

4. **One concerning case: doomsday-fn (account 3660) with fan-out + breakdown reaches 1.24s.** Cause is structural:
   - Account 3660 has 2.24M rows in `daily_function_executions` — 10× the next biggest customer.
   - Three of the seven dashboard metrics — `function_executions`, `function_logs`, `function_compute_gbms` — all read from `daily_function_executions`.
   - With breakdown enabled, each runs an independent top-N+rest with a heavy subquery, so we fire **three concurrent heavy queries against the same hot table**.
   - Single-breakdown for the same account is 581ms; fan-out makes it 2.13× worse.

5. **Counter cardinality is not the bottleneck.** Going from 25 distinct connections (small) to 82,397 distinct connections (doomsday-px) only adds ~50–150ms in the worst column. What matters is total source-row count, not distinct-key count. The sort-key prefix `(account_id, day, environment_id, integration_id, connection_id, …)` does its job.

---

## Headline conclusion

**Top-N+rest by `connection_id` is feasible for the dashboard.** The query pattern handles a 3,000× cardinality range (25 → 82k distinct connections) in well under a second. For 99%+ of customers, the new per-connection-breakdown dashboard runs sub-500ms.

The one exception (account 3660 at 1.24s in fan-out + breakdown) is a structural artefact of three metrics sharing one ClickHouse table — addressable in code without changing the schema.

---

## Recommended follow-ups

1. **Coalesce the three function metrics into a single multi-SUM query.** `function_executions` (count), `function_logs` (`SUM(custom_logs)`), and `function_compute_gbms` (`SUM(compute_gbms)`) all read the same partition of `daily_function_executions`. Merging them into one SELECT — possibly with `SUM(if(connection_id IN top_25, X, 0))` style — would turn the 3 heavy subqueries into 1 and likely halve the doomsday-fn fan-out time. Code-only change in the future `getUsage()` generator.

2. **Multi-user concurrency test.** Iteration 1 measured 7 parallel queries from a single client (one user loading the page). What happens when 5/10/20 users hit the dashboard simultaneously? Especially for the doomsday-fn account, where one fan-out is already saturating a hot table.

3. **Re-run after 30+ days of ingestion** (target ~2026-05-15 onward for most tables, ~2026-05-28 for `daily_records` / `daily_connections`). The dashboard's natural window is a calendar month, and the iteration 1 results are scoped to a 14-day window for ingestion-coverage reasons.

4. **Server-side metrics** (`read_rows`, `memory_usage`, thread parallelism) once we want to optimise specific queries or model cluster capacity. Requires `GRANT REMOTE ON *.* …` to read `clusterAllReplicas('default', system.query_log)`.

---

## Open questions (parked, awaiting team input)

1. **Does the left-column summary (`/plans/usage`) move to ClickHouse too**, or stay on Orb? The decision shapes whether the bench needs to validate the "single number per metric" fold under sustained 10s polling load. (Today's iteration 1 only covered the per-day-series queries used by the chart page.)

2. **Acceptable cardinality and latency thresholds.** Iteration 1 numbers are good in absolute terms, but "good enough" depends on product expectations (target p95 latency for the dashboard, behavior under concurrency, etc.). Worth a short discussion with the product/billing team before declaring NAN-5390 done.

3. **Period boundaries when summary moves to ClickHouse.** If the left column is migrated, today's "Orb billing period" semantics need a replacement (calendar month-to-date? Cached period boundaries from Orb? On-demand call to Orb for the window?).

---

## Reproducing

All bench code under `bench/` on branch `pfreixes/nan-5390-validate-clickhouse-performance`. Reads ClickHouse credentials from `~/nango/clickhouse_perf/.env` (containing `HOST`, `USER`, `PASSWORD`).

```
node bench/smoke.mjs              # connectivity + sanity check
node bench/diagnose.mjs           # ingestion window + per-account row counts
node bench/probe-test-set.mjs     # cardinality probes for picking test accounts
node bench/topn-rest.mjs          # top-N+rest per-account, 14-day window
node bench/iteration-1.mjs        # 4-use-case matrix (this report's main table)
```

Detailed JSON output in `bench/results/` (gitignored).
