import { query } from './clickhouse.mjs';

console.log('[1] Recent queries from current user, last 5 min (current node only)');
{
    const r = await query(`
        SELECT query_id, event_time, query_duration_ms, type, substring(query, 1, 60) AS q
        FROM system.query_log
        WHERE event_time > now() - 300
          AND user = 'usage_reader_perf_test'
        ORDER BY event_time DESC
        LIMIT 10
    `);
    console.table(r.rows);
}

console.log('\n[2] Try via clusterAllReplicas("default", system.query_log)');
try {
    const r = await query(`
        SELECT count() AS n
        FROM clusterAllReplicas('default', system.query_log)
        WHERE event_time > now() - 300
          AND user = 'usage_reader_perf_test'
    `);
    console.table(r.rows);
} catch (e) {
    console.log('  failed:', e.message.slice(0, 250));
}

console.log('\n[3] Sample query_log row including bench-relevant columns');
{
    const r = await query(`
        SELECT query_id, type, event_time, user, query_duration_ms, read_rows, read_bytes, result_rows, memory_usage, length(thread_ids) AS threads
        FROM system.query_log
        WHERE event_time > now() - 300
          AND user = 'usage_reader_perf_test'
          AND type = 'QueryFinish'
          AND query LIKE '%daily_function_executions%top%'
        ORDER BY event_time DESC
        LIMIT 3
    `);
    console.table(r.rows);
}

console.log('\nDone.');
