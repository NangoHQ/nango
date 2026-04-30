import { query } from './clickhouse.mjs';

const ACCOUNTS = [9569, 6519, 3965, 4327, 6054, 2976];
const LABELS = { 9569: 'XS', 6519: 'S', 3965: 'M', 4327: 'L', 6054: 'XL', 2976: 'XXL' };

const TABLES = ['daily_function_executions', 'daily_proxy', 'daily_webhook_forwards', 'daily_records', 'daily_connections', 'daily_actions', 'daily_mar', 'raw_events'];

console.log('[1] Earliest and latest day across each daily_* table — tells us how far back ingestion goes');
{
    const sql = `
        SELECT 'daily_function_executions' AS t, min(day) AS min_day, max(day) AS max_day, count() AS rows FROM usage.daily_function_executions
        UNION ALL SELECT 'daily_proxy',           min(day), max(day), count() FROM usage.daily_proxy
        UNION ALL SELECT 'daily_webhook_forwards',min(day), max(day), count() FROM usage.daily_webhook_forwards
        UNION ALL SELECT 'daily_records',         min(day), max(day), count() FROM usage.daily_records
        UNION ALL SELECT 'daily_connections',     min(day), max(day), count() FROM usage.daily_connections
        UNION ALL SELECT 'daily_actions',         min(day), max(day), count() FROM usage.daily_actions
        UNION ALL SELECT 'daily_mar',             min(day), max(day), count() FROM usage.daily_mar
    `;
    const r = await query(sql);
    console.table(r.rows);
    console.log(`  ${r.durationMs}ms`);
}

console.log('\n[2] raw_events earliest event timestamp (the actual ingest start)');
{
    const r = await query(`SELECT min(ts) AS min_ts, max(ts) AS max_ts, count() AS rows FROM usage.raw_events`);
    console.table(r.rows);
    console.log(`  ${r.durationMs}ms`);
}

console.log('\n[3] Per picked account: row counts across every metric table, last 30 days');
{
    for (const tableName of ['daily_function_executions', 'daily_proxy', 'daily_webhook_forwards', 'daily_records', 'daily_connections', 'daily_actions', 'daily_mar']) {
        const r = await query(`
            SELECT account_id, count() AS rows
            FROM usage.${tableName}
            WHERE account_id IN (${ACCOUNTS.join(',')}) AND day >= today() - 30
            GROUP BY account_id
            ORDER BY account_id
        `);
        const byId = Object.fromEntries(r.rows.map((row) => [String(row.account_id), row.rows]));
        const table = ACCOUNTS.map((id) => ({ bucket: LABELS[id], account_id: id, rows: byId[String(id)] ?? 0 }));
        console.log(`\n  -- ${tableName}`);
        console.table(table);
    }
}

console.log('\n[4] Top accounts by row count across all metric tables (find true "big players in ClickHouse")');
{
    const sql = `
        SELECT account_id, sum(rows) AS total_rows FROM (
            SELECT account_id, count() AS rows FROM usage.daily_function_executions WHERE day >= today() - 30 GROUP BY account_id
            UNION ALL SELECT account_id, count() FROM usage.daily_proxy             WHERE day >= today() - 30 GROUP BY account_id
            UNION ALL SELECT account_id, count() FROM usage.daily_webhook_forwards  WHERE day >= today() - 30 GROUP BY account_id
            UNION ALL SELECT account_id, count() FROM usage.daily_records           WHERE day >= today() - 30 GROUP BY account_id
            UNION ALL SELECT account_id, count() FROM usage.daily_connections       WHERE day >= today() - 30 GROUP BY account_id
        ) GROUP BY account_id ORDER BY total_rows DESC LIMIT 20
    `;
    const r = await query(sql);
    console.table(r.rows);
    console.log(`  ${r.durationMs}ms`);
}

console.log('\n[5] Distinct connection_ids per top-by-rows account, last 30 days, daily_function_executions');
{
    const r = await query(`
        SELECT account_id, uniq(connection_id) AS distinct_conns, count() AS rows
        FROM usage.daily_function_executions
        WHERE day >= today() - 30
        GROUP BY account_id
        ORDER BY distinct_conns DESC
        LIMIT 20
    `);
    console.table(r.rows);
    console.log(`  ${r.durationMs}ms`);
}

console.log('\nDone.');
