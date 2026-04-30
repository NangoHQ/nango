import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { query } from './clickhouse.mjs';

const START = '2026-04-16';
const END = '2026-04-30';
const TOP_N = 25;
const REPEATS = 3;

// Accounts and the table/metric_col that's "their" dominant data shape.
// All accounts run all four use cases against this combination, plus the fan-out also queries the other 6 metrics.
const ACCOUNTS = [
    { bucket: 'small', account_id: 6519, primary_table: 'daily_function_executions', primary_col: 'duration_ms' },
    { bucket: 'medium', account_id: 1372, primary_table: 'daily_function_executions', primary_col: 'duration_ms' },
    { bucket: 'large', account_id: 4327, primary_table: 'daily_function_executions', primary_col: 'duration_ms' },
    { bucket: 'doomsday-fn', account_id: 3660, primary_table: 'daily_function_executions', primary_col: 'duration_ms' },
    { bucket: 'doomsday-px', account_id: 2976, primary_table: 'daily_proxy', primary_col: 'value' }
];

// Shape of each metric in the fan-out — mirrors what /plans/billing-usage requests today
// (Promise.allSettled in clickhouse.ts:194). For "no breakdown" mode, dimension is none.
// For "with breakdown" mode, dimension is connection_id where the schema supports it.
// daily_connections has no connection_id column so it stays no-breakdown in mode 4.
const METRICS = [
    { name: 'proxy', table: 'daily_proxy', kind: 'counter', col: 'value' },
    { name: 'function_executions', table: 'daily_function_executions', kind: 'counter', col: 'value' },
    { name: 'function_logs', table: 'daily_function_executions', kind: 'counter', col: 'custom_logs' },
    { name: 'function_compute_gbms', table: 'daily_function_executions', kind: 'counter', col: 'compute_gbms' },
    { name: 'webhook_forwards', table: 'daily_webhook_forwards', kind: 'counter', col: 'value' },
    { name: 'records', table: 'daily_records', kind: 'gauge', innerGroupBy: 'account_id, day, environment_id, integration_id, connection_id, model' },
    { name: 'connections', table: 'daily_connections', kind: 'gauge', innerGroupBy: 'account_id, day, environment_id, integration_id', noConnectionId: true }
];

// ---- SQL builders ----

function counterSimple({ account_id, table, col }) {
    return `
        SELECT SUM(${col}) AS quantity, day AS start, addDays(day, 1) AS end
        FROM usage.${table}
        WHERE account_id = ${account_id}
          AND day >= toDate('${START}') AND day < toDate('${END}')
        GROUP BY account_id, day
        ORDER BY account_id, day`;
}

function counterTopN({ account_id, table, col }) {
    return `
        SELECT
            SUM(${col}) AS quantity, day AS start, addDays(day, 1) AS end,
            CASE WHEN connection_id IN (
                SELECT connection_id FROM usage.${table}
                WHERE account_id = ${account_id} AND day >= toDate('${START}') AND day < toDate('${END}')
                GROUP BY connection_id ORDER BY SUM(${col}) DESC LIMIT ${TOP_N}
            ) THEN connection_id ELSE 'rest' END AS dimension
        FROM usage.${table}
        WHERE account_id = ${account_id} AND day >= toDate('${START}') AND day < toDate('${END}')
        GROUP BY account_id, day, dimension
        ORDER BY day, quantity DESC`;
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
        GROUP BY account_id, day
        ORDER BY account_id, day`;
}

function gaugeTopN({ account_id, table, innerGroupBy }) {
    // For gauges: top-N by total avg_val per connection_id over the window, then bucket the rest.
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
        GROUP BY account_id, day, dimension
        ORDER BY day, quantity DESC`;
}

// ---- Runners ----

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

