#!/bin/bash
# Worker WITH cursor: resumes from (sync_job_id, id) of previous batch
# Simulates proposed fix for deleteOutdatedRecords
# Usage: bash 04_worker_cursor.sh <connection_id>

CONN_ID=$1
LAST_SYNC_JOB_ID=""
LAST_ID=""

for batch in $(seq 1 10); do
    if [ -z "$LAST_ID" ]; then
        # First batch: no cursor
        RESULT=$(psql -t -A -F'|' -c "
            WITH to_delete AS (
                SELECT id, sync_job_id as original_sync_job_id
                FROM test_records
                WHERE connection_id = $CONN_ID AND model = 'contacts'
                  AND deleted_at IS NULL AND sync_job_id < 2
                ORDER BY sync_job_id, id
                LIMIT 5000
            ),
            deleted AS (
                UPDATE test_records SET deleted_at = NOW(), updated_at = NOW(), sync_job_id = 2
                WHERE id IN (SELECT id FROM to_delete)
                RETURNING id
            )
            SELECT original_sync_job_id, to_delete.id
            FROM to_delete
            ORDER BY original_sync_job_id DESC, to_delete.id DESC
            LIMIT 1;
        " 2>/dev/null)
    else
        # Subsequent batches: resume from cursor
        RESULT=$(psql -t -A -F'|' -c "
            WITH to_delete AS (
                SELECT id, sync_job_id as original_sync_job_id
                FROM test_records
                WHERE connection_id = $CONN_ID AND model = 'contacts'
                  AND deleted_at IS NULL AND sync_job_id < 2
                  AND (sync_job_id, id) > ($LAST_SYNC_JOB_ID, '$LAST_ID')
                ORDER BY sync_job_id, id
                LIMIT 5000
            ),
            deleted AS (
                UPDATE test_records SET deleted_at = NOW(), updated_at = NOW(), sync_job_id = 2
                WHERE id IN (SELECT id FROM to_delete)
                RETURNING id
            )
            SELECT original_sync_job_id, to_delete.id
            FROM to_delete
            ORDER BY original_sync_job_id DESC, to_delete.id DESC
            LIMIT 1;
        " 2>/dev/null)
    fi
    LAST_SYNC_JOB_ID=$(echo "$RESULT" | cut -d'|' -f1)
    LAST_ID=$(echo "$RESULT" | cut -d'|' -f2)
done
