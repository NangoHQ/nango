# Dead Tuples Snowball Investigation

## Hypothesis

The `deleteOutdatedRecords` function marks records as deleted in batches, using a loop that
re-scans the partial index from the beginning on each iteration. Each batch creates dead tuples
(the old row versions) that remain in the index until vacuum removes them. If vacuum can't keep
up — either because it hasn't run yet between batches, or because it's overwhelmed under high
concurrency — subsequent batches will re-scan these dead tuples over and over, wasting IO on
entries that will never produce useful results.

The `deleteRecords` function (used by the auto-deleting and auto-pruning daemons) has the same
batch loop pattern and may suffer from the same issue.

## Problem

This re-scanning manifests as:

This manifests as:
- `tup_returned` (index entries scanned) growing much faster than `tup_fetched` (useful rows)
- IO amplification under concurrency — kill flags that normally help skip dead entries get
  evicted from the buffer cache by other sessions
- Cascading IO saturation (`IO:DataFileRead`) that slows down all queries including upserts

## How PostgreSQL stats work

- **tup_returned**: incremented by `index_getnext_tid()` for every index entry the AM returns,
  including dead tuples (before visibility check). Also incremented by `heap_getnext` for seq scans.
- **tup_fetched**: incremented by `index_fetch_heap()` only when the tuple is **visible**.
  Dead tuples are fetched from the heap but don't count.
- **LP_DEAD kill flags**: when a scan discovers a dead tuple via heap fetch, it marks the index
  entry as LP_DEAD in memory. Future scans skip it. But if the buffer page is evicted and re-read,
  the flag is lost and the dead tuple must be re-discovered.

So dead tuples inflate `tup_returned` without `tup_fetched`, and the kill flag mechanism
breaks down under buffer cache pressure from concurrent sessions.

## Proposed fix

Use a cursor `(sync_job_id, id) > (last_sync_job_id, last_id)` so each batch starts where
the previous one left off, never revisiting dead tuples. Requires the index to have `id` as
a key column instead of INCLUDE — same storage cost (verified: both 28 MB for 500K rows).

## Reproducing

### Prerequisites
- PostgreSQL 15+ running locally
- `psql` available

### Run the tests

```bash
# Set your connection details
export PGPASSWORD=nango
export PGHOST=localhost
export PGPORT=5432
export PGUSER=nango

# Test 1: No cursor, vacuum disabled — single worker
psql -f 01_setup.sql
psql -v conn_id=1 -f 02_worker_no_cursor.sql
psql -f 03_collect_stats.sql

# Test 2: With cursor, vacuum disabled — single worker
psql -f 01_setup.sql
bash 04_worker_cursor.sh 1
psql -f 03_collect_stats.sql

# Test 3: No cursor, vacuum enabled — single worker
psql -f 01_setup_with_vacuum.sql
psql -v conn_id=1 -f 02_worker_no_cursor.sql
psql -f 03_collect_stats.sql

# Test 4: With cursor, vacuum enabled — single worker
psql -f 01_setup_with_vacuum.sql
bash 04_worker_cursor.sh 1
psql -f 03_collect_stats.sql

# Test 5: No cursor, vacuum disabled — 10 concurrent workers
psql -f 01_setup.sql
for i in $(seq 1 10); do psql -v conn_id=$i -f 02_worker_no_cursor.sql > /dev/null 2>&1 & done; wait
psql -f 03_collect_stats.sql

# Test 6: With cursor, vacuum disabled — 10 concurrent workers
psql -f 01_setup.sql
for i in $(seq 1 10); do bash 04_worker_cursor.sh $i & done; wait
psql -f 03_collect_stats.sql
```

### Expected results (idx_test_records_outdated)

Single worker (50K rows, 10 batches of 5K):

| | No cursor | With cursor |
|---|---|---|
| **Vacuum OFF** | idx_tup_read=95K, idx_tup_fetch=50K, **ratio=1.90x** | idx_tup_read=50K, idx_tup_fetch=50K, **ratio=1.00x** |
| **Vacuum ON** | idx_tup_read=95K, idx_tup_fetch=45K, **ratio=2.11x** | idx_tup_read=50K, idx_tup_fetch=45K, **ratio=1.11x** |

10 concurrent workers (500K rows total):

| | No cursor | With cursor |
|---|---|---|
| **Vacuum OFF** | idx_tup_read=1.63M, idx_tup_fetch=500K, **ratio=3.26x** | idx_tup_read=500K, idx_tup_fetch=500K, **ratio=1.00x** |
| **Vacuum ON** | idx_tup_read=1.82M, idx_tup_fetch=449K, **ratio=4.05x** | idx_tup_read=500K, idx_tup_fetch=449K, **ratio=1.11x** |

Key observations:
- Vacuum does NOT solve the problem — the no-cursor ratio is worse with vacuum (2.11x vs 1.90x)
- Concurrency amplifies the problem (1.90x → 3.26x) due to kill flag eviction from buffer cache
- The cursor fix eliminates dead tuple re-scanning regardless of vacuum or concurrency
