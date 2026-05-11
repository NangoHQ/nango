-- Worker WITHOUT cursor: scans from beginning of index each batch
-- Simulates current deleteOutdatedRecords behavior
-- Pass connection_id via: psql -v conn_id=1

-- Batch 1
UPDATE test_records SET deleted_at = NOW(), updated_at = NOW(), sync_job_id = 2
WHERE id IN (SELECT id FROM test_records WHERE connection_id = :conn_id AND model = 'contacts' AND deleted_at IS NULL AND sync_job_id < 2 LIMIT 5000);

-- Batch 2
UPDATE test_records SET deleted_at = NOW(), updated_at = NOW(), sync_job_id = 2
WHERE id IN (SELECT id FROM test_records WHERE connection_id = :conn_id AND model = 'contacts' AND deleted_at IS NULL AND sync_job_id < 2 LIMIT 5000);

-- Batch 3
UPDATE test_records SET deleted_at = NOW(), updated_at = NOW(), sync_job_id = 2
WHERE id IN (SELECT id FROM test_records WHERE connection_id = :conn_id AND model = 'contacts' AND deleted_at IS NULL AND sync_job_id < 2 LIMIT 5000);

-- Batch 4
UPDATE test_records SET deleted_at = NOW(), updated_at = NOW(), sync_job_id = 2
WHERE id IN (SELECT id FROM test_records WHERE connection_id = :conn_id AND model = 'contacts' AND deleted_at IS NULL AND sync_job_id < 2 LIMIT 5000);

-- Batch 5
UPDATE test_records SET deleted_at = NOW(), updated_at = NOW(), sync_job_id = 2
WHERE id IN (SELECT id FROM test_records WHERE connection_id = :conn_id AND model = 'contacts' AND deleted_at IS NULL AND sync_job_id < 2 LIMIT 5000);

-- Batch 6
UPDATE test_records SET deleted_at = NOW(), updated_at = NOW(), sync_job_id = 2
WHERE id IN (SELECT id FROM test_records WHERE connection_id = :conn_id AND model = 'contacts' AND deleted_at IS NULL AND sync_job_id < 2 LIMIT 5000);

-- Batch 7
UPDATE test_records SET deleted_at = NOW(), updated_at = NOW(), sync_job_id = 2
WHERE id IN (SELECT id FROM test_records WHERE connection_id = :conn_id AND model = 'contacts' AND deleted_at IS NULL AND sync_job_id < 2 LIMIT 5000);

-- Batch 8
UPDATE test_records SET deleted_at = NOW(), updated_at = NOW(), sync_job_id = 2
WHERE id IN (SELECT id FROM test_records WHERE connection_id = :conn_id AND model = 'contacts' AND deleted_at IS NULL AND sync_job_id < 2 LIMIT 5000);

-- Batch 9
UPDATE test_records SET deleted_at = NOW(), updated_at = NOW(), sync_job_id = 2
WHERE id IN (SELECT id FROM test_records WHERE connection_id = :conn_id AND model = 'contacts' AND deleted_at IS NULL AND sync_job_id < 2 LIMIT 5000);

-- Batch 10
UPDATE test_records SET deleted_at = NOW(), updated_at = NOW(), sync_job_id = 2
WHERE id IN (SELECT id FROM test_records WHERE connection_id = :conn_id AND model = 'contacts' AND deleted_at IS NULL AND sync_job_id < 2 LIMIT 5000);
