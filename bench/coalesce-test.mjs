// Test the hypothesis that coalescing the 3 function metrics into one query
// reduces wall time for accounts where daily_function_executions is hot.
//
// Three function metrics live in daily_function_executions:
//   function_executions    → SUM(value)
//   function_logs          → SUM(custom_logs)
//   function_compute_gbms  → SUM(compute_gbms)
//
// Today's getUsage() would issue these as 3 independent top-N+rest queries
// running in parallel. Each runs its own subquery to determine the top-25
// connection_ids by *its own* metric — so the top-25 sets are not the same
// across the 3 metrics.
//
// We test 3 strategies for delivering "top-25 per metric + rest, broken
// down by day" for all 3 function metrics:
//   A) 3 independent top-N+rest queries (today's shape)
//   B) 1 coalesced query: per (day, connection_id), all 3 SUMs.
//      Server returns RAW per-connection rows; client buckets top-25-per-metric.
//   C) 1 coalesced query with CTEs that compute the 3 top-25 sets and
//      bucket on the server side. Returns 3 series in one round-trip.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { query } from './clickhouse.mjs';

const START = '2026-04-16';
const END = '2026-04-30';
const TOP_N = 25;
const REPEATS = 3;

const ACCOUNTS = [
    { bucket: 'small', account_id: 6519 },
    { bucket: 'medium', account_id: 1372 },
    { bucket: 'large', account_id: 4327 },
    { bucket: 'doomsday-fn', account_id: 3660 },
    { bucket: 'doomsday-px', account_id: 2976 } // for completeness, even though it has near-zero function data
];

// ------------- A: today's shape -------------

function topN(account_id, col) {
    return `
        SELECT SUM(${col}) AS quantity, day,
               CASE WHEN connection_id IN (
                   SELECT connection_id FROM usage.daily_function_executions
                   WHERE account_id = ${account_id} AND day >= toDate('${START}') AND day < toDate('${END}')
                   GROUP BY connection_id ORDER BY SUM(${col}) DESC LIMIT ${TOP_N}
               ) THEN connection_id ELSE 'rest' END AS dimension
        FROM usage.daily_function_executions
        WHERE account_id = ${account_id} AND day >= toDate('${START}') AND day < toDate('${END}')
        GROUP BY account_id, day, dimension
        ORDER BY day, quantity DESC`;
}

async function runA(account_id) {
    const t0 = Date.now();
    const sqls = [topN(account_id, 'value'), topN(account_id, 'custom_logs'), topN(account_id, 'compute_gbms')];
    const results = await Promise.allSettled(sqls.map((sql) => query(sql)));
    const ms = Date.now() - t0;
    const rows = results.reduce((acc, r) => acc + (r.status === 'fulfilled' ? r.value.rows.length : 0), 0);
    return { ms, rows };
}

// ------------- B: 1 coalesced query, raw per-connection -------------
// Returns per (day, connection_id) the 3 SUMs. Client must do top-25 bucketing.

function coalescedRaw(account_id) {
    return `
        SELECT day, connection_id,
               SUM(value)        AS exec_q,
               SUM(custom_logs)  AS log_q,
               SUM(compute_gbms) AS comp_q
        FROM usage.daily_function_executions
        WHERE account_id = ${account_id} AND day >= toDate('${START}') AND day < toDate('${END}')
        GROUP BY day, connection_id`;
}

async function runB(account_id) {
    const t0 = Date.now();
    const r = await query(coalescedRaw(account_id));
    const networkAndParseMs = Date.now() - t0;

    // Client-side bucketing: top-25 per metric, rest collapsed
    const t1 = Date.now();
    const totals = new Map(); // connection_id -> {exec, log, comp}
    for (const row of r.rows) {
        const key = row.connection_id;
        const cur = totals.get(key) || { exec: 0, log: 0, comp: 0 };
        cur.exec += Number(row.exec_q);
        cur.log += Number(row.log_q);
        cur.comp += Number(row.comp_q);
        totals.set(key, cur);
    }
    const allConns = [...totals.keys()];
    const topByMetric = (mKey) => new Set([...totals.entries()].sort((a, b) => b[1][mKey] - a[1][mKey]).slice(0, TOP_N).map(([k]) => k));
    const topExec = topByMetric('exec');
    const topLog = topByMetric('log');
    const topComp = topByMetric('comp');

    // Now bucket each row's contribution per metric into top vs rest
    const series = { exec: new Map(), log: new Map(), comp: new Map() };
    function add(map, day, dim, q) {
        const k = `${day}|${dim}`;
        map.set(k, (map.get(k) || 0) + q);
    }
    for (const row of r.rows) {
        const day = row.day;
        const cid = row.connection_id;
        add(series.exec, day, topExec.has(cid) ? cid : 'rest', Number(row.exec_q));
        add(series.log, day, topLog.has(cid) ? cid : 'rest', Number(row.log_q));
        add(series.comp, day, topComp.has(cid) ? cid : 'rest', Number(row.comp_q));
    }
    const clientMs = Date.now() - t1;
    const totalMs = networkAndParseMs + clientMs;
    return {
        ms: totalMs,
        breakdown: { server_plus_network_ms: networkAndParseMs, client_bucket_ms: clientMs },
        raw_rows: r.rows.length,
        distinct_conns: allConns.length,
        out_rows: series.exec.size + series.log.size + series.comp.size
    };
}