async function timeFanout(sqlList) {
    const t0 = Date.now();
    const results = await Promise.allSettled(sqlList.map((sql) => query(sql)));
    const total_ms = Date.now() - t0;
    const per_query = results.map((r, i) => ({
        idx: i,
        ok: r.status === 'fulfilled',
        rows: r.status === 'fulfilled' ? r.value.rows.length : 0,
        error: r.status === 'rejected' ? String(r.reason).slice(0, 200) : null
    }));
    return { total_ms, per_query };
}

async function timeFanoutRepeats(sqlList) {
    const runs = [];
    for (let i = 0; i < REPEATS; i++) runs.push(await timeFanout(sqlList));
    const totals = runs.map((r) => r.total_ms);
    return { runs, min: Math.min(...totals), max: Math.max(...totals), avg: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) };
}

// ---- Build SQL per metric per mode ----

function metricSql(metric, account_id, mode) {
    if (metric.kind === 'counter') {
        if (mode === 'simple') return counterSimple({ account_id, table: metric.table, col: metric.col });
        return counterTopN({ account_id, table: metric.table, col: metric.col });
    } else {
        if (mode === 'simple' || metric.noConnectionId) return gaugeSimple({ account_id, table: metric.table, innerGroupBy: metric.innerGroupBy });
        return gaugeTopN({ account_id, table: metric.table, innerGroupBy: metric.innerGroupBy });
    }
}

// ---- Main ----

const out = [];

for (const acc of ACCOUNTS) {
    console.log(`\n=== ${acc.bucket} — account_id=${acc.account_id}, primary=${acc.primary_table} ===`);

    // (A) single, no breakdown — primary table only
    const a_sql = counterSimple({ account_id: acc.account_id, table: acc.primary_table, col: acc.primary_col });
    const A = await timeRepeats(a_sql);
    console.log(`  [A] single, no breakdown:        avg=${A.avg}ms (min=${A.min}, max=${A.max}, rows=${A.result_rows})`);

    // (B) single, with breakdown — primary table only
    const b_sql = counterTopN({ account_id: acc.account_id, table: acc.primary_table, col: acc.primary_col });
    const B = await timeRepeats(b_sql);
    console.log(`  [B] single, with breakdown:      avg=${B.avg}ms (min=${B.min}, max=${B.max}, rows=${B.result_rows})`);

    // (C) fan-out, no breakdown — all 7 metrics in parallel
    const c_sqls = METRICS.map((m) => metricSql(m, acc.account_id, 'simple'));
    const C = await timeFanoutRepeats(c_sqls);
    console.log(`  [C] fan-out (7×), no breakdown:  avg=${C.avg}ms (min=${C.min}, max=${C.max})`);

    // (D) fan-out, with breakdown — top-N+rest where supported
    const d_sqls = METRICS.map((m) => metricSql(m, acc.account_id, 'topn'));
    const D = await timeFanoutRepeats(d_sqls);
    console.log(`  [D] fan-out (7×), with breakdown: avg=${D.avg}ms (min=${D.min}, max=${D.max})`);

    out.push({ acc, A, B, C, D });
}

console.log('\n\n=== ITERATION 1 SUMMARY (avg of 3 runs, 14-day window 2026-04-16 → 2026-04-30) ===\n');
const tableData = out.map(({ acc, A, B, C, D }) => ({
    bucket: acc.bucket,
    account: acc.account_id,
    'A_single_simple_ms': A.avg,
    'B_single_breakdown_ms': B.avg,
    'C_fanout7_simple_ms': C.avg,
    'D_fanout7_breakdown_ms': D.avg,
    'B/A': (B.avg / A.avg).toFixed(2) + 'x',
    'C/A': (C.avg / A.avg).toFixed(2) + 'x',
    'D/B': (D.avg / B.avg).toFixed(2) + 'x'
}));
console.table(tableData);

mkdirSync('bench/results', { recursive: true });
const outPath = resolve('bench/results', `iteration-1-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(outPath, JSON.stringify({ window: { start: START, end: END }, top_n: TOP_N, repeats: REPEATS, results: out, summary: tableData }, null, 2));
console.log(`\nDetailed: ${outPath}`);
