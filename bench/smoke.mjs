import { HOST, query } from './clickhouse.mjs';

const ACCOUNTS = [9569, 6519, 3965, 4327, 6054, 2976];
const LABELS = { 9569: 'XS', 6519: 'S', 3965: 'M', 4327: 'L', 6054: 'XL', 2976: 'XXL' };

console.log(`Connecting to ${HOST} ...`);

console.log('\n[1/3] Connectivity (SELECT 1)');
{
    const r = await query('SELECT 1 AS v');
    console.log(`  ok in ${r.durationMs}ms — ${JSON.stringify(r.rows)}`);
}

console.log('\n[2/3] Row counts in usage.daily_function_executions, last 30 days, per picked account');
{
    const r = await query(`
        SELECT account_id, count() AS row_count
        FROM usage.daily_function_executions
        WHERE account_id IN (${ACCOUNTS.join(',')})
          AND day >= today() - 30
        GROUP BY account_id
        ORDER BY account_id
    `);
    const byId = Object.fromEntries(r.rows.map((row) => [String(row.account_id), row.row_count]));
    const table = ACCOUNTS.map((id) => ({
        bucket: LABELS[id],
        account_id: id,
        rows_in_clickhouse: byId[String(id)] ?? 0
    }));
    console.table(table);
    console.log(`  query took ${r.durationMs}ms (queryId=${r.queryId})`);
}

console.log('\n[3/3] Distinct connection_id per picked account, last 30 days');
{
    const r = await query(`
        SELECT account_id, uniq(connection_id) AS distinct_connections
        FROM usage.daily_function_executions
        WHERE account_id IN (${ACCOUNTS.join(',')})
          AND day >= today() - 30
        GROUP BY account_id
        ORDER BY account_id
    `);
    const byId = Object.fromEntries(r.rows.map((row) => [String(row.account_id), row.distinct_connections]));
    const table = ACCOUNTS.map((id) => ({
        bucket: LABELS[id],
        account_id: id,
        distinct_connection_ids: byId[String(id)] ?? 0
    }));
    console.table(table);
    console.log(`  query took ${r.durationMs}ms (queryId=${r.queryId})`);
}

console.log('\nDone.');
