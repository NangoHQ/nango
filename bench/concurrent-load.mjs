// Concurrent load smoke test: spawn N worker loops each running the iteration-1
// fan-out (with breakdown) continuously for `durationMs`. Reports throughput
// and latency percentiles. Goal: confirm that adding a replica to ClickHouse
// Cloud reduces latency / increases throughput under the same load.
//
// Run once with current sizing, add a replica via the ClickHouse Cloud console,
// run again, and compare the JSON outputs in bench/results/.
//
// Usage:
//   node bench/concurrent-load.mjs [concurrency] [durationMs] [accountId]
// Defaults: 20 workers, 60s, account 4327 (large).

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { query } from './clickhouse.mjs';

const CONCURRENCY = Number(process.argv[2] || 20);
const DURATION_MS = Number(process.argv[3] || 60_000);
const ACCOUNT_ID = Number(process.argv[4] || 4327);

const START = '2026-04-16';
const END = '2026-04-30';
const TOP_N = 25;

const METRICS = [
    { name: 'proxy', table: 'daily_proxy', kind: 'counter', col: 'value' },
    { name: 'function_executions', table: 'daily_function_executions', kind: 'counter', col: 'value' },
    { name: 'function_logs', table: 'daily_function_executions', kind: 'counter', col: 'custom_logs' },
    { name: 'function_compute_gbms', table: 'daily_function_executions', kind: 'counter', col: 'compute_gbms' },
    { name: 'webhook_forwards', table: 'daily_webhook_forwards', kind: 'counter', col: 'value' },
    { name: 'records', table: 'daily_records', kind: 'gauge', innerGroupBy: 'account_id, day, environment_id, integration_id, connection_id, model' },
    { name: 'connections', table: 'daily_connections', kind: 'gauge', innerGroupBy: 'account_id, day, environment_id, integration_id', noConnectionId: true }
];

function counterTopN({ account_id, table, col }) {
    return `
        SELECT SUM(${col}) AS quantity, day AS start, addDays(day, 1) AS end,
               CASE WHEN connection_id IN (
                   SELECT connection_id FROM usage.${table}
                   WHERE account_id = ${account_id} AND day >= toDate('${START}') AND day < toDate('${END}')
                   GROUP BY connection_id ORDER BY SUM(${col}) DESC LIMIT ${TOP_N}
               ) THEN connection_id ELSE 'rest' END AS dimension
        FROM usage.${table}
        WHERE account_id = ${account_id} AND day >= toDate('${START}') AND day < toDate('${END}')
        GROUP BY account_id, day, dimension ORDER BY day, quantity DESC`;
}

function gaugeSimple({ account_id, table, innerGroupBy }) {
    return `
        SELECT ROUND(SUM(avg_val)) AS quantity, day AS start, addDays(day, 1) AS end
        FROM (
            SELECT avgMerge(value) AS avg_val, ${innerGroupBy}
            FROM usage.${table}
            WHERE account_id = ${account_id} AND day >= toDate('${START}') AND day < toDate('${END}')
            GROUP BY ${innerGroupBy}
        )
        GROUP BY account_id, day ORDER BY account_id, day`;
}

function gaugeTopN({ account_id, table, innerGroupBy }) {
    return `
        WITH top_conns AS (
            SELECT connection_id FROM (
                SELECT connection_id, SUM(avg_val) AS s FROM (
                    SELECT avgMerge(value) AS avg_val, ${innerGroupBy}
                    FROM usage.${table}
                    WHERE account_id = ${account_id} AND day >= toDate('${START}') AND day < toDate('${END}')
                    GROUP BY ${innerGroupBy}
                ) GROUP BY connection_id ORDER BY s DESC LIMIT ${TOP_N}
            )
        )
        SELECT ROUND(SUM(avg_val)) AS quantity, day AS start, addDays(day, 1) AS end,
               CASE WHEN connection_id IN (SELECT connection_id FROM top_conns) THEN connection_id ELSE 'rest' END AS dimension
        FROM (
            SELECT avgMerge(value) AS avg_val, ${innerGroupBy}
            FROM usage.${table}
            WHERE account_id = ${account_id} AND day >= toDate('${START}') AND day < toDate('${END}')
            GROUP BY ${innerGroupBy}
        )
        GROUP BY account_id, day, dimension ORDER BY day, quantity DESC`;
}

function metricSql(metric, account_id) {
    if (metric.kind === 'counter') return counterTopN({ account_id, table: metric.table, col: metric.col });
    if (metric.noConnectionId) return gaugeSimple({ account_id, table: metric.table, innerGroupBy: metric.innerGroupBy });
    return gaugeTopN({ account_id, table: metric.table, innerGroupBy: metric.innerGroupBy });
}

async function fanOutOnce() {
    const t0 = process.hrtime.bigint();
    const sqls = METRICS.map((m) => metricSql(m, ACCOUNT_ID));
    await Promise.allSettled(sqls.map((sql) => query(sql)));
    return Number(process.hrtime.bigint() - t0) / 1e6;
}

function pct(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return Math.round(sorted[idx]);
}

console.log(`Concurrent load: ${CONCURRENCY} workers × ${DURATION_MS / 1000}s, account=${ACCOUNT_ID}`);
console.log(`Workload: 7-query fan-out with breakdown (iteration-1 'D' shape)`);
console.log(`Started:  ${new Date().toISOString()}\n`);

const startWall = Date.now();
const deadline = startWall + DURATION_MS;
const latencies = [];
let errors = 0;

async function worker() {
    while (Date.now() < deadline) {
        try {
            const ms = await fanOutOnce();
            latencies.push(ms);
        } catch {
            errors++;
        }
    }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
const wallMs = Date.now() - startWall;

const summary = {
    wallMs,
    completed: latencies.length,
    errors,
    throughputPerSec: Math.round((latencies.length / (wallMs / 1000)) * 100) / 100,
    p50: pct(latencies, 50),
    p95: pct(latencies, 95),
    p99: pct(latencies, 99),
    min: latencies.length ? Math.round(Math.min(...latencies)) : 0,
    max: latencies.length ? Math.round(Math.max(...latencies)) : 0
};

console.log(`=== Results ===`);
console.log(`Wall time:           ${(wallMs / 1000).toFixed(1)}s`);
console.log(`Fan-outs completed:  ${summary.completed}`);
console.log(`Errors:              ${summary.errors}`);
console.log(`Throughput:          ${summary.throughputPerSec} fan-outs/sec`);
console.log(`Latency p50/p95/p99: ${summary.p50} / ${summary.p95} / ${summary.p99} ms`);
console.log(`Latency min/max:     ${summary.min} / ${summary.max} ms`);

mkdirSync('bench/results', { recursive: true });
const outPath = resolve('bench/results', `concurrent-load-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(
    outPath,
    JSON.stringify(
        {
            config: { concurrency: CONCURRENCY, durationMs: DURATION_MS, accountId: ACCOUNT_ID, window: { start: START, end: END }, topN: TOP_N },
            summary,
            latencies
        },
        null,
        2
    )
);
console.log(`\nDetailed: ${outPath}`);
