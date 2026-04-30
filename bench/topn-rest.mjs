import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { query } from './clickhouse.mjs';

// 14-day window — matches max ingestion depth as of 2026-04-30
const START = '2026-04-16';
const END = '2026-04-30';
const TOP_N = 25;

const TESTS = [
    { name: 'small (functions)', account_id: 6519, table: 'daily_function_executions', metric_col: 'duration_ms', expected_card: 25 },
    { name: 'medium (functions)', account_id: 1372, table: 'daily_function_executions', metric_col: 'duration_ms', expected_card: 253 },
    { name: 'large (functions)', account_id: 4327, table: 'daily_function_executions', metric_col: 'duration_ms', expected_card: 1708 },
    { name: 'doomsday (functions)', account_id: 3660, table: 'daily_function_executions', metric_col: 'duration_ms', expected_card: 15819 },
    { name: 'doomsday (proxy)', account_id: 2976, table: 'daily_proxy', metric_col: 'value', expected_card: 82397 }
];

const REPEATS = 3;

function buildSql({ account_id, table, metric_col }) {
    return `
        SELECT
            SUM(${metric_col}) AS quantity,
            day AS start,
            addDays(day, 1) AS end,
            CASE
                WHEN connection_id IN (
                    SELECT connection_id
                    FROM usage.${table}
                    WHERE account_id = ${account_id}
                      AND day >= toDate('${START}')
                      AND day <  toDate('${END}')
                    GROUP BY connection_id
                    ORDER BY SUM(${metric_col}) DESC
                    LIMIT ${TOP_N}
                )
                THEN connection_id
                ELSE 'rest'
            END AS dimension
        FROM usage.${table}
        WHERE account_id = ${account_id}
          AND day >= toDate('${START}')
          AND day <  toDate('${END}')
        GROUP BY account_id, day, dimension
        ORDER BY day, quantity DESC
    `;
}

async function fetchQueryLog(queryIds) {
    if (queryIds.length === 0) return [];
    const idList = queryIds.map((id) => `'${id}'`).join(',');
    const r = await query(`
        SELECT
            query_id,
            query_duration_ms,
            read_rows,
            read_bytes,
            result_rows,
            memory_usage,
            length(thread_ids) AS threads
        FROM system.query_log
        WHERE query_id IN (${idList}) AND type = 'QueryFinish'
        ORDER BY event_time
    `);
    return r.rows;
}

function fmt(n) {
    if (n === null || n === undefined) return '-';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'G';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'k';
    return String(n);
}

const allResults = [];
const allQueryIds = [];

for (const test of TESTS) {
    console.log(`\n=== ${test.name} — account_id=${test.account_id}, table=${test.table}, expected_card≈${test.expected_card} ===`);
    const sql = buildSql(test);
    const runs = [];

    for (let i = 0; i < REPEATS; i++) {
        const queryId = randomUUID();
        try {
            const r = await query(sql, { queryId });
            runs.push({
                run: i + 1,
                queryId,
                durationMs: r.durationMs,
                resultRows: r.rows.length,
                totalQuantity: r.rows.reduce((a, b) => a + Number(b.quantity || 0), 0)
            });
            allQueryIds.push(queryId);
            console.log(`  run ${i + 1}: ${r.durationMs}ms (queryId=${queryId}, ${r.rows.length} rows)`);
        } catch (err) {
            console.log(`  run ${i + 1}: FAILED — ${err.message.slice(0, 200)}`);
            runs.push({ run: i + 1, queryId, error: err.message });
        }
    }

    allResults.push({ test, runs });
}

console.log('\n--- Pulling system.query_log (giving it 5s to flush) ---');
await new Promise((r) => setTimeout(r, 5000));
let log = [];
let logById = {};
try {
    log = await fetchQueryLog(allQueryIds);
    logById = Object.fromEntries(log.map((l) => [l.query_id, l]));
} catch (err) {
    console.log(`  query_log unavailable (${err.message.slice(0, 120)}). Wall-time only.`);
}

console.log('\n=== SUMMARY ===');
const summary = allResults.map(({ test, runs }) => {
    const wallTimes = runs.filter((r) => !r.error).map((r) => r.durationMs);
    const logs = runs.map((r) => logById[r.queryId]).filter(Boolean);
    const avgServerMs = logs.length ? Math.round(logs.reduce((a, b) => a + Number(b.query_duration_ms), 0) / logs.length) : null;
    const avgReadRows = logs.length ? Math.round(logs.reduce((a, b) => a + Number(b.read_rows), 0) / logs.length) : null;
    const avgReadBytes = logs.length ? Math.round(logs.reduce((a, b) => a + Number(b.read_bytes), 0) / logs.length) : null;
    const avgMemory = logs.length ? Math.round(logs.reduce((a, b) => a + Number(b.memory_usage), 0) / logs.length) : null;
    const maxThreads = logs.length ? Math.max(...logs.map((l) => Number(l.threads))) : null;
    return {
        bucket: test.name,
        account: test.account_id,
        card: test.expected_card,
        wall_min: Math.min(...wallTimes),
        wall_max: Math.max(...wallTimes),
        wall_avg: Math.round(wallTimes.reduce((a, b) => a + b, 0) / wallTimes.length),
        srv_avg_ms: avgServerMs,
        rows_read: fmt(avgReadRows),
        bytes_read: fmt(avgReadBytes),
        memory: fmt(avgMemory),
        threads: maxThreads,
        result_rows: runs[0]?.resultRows ?? null
    };
});
console.table(summary);

// Persist detailed results
mkdirSync('bench/results', { recursive: true });
const outPath = resolve('bench/results', `topn-rest-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(outPath, JSON.stringify({ window: { start: START, end: END }, top_n: TOP_N, repeats: REPEATS, results: allResults, queryLog: log, summary }, null, 2));
console.log(`\nDetailed results: ${outPath}`);
