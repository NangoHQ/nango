import { query } from './clickhouse.mjs';

console.log('[1] Top accounts by distinct connection_id in daily_proxy, last 30d');
{
    const r = await query(`
        SELECT account_id, uniq(connection_id) AS distinct_conns, count() AS rows
        FROM usage.daily_proxy
        WHERE day >= today() - 30
        GROUP BY account_id
        ORDER BY distinct_conns DESC
        LIMIT 10
    `);
    console.table(r.rows);
    console.log(`  ${r.durationMs}ms`);
}

console.log('\n[2] Cross-check: avg daily connections in ClickHouse vs Postgres count, for the originally-picked accounts');
{
    const ACCOUNTS_PG = {
        9569: 10,
        6519: 76,
        3965: 713,
        4327: 1993,
        6054: 39515,
        2976: 663333
    };
    const ids = Object.keys(ACCOUNTS_PG).join(',');
    const r = await query(`
        SELECT
            account_id,
            ROUND(avg(daily_total)) AS ch_avg_daily_connections,
            min(day) AS min_day,
            max(day) AS max_day,
            count() AS days_with_data
        FROM (
            SELECT account_id, day, SUM(avg_val) AS daily_total
            FROM (
                SELECT account_id, day, environment_id, integration_id, avgMerge(value) AS avg_val
                FROM usage.daily_connections
                WHERE account_id IN (${ids})
                GROUP BY account_id, day, environment_id, integration_id
            )
            GROUP BY account_id, day
        )
        GROUP BY account_id
        ORDER BY account_id
    `);
    const byId = Object.fromEntries(r.rows.map((row) => [String(row.account_id), row]));
    const table = Object.entries(ACCOUNTS_PG).map(([id, pg]) => {
        const ch = byId[id];
        return {
            account_id: Number(id),
            postgres_active: pg,
            ch_avg_daily: ch?.ch_avg_daily_connections ?? '(no data)',
            ch_days: ch?.days_with_data ?? 0,
            ratio_ch_over_pg: ch ? Math.round((ch.ch_avg_daily_connections / pg) * 100) / 100 : null
        };
    });
    console.table(table);
    console.log(`  ${r.durationMs}ms`);
}

console.log('\n[3] Medium-cardinality candidates in daily_function_executions (~200–500 distinct conns)');
{
    const r = await query(`
        SELECT account_id, uniq(connection_id) AS distinct_conns, count() AS rows
        FROM usage.daily_function_executions
        WHERE day >= today() - 30
        GROUP BY account_id
        HAVING distinct_conns BETWEEN 200 AND 500
        ORDER BY distinct_conns DESC
        LIMIT 15
    `);
    console.table(r.rows);
    console.log(`  ${r.durationMs}ms`);
}

console.log('\nDone.');