// ------------- C: 1 server-side coalesced query with CTEs -------------
// Pure SQL: bucket top-25-per-metric server-side, return 3 series in one
// result set tagged by `metric` column.

function coalescedServer(account_id) {
    const where = `account_id = ${account_id} AND day >= toDate('${START}') AND day < toDate('${END}')`;
    // Each branch wraps its own GROUP BY in a subquery so we don't fight UNION-ALL alias resolution.
    return `
        WITH
        per_conn AS (
            SELECT day, connection_id,
                   SUM(value) AS exec_q, SUM(custom_logs) AS log_q, SUM(compute_gbms) AS comp_q
            FROM usage.daily_function_executions
            WHERE ${where}
            GROUP BY day, connection_id
        ),
        totals AS (
            SELECT connection_id,
                   SUM(exec_q) AS exec_total,
                   SUM(log_q) AS log_total,
                   SUM(comp_q) AS comp_total
            FROM per_conn GROUP BY connection_id
        ),
        top_exec AS (SELECT connection_id FROM totals ORDER BY exec_total DESC LIMIT ${TOP_N}),
        top_log  AS (SELECT connection_id FROM totals ORDER BY log_total  DESC LIMIT ${TOP_N}),
        top_comp AS (SELECT connection_id FROM totals ORDER BY comp_total DESC LIMIT ${TOP_N})
        SELECT 'exec' AS metric, day, dimension, toFloat64(quantity) AS quantity FROM (
            SELECT day,
                   CASE WHEN connection_id IN (SELECT connection_id FROM top_exec) THEN connection_id ELSE 'rest' END AS dimension,
                   SUM(exec_q) AS quantity
            FROM per_conn
            GROUP BY day, dimension
        )
        UNION ALL
        SELECT 'log' AS metric, day, dimension, toFloat64(quantity) AS quantity FROM (
            SELECT day,
                   CASE WHEN connection_id IN (SELECT connection_id FROM top_log) THEN connection_id ELSE 'rest' END AS dimension,
                   SUM(log_q) AS quantity
            FROM per_conn
            GROUP BY day, dimension
        )
        UNION ALL
        SELECT 'comp' AS metric, day, dimension, toFloat64(quantity) AS quantity FROM (
            SELECT day,
                   CASE WHEN connection_id IN (SELECT connection_id FROM top_comp) THEN connection_id ELSE 'rest' END AS dimension,
                   SUM(comp_q) AS quantity
            FROM per_conn
            GROUP BY day, dimension
        )
        ORDER BY metric, day, quantity DESC`;
}

async function runC(account_id) {
    const t0 = Date.now();
    const r = await query(coalescedServer(account_id));
    const ms = Date.now() - t0;
    return { ms, rows: r.rows.length };
}

// ------------- Driver -------------

async function timed(fn) {
    const runs = [];
    for (let i = 0; i < REPEATS; i++) runs.push(await fn());
    const ms = runs.map((r) => r.ms);
    return {
        runs,
        min: Math.min(...ms),
        max: Math.max(...ms),
        avg: Math.round(ms.reduce((a, b) => a + b, 0) / ms.length)
    };
}

const out = [];
for (const acc of ACCOUNTS) {
    console.log(`\n=== ${acc.bucket} — account ${acc.account_id} ===`);
    const A = await timed(() => runA(acc.account_id));
    console.log(`  A (3 parallel topN queries):           avg=${A.avg}ms  min=${A.min}  max=${A.max}`);
    const B = await timed(() => runB(acc.account_id));
    const lastB = B.runs[B.runs.length - 1];
    console.log(
        `  B (1 raw query + client bucketing):    avg=${B.avg}ms  min=${B.min}  max=${B.max}  | server+net=${lastB.breakdown.server_plus_network_ms}ms client=${lastB.breakdown.client_bucket_ms}ms raw_rows=${lastB.raw_rows}`
    );
    const C = await timed(() => runC(acc.account_id));
    const lastC = C.runs[C.runs.length - 1];
    console.log(`  C (1 server-side coalesced query):     avg=${C.avg}ms  min=${C.min}  max=${C.max}  | rows=${lastC.rows}`);
    out.push({ acc, A, B, C });
}

console.log('\n\n=== SUMMARY (avg ms) ===\n');
console.table(
    out.map(({ acc, A, B, C }) => ({
        bucket: acc.bucket,
        account: acc.account_id,
        A_3_parallel_topN: A.avg,
        B_raw_plus_client: B.avg,
        C_server_coalesced: C.avg,
        'B/A': (B.avg / A.avg).toFixed(2) + 'x',
        'C/A': (C.avg / A.avg).toFixed(2) + 'x'
    }))
);

mkdirSync('bench/results', { recursive: true });
const outPath = resolve('bench/results', `coalesce-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(outPath, JSON.stringify({ window: { start: START, end: END }, top_n: TOP_N, repeats: REPEATS, results: out }, null, 2));
console.log(`\nDetailed: ${outPath}`);
