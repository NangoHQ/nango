-- Collect stats after test run
SELECT pg_stat_force_next_flush();
SELECT pg_sleep(2);

\echo '=== Database-level stats ==='
SELECT tup_returned, tup_fetched,
       round(tup_returned::numeric / nullif(tup_fetched, 0), 2) as ratio
FROM pg_stat_database WHERE datname = current_database();

\echo '=== Table-level stats ==='
SELECT seq_tup_read, idx_tup_fetch, n_dead_tup, n_live_tup
FROM pg_stat_user_tables WHERE relname = 'test_records';

\echo '=== Index-level stats ==='
SELECT indexrelname,
       idx_tup_read,
       idx_tup_fetch,
       round(idx_tup_read::numeric / nullif(idx_tup_fetch, 0), 2) as ratio
FROM pg_stat_user_indexes WHERE relname = 'test_records'
ORDER BY indexrelname;
