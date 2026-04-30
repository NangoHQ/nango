// Per-metric solo measurements: for each test account, run each of the 7
// dashboard metrics in isolation, with and without per-connection breakdown.
// Surfaces which specific queries are cheap and which are expensive — useful
// for product decisions like "default to aggregate, opt-in to per-connection".

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
    { bucket: 'doomsday-px', account_id: 2976 }
];

const METRICS = [
    { name: 'proxy', table: 'daily_proxy', kind: 'counter', col: 'value' },
    { name: 'function_executions', table: 'daily_function_executions', kind: 'counter', col: 'value' },
    { name: 'function_logs', table: 'daily_function_executions', kind: 'counter', col: 'custom_logs' },
    { name: 'function_compute_gbms', table: 'daily_function_executions', kind: 'counter', col: 'compute_gbms' },
    { name: 'webhook_forwards', table: 'daily_webhook_forwards', kind: 'counter', col: 'value' },
    { name: 'records', table: 'daily_records', kind: 'gauge', innerGroupBy: 'account_id, day, environment_id, integration_id, connection_id, model' },
    { name: 'connections', table: 'daily_connections', kind: 'gauge', innerGroupBy: 'account_id, day, environment_id, integration_id', noConnectionId: true }
];

function counterSimple({ account_id, table, col }) {
    return `
        SELECT SUM(${col}) AS quantity, day AS start, addDays(day, 1) AS end
        FROM usage.${table}
        WHERE account_id = ${account_id} AND day >= toDate('${START}') AND day < toDate('${END}')
        GROUP BY account_id, day ORDER BY account_id, day`;
}

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

async function timeOnce(sql) {
    const t0 = Date.now();
    const r = await query(sql);
    return { ms: Date.now() - t0, rows: r.rows.length };
}

async function timeRepeats(sql) {
    const runs = [];
    for (let i = 0; i < REPEATS; i++) runs.push(await timeOnce(sql));
    const ms = runs.map((r) => r.ms);
    return { runs, min: Math.min(...ms), max: Math.max(...ms), avg: Math.round(ms.reduce((a, b) => a + b, 0) / ms.length), result_rows: runs[0].rows };
}

function metricSql(metric, account_id, mode) {
    if (metric.kind === 'counter') {
        return mode === 'simple' ? counterSimple({ account_id, table: metric.table, col: metric.col }) : counterTopN({ account_id, table: metric.table, col: metric.col });
    }
    if (mode === 'simple' || metric.noConnectionId) return gaugeSimple({ account_id, table: metric.table, innerGroupBy: metric.innerGroupBy });
    return gaugeTopN({ account_id, table: metric.table, innerGroupBy: metric.innerGroupBy });
}

const out = [];

for (const acc of ACCOUNTS) {
    console.log(`\n=== ${acc.bucket} — account ${acc.account_id} ===`);
    const perMetric = [];
    for (const metric of METRICS) {
        const A = await timeRepeats(metricSql(metric, acc.account_id, 'simple'));
        const breakdownSQL = !metric.noConnectionId ? metricSql(metric, acc.account_id, 'topn') : null;
        const B = breakdownSQL ? await timeRepeats(breakdownSQL) : null;

        const breakStr = B ? `${String(B.avg).padStart(5)}ms (${String(B.result_rows).padStart(4)} rows)` : '          n/a';
        console.log(`  ${metric.name.padEnd(22)}  simple=${String(A.avg).padStart(4)}ms (${String(A.result_rows).padStart(4)} rows)   breakdown=${breakStr}`);

        perMetric.push({
            metric: metric.name,
            simple_ms: A.avg,
            simple_rows: A.result_rows,
            breakdown_ms: B?.avg ?? null,
            breakdown_rows: B?.result_rows ?? null,
            ratio: B ? (B.avg / A.avg).toFixed(2) + 'x' : 'n/a'
        });
    }
    out.push({ acc, perMetric });
}

console.log('\n\n=== PER-METRIC PER-ACCOUNT (avg ms of 3 runs) ===');
for (const { acc, perMetric } of out) {
    console.log(`\n${acc.bucket} (account ${acc.account_id}):`);
    console.table(perMetric);
}

mkdirSync('bench/results', { recursive: true });
const outPath = resolve('bench/results', `per-metric-solo-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(outPath, JSON.stringify({ window: { start: START, end: END }, top_n: TOP_N, repeats: REPEATS, results: out }, null, 2));
console.log(`\nDetailed: ${outPath}`);
