-- Setup: create table, indexes, insert data, reset stats
DROP TABLE IF EXISTS test_records;

CREATE TABLE test_records (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    external_id varchar(255) NOT NULL,
    connection_id integer NOT NULL,
    model varchar(255) NOT NULL,
    data_hash varchar(255) NOT NULL,
    deleted_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT NOW(),
    sync_job_id integer NOT NULL,
    json jsonb DEFAULT '{"some": "data", "padding": "abcdefghijklmnopqrstuvwxyz0123456789"}'::jsonb,
    PRIMARY KEY (id)
);

CREATE INDEX idx_test_records_main ON test_records(connection_id, model, updated_at, id);
CREATE UNIQUE INDEX idx_test_records_unique ON test_records(connection_id, model, external_id);

-- Index with id as KEY column (not INCLUDE) to support cursor-based scanning
CREATE INDEX idx_test_records_outdated ON test_records(connection_id, model, sync_job_id, id)
    WHERE deleted_at IS NULL;

-- Disable autovacuum so dead tuples accumulate (simulates vacuum lag under load)
ALTER TABLE test_records SET (autovacuum_enabled = false);

-- Insert 500K rows: 10 connections x 50K rows each, all with sync_job_id=1
INSERT INTO test_records (external_id, connection_id, model, data_hash, sync_job_id)
SELECT 'ext_' || i, conn_id, 'contacts', md5(i::text), 1
FROM generate_series(1, 50000) AS i,
     generate_series(1, 10) AS conn_id;

-- Reset stats
SELECT pg_stat_reset();
SELECT pg_sleep(2);

SELECT 'BEFORE' as phase, tup_returned, tup_fetched
FROM pg_stat_database WHERE datname = current_database();

\echo 'Setup complete: 500K rows, 10 connections, autovacuum disabled'
