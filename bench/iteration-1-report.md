# NAN-5390 — ClickHouse metering read queries: iteration 1

**Date:** 2026-04-30
**Scope:** Validate whether ClickHouse read query performance is acceptable to power the billing usage page (`/plans/billing-usage`) in two modes: (1) drop-in replacement for the current Orb-backed query, and (2) the new "per-connection" breakdown that Orb cannot provide.

**TL;DR:** The new per-connection-breakdown dashboard is sub-500 ms wall time for 99%+ of customers. One outlier customer (account 3660) hits ~1.2 s in the worst-case combo. The most obvious code-level mitigation (coalescing the 3 function metrics into one query) was tested and does not help.

---

## Test setup

**Window:** 14 days, `2026-04-16` → `2026-04-30`. ClickHouse ingestion only began on 2026-04-15 for most aggregation tables, and on 2026-04-28 for `daily_records` and `daily_connections`. A full 30-day re-run should be repeated once ingestion catches up (~mid-May).

**Top-N:** 25 connections + an "rest" bucket (the dashboard's planned breakdown shape).

**Repeats:** Each scenario run 3 times; first run is cold-cache, 2nd & 3rd warm. Reported numbers are the average; min/max in the detailed JSON.

**Wall-time only:** Server-side metrics (`read_rows`, `memory_usage`, threads) from `system.query_log` were not collected — ClickHouse Cloud's per-node `query_log` plus the load-balanced HTTP endpoint means we'd need `GRANT REMOTE ON *.* …` to read across replicas, which we deemed unnecessary for this iteration. Wall time includes ~200 ms of local-Mac → us-west-2 round-trip.

### Picked test accounts

We use **ClickHouse-side cardinality** (distinct `connection_id`s emitting events in the window) as the bucketing axis, not Postgres connection counts. Postgres counts the universe of active connections, but the dashboard query only sees connections that emitted at least one event — typically a much smaller subset.

We did cross-check this: `daily_connections` (the ClickHouse gauge of active connections) agrees with Postgres `_nango_connections.deleted=false` to within 0.1% across all picked accounts. So the two systems agree on totals; they just measure different things when you ask "how many distinct connections are in this query?".

| Bucket | Account | ClickHouse distinct conns (last 30d) | Dominant table |
|---|---|---|---|
| small | 6519 | 25 | `daily_function_executions` |
| medium | 1372 | 253 | `daily_function_executions` |
| large | 4327 | 1,708 | `daily_function_executions` (active across all 7 metric tables) |
| doomsday-fn | 3660 | 15,819 | `daily_function_executions` (2.24M source rows) |
| doomsday-px | 2976 | 82,397 | `daily_proxy` (proxy-only customer) |

For context only, here is the Postgres-side distribution we used to identify candidates: 6,022 of ~16k accounts have ≥1 active connection; percentiles p50=2, p90=11, p95=44, p99=403, max=663,333. The single max-conn account (2976) turns out to be a proxy-only customer in ClickHouse, which is why it lands in `doomsday-px`. The function-heavy doomsday (3660) was 5th in Postgres but #1 in ClickHouse function-table cardinality.

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

1. **For all but one account, the worst case (D) is under 500 ms.** That includes the 663k-Postgres-connection outlier 2976 — its dashboard with full per-connection breakdown is 340 ms.

2. **Fan-out is essentially free** for normal accounts. Compare A → C: 1.0–1.17×. ClickHouse handles 7 concurrent queries from one client without contention — except in the doomsday-fn case below.

3. **The breakdown adds 20–50% on top of simple aggregation** for normal accounts (B/A ratio). Whether this overhead is acceptable for the dashboard SLO is TBD — depends on the latency target we set for the page.

4. **Counter cardinality is not the bottleneck.** Going from 25 distinct connections (small) to 82,397 distinct connections (doomsday-px) only adds ~50–150 ms in the worst column. What matters is total source-row count, not distinct-key count. The sort-key prefix `(account_id, day, environment_id, integration_id, connection_id, …)` does its job.

5. **One outlier crosses 1 s: doomsday-fn (account 3660) with fan-out + breakdown reaches 1.24 s.** This account has 2.24M rows in `daily_function_executions` (10× the next biggest customer), and the fan-out runs the full top-N+rest pattern across all 7 metrics. The single-query breakdown for the same account is 581 ms, so the fan-out adds 2.13×.

---

## Sub-investigation: does coalescing the 3 function metrics help?

The first hypothesis for the doomsday-fn slowness was that `function_executions`, `function_logs`, and `function_compute_gbms` all live in `daily_function_executions`, so the fan-out fires 3 separate top-N+rest queries against the same table — and we expected this to contend. We tested 3 strategies on the same accounts:

- **A_coalesce** — today's shape: 3 independent top-N+rest queries running in parallel (subset of the fan-out, filtered to function metrics only).
- **B_coalesce** — 1 raw query returning per-(day, connection_id) rows with all 3 SUMs; client does the top-25 bucketing per metric.
- **C_coalesce** — 1 server-side coalesced query: per-conn CTE shared across 3 top-25 picks, results emitted as a UNION ALL labelled by metric.

| bucket | A_coalesce: 3 parallel | B_coalesce: raw + client | C_coalesce: server coalesced |
|---|---|---|---|
| small | 460 | 219 | 285 |
| medium | 249 | 339 | 258 |
| large | 314 | 1,911 | 361 |
| **doomsday-fn** | **935** | **8,675** | **1,412** |
| doomsday-px | 638 | 265 | 336 |

**Conclusion:** the coalescing hypothesis is falsified.

- **B_coalesce** (ship raw rows) collapses for any account with significant function data — for doomsday-fn it ships ~220k rows over the network and takes 8.7 s. The network/serialization cost dwarfs any server-side savings.
- **C_coalesce** (single server-side query) is *slower* than the 3-parallel approach for the doomsday-fn case (1.4 s vs 935 ms). ClickHouse Cloud's per-query parallelism evidently handles 3 independent same-table top-N queries better than a unified pipeline that nominally scans the table once. Per-query overhead is small enough that the parallel execution wins.

So the doomsday-fn slowness is **not query-shape contention**. It's the inherent cost of running top-N+rest on a 2.24M-row partition. There's no obvious code-level rewrite that fixes it; the directions that might (schema sharding by environment, materialized views with pre-rolled top-N, or reducing result granularity) are larger pieces of work that need their own design.

---

## Headline conclusion

**Top-N+rest by `connection_id` is feasible for the dashboard.** The query pattern handles a 3,000× cardinality range (25 → 82k distinct connections) in well under a second. For 99%+ of customers, the new per-connection-breakdown dashboard runs sub-500 ms.

The one exception (account 3660 at 1.24 s in fan-out + breakdown) is genuine query cost on a 2.24M-row partition, not a query-shape artefact we can rewrite away. Whether 1.2 s for one outlier customer is acceptable — and what target we set for the dashboard's p95 latency — is a product call.

---

## Follow-ups (open questions, not recommendations)

These need to be answered before NAN-5390 can be declared resolved or before we can commit to migrating the dashboard.

1. **Compare like-for-like vs Orb.** Iteration 1 says "ClickHouse can do this in X ms"; we don't yet have a corresponding measurement for the current Orb path. Without that, we can't say whether the migration is a perf improvement, neutral, or regression. Worth running the same accounts through `/plans/billing-usage` today and capturing the latency distribution.

2. **Concurrency + cluster scaling.** Iteration 1 measured 7 parallel queries from one client (one user loading the page). What happens with N concurrent users? At what point does the cluster start queueing — and how does that point move as we scale ClickHouse Cloud horizontally? Especially relevant for the doomsday-fn case where one fan-out is already heavy.

3. **30-day window.** Ingestion is currently 14 days deep at most. The dashboard's natural window is a calendar month, and longer windows scan more partitions. Re-run after ~2026-05-15 (most tables) / ~2026-05-28 (records, connections).

4. **ClickHouse for inline capping.** The capping refresh path (today: Orb + Redis) is a different access pattern from the dashboard — fewer dimensions, but on the request hot path with stricter latency and higher QPS. Iteration 1 didn't model this. Need to validate that ClickHouse can serve "is this account over its limit?" inline without becoming a new bottleneck for proxy/connection-creation requests.

5. **Server-side metrics (`query_log`).** Iteration 1 is wall-time only. Once we want to optimise specific queries or model cluster capacity, we'll need `read_rows`, `memory_usage`, and thread parallelism per query. Requires `GRANT REMOTE ON *.* …` to read `clusterAllReplicas('default', system.query_log)`.

6. **Open product/architecture questions.** Separately: does the left-column summary (`/plans/usage`) move to ClickHouse too, or stay on Orb? What latency target are we committing to for the page? How are billing-period boundaries reproduced if the summary leaves Orb? These are not bench questions but they shape what "done" looks like.

---

## Reproducing

All bench code under `bench/` on branch `pfreixes/nan-5390-validate-clickhouse-performance`. Reads ClickHouse credentials from `~/nango/clickhouse_perf/.env` (containing `HOST`, `USER`, `PASSWORD`).

```
node bench/smoke.mjs              # connectivity + sanity check
node bench/diagnose.mjs           # ingestion window + per-account row counts
node bench/probe-test-set.mjs     # cardinality probes for picking test accounts
node bench/topn-rest.mjs          # top-N+rest per-account, 14-day window
node bench/iteration-1.mjs        # 4-use-case matrix (this report's main table)
node bench/coalesce-test.mjs      # the coalescing sub-investigation
```

Detailed JSON output in `bench/results/` (gitignored).
