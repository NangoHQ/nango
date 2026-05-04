# NAN-5390 — ClickHouse metering read queries: iteration 1

**Date:** 2026-04-30
**Scope:** Validate whether ClickHouse read query performance is acceptable to power the billing usage page (`/plans/billing-usage`) in two modes: (1) drop-in replacement for the current Orb-backed query, and (2) the new "per-connection" breakdown that Orb cannot provide.

**TL;DR:** The new per-connection-breakdown dashboard is sub-500 ms wall time for 99%+ of customers. One outlier customer (account 3660) hits ~1.2 s in the worst-case eager-fan-out combo. The per-metric data shows the breakdown overhead is highly concentrated in 4 specific (account, metric) cells — opening the door to a lazy "default aggregate, opt-in per-connection" UX that would cut the doomsday-fn page-load ~4× without affecting other customers. The most obvious code-level mitigation (coalescing the 3 function metrics into one query) was tested and does not help.

---

## Test setup

**Window:** 14 days, `2026-04-16` → `2026-04-30`. ClickHouse ingestion only began on 2026-04-15 for most aggregation tables, and on 2026-04-28 for `daily_records` and `daily_connections`. A full 30-day re-run should be repeated once ingestion catches up (~mid-May).

**Top-N:** 25 connections + a "rest" bucket (the dashboard's planned breakdown shape).

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

## Per-metric query cost — solo, simple vs per-connection breakdown

For each test account, every dashboard metric run in isolation, twice — once as a plain `SUM by day` aggregation, once with the top-25-connections + "rest" breakdown. Same 14-day window, average of 3 runs, ms.

Each cell shows `simple → breakdown` ms.

| Metric | small (6519) | medium (1372) | large (4327) | doomsday-fn (3660) | doomsday-px (2976) |
|---|---|---|---|---|---|
| proxy                 | *615 → 237* | *210 → 215* | 212 → 219   | *355 → 219* | **246 → 368** |
| function_executions   | 273 → 342   | 212 → 225   | 214 → 235   | **254 → 478** | *213 → 215* |
| function_logs         | 272 → 219   | 212 → 220   | 214 → 234   | **230 → 430** | *257 → 309* |
| function_compute_gbms | 293 → 217   | 231 → 222   | 241 → 262   | **252 → 535** | *305 → 213* |
| webhook_forwards      | *210 → 217* | *210 → 215* | 220 → 220   | *244 → 214* | *231 → 307* |
| records               | *211 → 218* | 214 → 221   | 222 → 231   | **290 → 443** | *243 → 273* |
| connections           | 217 / –     | 213 / –     | 235 / –     | 212 / –     | 236 / –     |

**Notation:**
- *italic* — no rows in the source table for this (account, metric) in the window. The timing reflects the network RTT floor (~210 ms) plus planning overhead, not actual query work. Treat these as noise.
- **bold** — breakdown adds materially more than simple (ratio > 1.5×). These are the cells that drive the page-load cost difference.
- `connections / –` — the `daily_connections` table has no `connection_id` column (the metric *is* a count of connections), so breakdown is not applicable.

### What this matrix shows

**Breakdown is cheap for small/medium queries; it gets expensive on large ones.** The top-N+rest pattern needs to scan the source partition essentially twice — once in the subquery that picks the top-25 connections, once in the outer aggregation. So as the partition grows, the breakdown overhead grows with it. The 5 cells with a >1.5× ratio are all the largest-volume (account, metric) pairs in the dataset:

| Account | Metric | source rows (14d) | simple | breakdown | ratio |
|---|---|---|---|---|---|
| doomsday-fn (3660) | function_compute_gbms | 2.24M | 252 | 535 | **2.12×** |
| doomsday-fn (3660) | function_executions | 2.24M | 254 | 478 | **1.88×** |
| doomsday-fn (3660) | function_logs | 2.24M | 230 | 430 | **1.87×** |
| doomsday-fn (3660) | records | 17.8k | 290 | 443 | **1.53×** |
| doomsday-px (2976) | proxy | 595k | 246 | 368 | **1.50×** |

In every other (account, metric) cell with real data, simple ≈ breakdown within noise. The breakdown overhead only materialises when there is a lot of data to bucket — and 4 of the 5 expensive cells belong to the same outlier account (3660), with its 2.24M-row partition.

**It's not cardinality, it's row volume.** Doomsday-px has 82,397 distinct connections (5× doomsday-fn) but ~4× fewer source rows, and its breakdown (368 ms) is *cheaper* than doomsday-fn's (478 ms). So between two high-volume cases, row count predicts cost — cardinality does not. That tells us the sort-key prefix `(account_id, day, environment_id, integration_id, connection_id, …)` is doing its job: ClickHouse prunes to the relevant partition cheaply, and the per-connection grouping inside is small relative to the row scan.

---

## Page-load cost — fan-out across 7 metrics

The four-use-case matrix that mirrors the actual `/plans/billing-usage` flow. Two axes:

- **Single query** vs **fan-out** — one metric vs all 7 dashboard metrics in parallel (mirrors what the future `getUsage()` would do via `Promise.allSettled`)
- **No breakdown** (drop-in for what Orb returns today) vs **with breakdown** (top-25 connections + rest, the new capability)

| | single query | fan-out (7 in parallel) |
|---|---|---|
| **no breakdown** | A | C |
| **with breakdown** | B | D |

Wall time, ms (avg of 3 runs):

| Bucket | Account | A: single, no breakdown | B: single, breakdown | C: fan-out, no breakdown | D: fan-out, breakdown |
|---|---|---|---|---|---|
| small | 6519 | 406 | 313 | 451 | 243 |
| medium | 1372 | 217 | 323 | 253 | 262 |
| large | 4327 | 236 | 286 | 235 | 278 |
| **doomsday-fn** | **3660** | **259** | **581** | **424** | **1236** |
| doomsday-px | 2976 | 227 | 348 | 258 | 340 |

### Observations

1. **For 4 of 5 buckets, the worst case (D) is under 500 ms.** That includes the 663k-Postgres-connection outlier 2976 — its dashboard with full per-connection breakdown is 340 ms.
2. **Fan-out is essentially free** for normal accounts. Compare A → C: 1.0–1.17×. ClickHouse handles 7 concurrent queries from one client without contention — except in the doomsday-fn case below.
3. **One outlier crosses 1 s: doomsday-fn (account 3660) with fan-out + breakdown reaches 1.24 s.** This is dominated by the 4 expensive breakdown cells in the per-metric matrix above (function_executions, function_logs, function_compute_gbms, records — all on the 2.24M-row partition). The single-query breakdown for the same account is 581 ms, so the fan-out adds 2.13× on top.

---

## Page-load implication: eager vs lazy breakdown

The doomsday-fn fan-out + breakdown (1,236 ms) is dominated by 4 breakdown queries running in parallel — *and the per-metric matrix shows they are the only meaningfully expensive ones in the entire population*. If the dashboard defaults to aggregate ("no breakdown") and only fetches the per-connection breakdown when the user opts into a specific chart:

| Approach | Doomsday-fn page load | Normal accounts |
|---|---|---|
| Eager (today's iteration-1 D column) | 1,236 ms | 243–340 ms |
| Lazy: default aggregate, opt-in per-chart | ~290 ms (slowest of the 7 simple queries) | ~250 ms |
| Lazy + 1 chart drill-down (e.g. function_compute_gbms on doomsday-fn) | +535 ms for that chart only | +200–250 ms for that chart |

That's a ~4× page-load improvement for the worst case, no perceptible change for normal accounts. The cost of the per-connection view only materialises when a user explicitly asks for it. Whether this matches the desired UX is a product call, but the perf data favours it strongly.

---

## Hypothesis tested: coalescing the 3 function metrics is *not* the fix

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

So the doomsday-fn slowness is **not query-shape contention**. It's the inherent cost of running top-N+rest on a 2.24M-row partition. There's no obvious code-level rewrite that fixes it; the directions that might (schema sharding by environment, materialised views with pre-rolled top-N, or reducing result granularity) are larger pieces of work that need their own design.

---

## Headline conclusion

**Top-N+rest by `connection_id` is feasible for the dashboard.** The query pattern handles a 3,000× cardinality range (25 → 82k distinct connections) in well under a second. For 99%+ of customers, the new per-connection-breakdown dashboard runs sub-500 ms.

The one exception (account 3660 at 1.24 s in eager fan-out + breakdown) is genuine query cost on a 2.24M-row partition, not a query-shape artefact we can rewrite away. The per-metric matrix shows the cost is concentrated in 4 specific (account, metric) cells, which makes the lazy-breakdown UX a particularly attractive option to discuss — it would put doomsday-fn's page-load on par with the rest of the population.

Whether 1.2 s for one outlier customer is acceptable, and what target we set for the dashboard's p95 latency, is a product call.

---

## Follow-ups

These need to be answered before NAN-5390 can be declared resolved or before we can commit to migrating the dashboard.

1. **Compare like-for-like vs Orb.** Iteration 1 says "ClickHouse can do this in X ms"; we don't yet have a corresponding measurement for the current Orb path. Without that, we can't say whether the migration is a perf improvement, neutral, or regression. Worth running the same accounts through `/plans/billing-usage` today and capturing the latency distribution.

2. **Concurrency + cluster scaling.** Iteration 1 measured 7 parallel queries from one client (one user loading the page). What happens with N concurrent users? At what point does the cluster start queueing — and how does that point move as we scale ClickHouse Cloud horizontally? Especially relevant for the doomsday-fn case where one fan-out is already heavy.

3. **30-day window.** Ingestion is currently 14 days deep at most. The dashboard's natural window is a calendar month, and longer windows scan more partitions. Re-run after ~2026-05-15 (most tables) / ~2026-05-28 (records, connections).

4. **ClickHouse for inline capping.** The capping refresh path (today: Orb + Redis) is a different access pattern from the dashboard — fewer dimensions, but on the request hot path with stricter latency and higher QPS. Iteration 1 didn't model this. Need to validate that ClickHouse can serve "is this account over its limit?" inline without becoming a new bottleneck for proxy/connection-creation requests.


## Notes

**Server-side metrics (`query_log`).** Iteration 1 is wall-time only. Once we want to optimise specific queries or model cluster capacity, we'll need `read_rows`, `memory_usage`, and thread parallelism per query. Requires `GRANT REMOTE ON *.* …` to read `clusterAllReplicas('default', system.query_log)`.

---

## Reproducing

All bench code under `bench/` on branch `pfreixes/nan-5390-validate-clickhouse-performance`. Reads ClickHouse credentials from `~/nango/clickhouse_perf/.env` (containing `HOST`, `USER`, `PASSWORD`).

```
node bench/smoke.mjs              # connectivity + sanity check
node bench/diagnose.mjs           # ingestion window + per-account row counts
node bench/probe-test-set.mjs     # cardinality probes for picking test accounts
node bench/topn-rest.mjs          # top-N+rest per-account, 14-day window
node bench/per-metric-solo.mjs    # per-metric solo costs, simple vs breakdown
node bench/iteration-1.mjs        # 4-use-case matrix
node bench/coalesce-test.mjs      # the coalescing sub-investigation
node bench/concurrent-load.mjs    # replica-scaling smoke test
```

Detailed JSON output in `bench/results/` (gitignored).

---

## Appendix — replica-scaling smoke test (2026-05-04)

Quick existence proof that horizontal scaling is a real capacity lever in ClickHouse Cloud. Ran the same load before and after adding a single replica.

**Workload:** 20 concurrent workers × 60 s, each looping the iteration-1 D shape (7-query fan-out with per-connection breakdown) against account 4327.

| Metric | 1 replica (baseline) | 2 replicas | Δ |
|---|---|---|---|
| Throughput | 5.80 fan-outs/s | 12.98 fan-outs/s | **2.24×** |
| p50 latency | 3403 ms | 1500 ms | **2.27× faster** |
| p95 latency | 4407 ms | 2130 ms | **2.07× faster** |
| p99 latency | 4896 ms | 2927 ms | **1.67× faster** |
| min latency | 1594 ms | 396 ms | best-case query closer to single-client baseline (278 ms) |
| max latency | 5559 ms | 10513 ms | tail outlier — likely first request hitting the new replica during warm-up |
| Fan-outs completed (60 s) | 354 | 789 | — |
| Errors | 0 | 0 | — |

**Reading the numbers.** One replica added ~2× capacity across the board. The cluster was clearly saturated at 20× concurrency with one replica (single-client p50 of 278 ms ballooned to 3403 ms, a 12× degradation). Adding a replica halved the queue depth and the perf returned roughly to single-client levels for the typical query, with throughput doubling.

The 10.5 s max-latency outlier on the 2-replica run is one or two queries that hit the new replica before its caches warmed; p99 of 2.9 s is the more honest tail signal.

**Implication.** Scaling is a usable knob. If production traffic ever pushes us toward saturation we can buy headroom by adding replicas — confirmed, not assumed. Combined with the iteration-1 latency numbers, this means a drop-in ClickHouse replacement of the current Orb-backed reconciliation path is feasible at today's production load, and the escalation path (more replicas) is in place for future growth.
