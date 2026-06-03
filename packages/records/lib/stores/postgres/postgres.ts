import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import tracer from 'dd-trace';
import knex from 'knex';

import { Err, Ok, cancellableDaemon, retry, stringToHash } from '@nangohq/utils';

import { DEFAULT_RECORDS_LIMIT, RECORDS_DATA_TABLE, RECORDS_SEEN_TABLE, RECORDS_TABLE, RECORD_COUNTS_TABLE } from '../../constants.js';
import { Cursor } from '../../cursor.js';
import { envs } from '../../env.js';
import { deepMergeRecordData } from '../../helpers/merge.js';
import { getUniqueId, removeDuplicateKey } from '../../helpers/uniqueKey.js';
import { decryptRecordData, encryptRecords } from '../../utils/encryption.js';
import { logger } from '../../utils/logger.js';

import type { RecordsStore } from '../../store.js';
import type {
    CombinedFilterAction,
    FormattedRecord,
    FormattedRecordWithMetadata,
    GetRecordsResponse,
    LastAction,
    RecordCount,
    ReturnedRecord,
    UpsertSummary
} from '../../types.js';
import type { CursorOffset, MergingStrategy } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

dayjs.extend(utc);

const BATCH_SIZE = envs.RECORDS_BATCH_SIZE;

interface UpsertedMetadata {
    partition: string;
    external_id: string;
    id: string;
    last_modified_at: string;
    previous_last_modified_at: string | null;
    needs_data_write: boolean;
    legacy_size_bytes: number;
    existing_size_bytes: number | null;
    status: 'inserted' | 'changed' | 'undeleted' | 'deleted' | 'unchanged';
}

export class PostgresStore implements RecordsStore {
    private db: Knex;
    private dbRead: Knex;
    private readonly migrationsConfig: Knex.MigratorConfig;
    private seenPartitionPromises = new Map<string, Promise<void>>();
    private daemon: { abort: () => Promise<void> } | null = null;

    constructor(config: Knex.Config & { migrations: Knex.MigratorConfig }, configRead?: Knex.Config) {
        this.db = knex(config);
        this.dbRead = configRead ? knex(configRead) : this.db;
        this.migrationsConfig = config.migrations;
    }

    async migrate(): Promise<void> {
        logger.info('[records] migration');
        const filename = fileURLToPath(import.meta.url);
        const packagesDir = path.dirname(path.join(filename, '../../../'));
        const dir = path.join(packagesDir, 'dist/stores/postgres/migrations');
        const schema = this.migrationsConfig.schemaName;
        if (schema) {
            await this.db.raw(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
        }
        const [, pendingMigrations] = (await this.db.migrate.list({ ...this.migrationsConfig, directory: dir })) as [unknown, string[]];
        if (pendingMigrations.length === 0) {
            logger.info('[records] nothing to do');
            return;
        }
        await this.db.migrate.latest({ ...this.migrationsConfig, directory: dir });
        logger.info('[records] migrations completed.');
    }

    startDaemons(): void {
        const tickIntervalMs = envs.RECORDS_POSTGRES_SEEN_PARTITION_INTERVAL_MS;
        const maxAgeMs = envs.RECORDS_POSTGRES_SEEN_PARTITION_MAX_AGE_MS;
        this.daemon = cancellableDaemon({
            tickIntervalMs,
            tick: async () => {
                return tracer.trace('nango.records.daemon.seenPartition', async (span) => {
                    try {
                        const olderThan = new Date(Date.now() - maxAgeMs);
                        const ensureRes = await this.ensureSeenPartition({ date: dayjs().add(1, 'day').toDate() });
                        if (ensureRes.isErr()) {
                            span?.addTags({ error: ensureRes.error.message });
                            logger.error(`[Seen partition] error ensuring seen partition: ${ensureRes.error.message}`);
                        }
                        const dropRes = await this.dropSeenPartition({ date: dayjs(olderThan).subtract(1, 'day').toDate() });
                        if (dropRes.isErr()) {
                            span?.addTags({ error: dropRes.error.message });
                            logger.error(`[Seen partition] error dropping seen partition: ${dropRes.error.message}`);
                        }
                    } finally {
                        span?.finish();
                    }
                });
            },
            onError: (err) => {
                logger.error(`[Seen partition] unexpected error: ${(err as Error).message}`);
            }
        });
    }

    async close(): Promise<void> {
        await this.daemon?.abort();
        await this.db.destroy();
        if (this.dbRead !== this.db) {
            await this.dbRead.destroy();
        }
    }

    async ensureSeenPartition({ date }: { date: Date }): Promise<Result<void>> {
        const day = dayjs(date).utc().startOf('day');
        const suffix = day.format('YYYYMMDD');

        let promise = this.seenPartitionPromises.get(suffix);
        try {
            if (!promise) {
                const next = day.add(1, 'day');
                const partitionName = `records_seen_${suffix}`;
                const indexName = `${partitionName}_connection_model_generation`;
                // Create the (connection_id, model, generation) child index inline so every new
                // partition is born ready for the read-path switch in a later phase. Two separate
                // statements so the parent's ACCESS EXCLUSIVE from CREATE TABLE PARTITION OF is
                // released before the child index build runs — the partition is empty, so the
                // (non-CONCURRENTLY) index build is fast and the child's ACCESS EXCLUSIVE stays
                // catalog-only.
                promise = this.db
                    .raw(
                        `CREATE TABLE IF NOT EXISTS "${partitionName}" PARTITION OF "${RECORDS_SEEN_TABLE}" FOR VALUES FROM ('${day.toISOString()}') TO ('${next.toISOString()}')`
                    )
                    .then(() => this.db.raw('CREATE INDEX IF NOT EXISTS ?? ON ?? (connection_id, model, generation)', [indexName, partitionName]))
                    .then(() => undefined);
                this.seenPartitionPromises.set(suffix, promise);
            }
            await promise;
            return Ok(undefined);
        } catch (err) {
            if (this.seenPartitionPromises.get(suffix) === promise) {
                this.seenPartitionPromises.delete(suffix);
            }
            return Err(new Error('Failed to ensure seen partition', { cause: err }));
        }
    }

    async dropSeenPartition({ date }: { date: Date }): Promise<Result<void>> {
        const suffix = dayjs(date).utc().startOf('day').format('YYYYMMDD');
        try {
            return await this.db.transaction(async (trx) => {
                // advisory lock scoped to this partition date — concurrent instances skip instead of racing
                const lockKey = stringToHash(`records_seen_drop:${suffix}`);
                const { rows } = await trx.raw<{ rows: { lock: boolean }[] }>(`SELECT pg_try_advisory_xact_lock(?) as lock`, [lockKey]);
                if (!rows?.[0]?.lock) {
                    return Ok(undefined);
                }
                await trx.raw(`DROP TABLE IF EXISTS "records_seen_${suffix}"`);
                return Ok(undefined);
            });
        } catch (err) {
            return Err(new Error('Failed to drop seen partition', { cause: err }));
        }
    }

    /**
     * Get Records is using the read replicas (when possible)
     */
    async getRecords({
        connectionId,
        model,
        modifiedAfter,
        limit,
        filter,
        cursor,
        externalIds
    }: {
        connectionId: number;
        model: string;
        modifiedAfter?: string | undefined;
        limit?: number | undefined;
        filter?: CombinedFilterAction | LastAction | undefined;
        cursor?: string | undefined;
        externalIds?: string[] | undefined;
    }): Promise<Result<GetRecordsResponse>> {
        const activeSpan = tracer.scope().active();
        const span = tracer.startSpan('nango.records.getRecords', {
            ...(activeSpan ? { childOf: activeSpan } : {}),
            tags: { 'nango.connectionId': connectionId, 'nango.model': model }
        });
        const results: ReturnedRecord[] = [];
        try {
            if (!model) {
                const error = new Error('missing_model');
                return Err(error);
            }

            let query = this.dbRead
                .from<FormattedRecord>(RECORDS_TABLE)
                .timeout(60000) // timeout after 1 minute
                .where({ connection_id: connectionId, model })
                .orderBy([
                    { column: 'updated_at', order: 'asc' },
                    { column: 'id', order: 'asc' }
                ]);

            if (cursor) {
                const decodedCursor = Cursor.from(cursor);
                if (!decodedCursor) {
                    const error = new Error('invalid_cursor_value');
                    return Err(error);
                }

                // Tuple comparison for efficient index usage
                query = query.whereRaw(`(updated_at, id) > (?, ?)`, [decodedCursor.sort, decodedCursor.id]);
            }

            if (externalIds) {
                // postgresql does not support null bytes in strings
                const cleanIds = externalIds.map((id) => id.replaceAll('\x00', ''));
                query = query.whereIn('external_id', cleanIds);
            }

            if (limit) {
                if (isNaN(Number(limit))) {
                    const error = new Error('invalid_limit');
                    return Err(error);
                }
                // +1: fetch one extra row to detect "has more pages".
                query = query.limit(Number(limit) + 1);
            } else {
                query = query.limit(DEFAULT_RECORDS_LIMIT + 1);
            }

            if (modifiedAfter) {
                const time = dayjs(modifiedAfter);

                if (!time.isValid()) {
                    const error = new Error('invalid_timestamp');
                    return Err(error);
                }

                const formattedDelta = time.toISOString();

                query = query.andWhere('updated_at', '>=', formattedDelta);
            }

            if (filter) {
                const dbRead = this.dbRead;
                const formattedFilter = filter.toUpperCase();
                switch (true) {
                    case formattedFilter.includes('ADDED') && formattedFilter.includes('UPDATED'):
                        query = query.andWhere('deleted_at', null).andWhere(function () {
                            void this.where('created_at', '=', dbRead.raw('updated_at')).orWhere('created_at', '!=', dbRead.raw('updated_at'));
                        });
                        break;
                    case formattedFilter.includes('UPDATED') && formattedFilter.includes('DELETED'):
                        query = query.andWhere(function () {
                            void this.where('deleted_at', null).andWhere('created_at', '!=', dbRead.raw('updated_at'));
                        });
                        break;
                    case formattedFilter.includes('ADDED') && formattedFilter.includes('DELETED'):
                        query = query.andWhere(function () {
                            void this.where('deleted_at', null).andWhere('created_at', '=', dbRead.raw('updated_at'));
                        });
                        break;
                    case formattedFilter === 'ADDED':
                        query = query.andWhere('deleted_at', null).andWhere('created_at', '=', dbRead.raw('updated_at'));
                        break;
                    case formattedFilter === 'UPDATED':
                        query = query.andWhere('deleted_at', null).andWhere('created_at', '!=', dbRead.raw('updated_at'));
                        break;
                    case formattedFilter === 'DELETED':
                        query = query.andWhereNot({ deleted_at: null });
                        break;
                }
            }

            const budgetBytes = envs.RECORDS_MAX_RESPONSE_SIZE_BYTES;
            const budgetEnabled = budgetBytes > 0;

            const recordsMetadata: (FormattedRecordWithMetadata & { size: number })[] = await query.select(
                // PostgreSQL stores timestamp with microseconds precision
                // however, javascript date only supports milliseconds precision
                // we therefore convert timestamp to string (using to_json()) in order to avoid precision loss
                this.dbRead.raw(`
                    tableoid::regclass as partition,
                    id,
                    external_id,
                    json,
                    to_json(created_at) as first_seen_at,
                    to_json(updated_at) as last_modified_at,
                    to_json(deleted_at) as deleted_at,
                    to_json(pruned_at) as pruned_at,
                    CASE
                        WHEN deleted_at IS NOT NULL THEN 'DELETED'
                        WHEN created_at = updated_at THEN 'ADDED'
                        ELSE 'UPDATED'
                    END as last_action,
                    COALESCE(size_bytes, 0) as size
                `)
            );

            if (recordsMetadata.length === 0) {
                return Ok({ records: [], next_cursor: null });
            }

            const limitPlus1 = (limit ? Number(limit) : DEFAULT_RECORDS_LIMIT) + 1;
            let hasMore = recordsMetadata.length >= limitPlus1;
            let budgetTruncated = false;
            if (hasMore) {
                recordsMetadata.pop();
            }
            let budgetTotalBytes = 0;
            if (budgetEnabled) {
                let acc = 0;
                let truncateAt: number | null = null;
                for (let i = 0; i < recordsMetadata.length; i++) {
                    const sz = recordsMetadata[i]!.size;
                    budgetTotalBytes += sz;
                    if (truncateAt !== null) continue;
                    // i > 0: always keep at least one record so pagination can progress past oversized rows.
                    if (i > 0 && acc + sz > budgetBytes) {
                        truncateAt = i;
                        continue;
                    }
                    acc += sz;
                }
                if (truncateAt !== null) {
                    budgetTruncated = true;
                    if (!envs.RECORDS_MAX_RESPONSE_SIZE_DRY_RUN) {
                        recordsMetadata.splice(truncateAt);
                        hasMore = true;
                    }
                    span.addTags({
                        'nango.records.budgetTruncated': true,
                        'nango.records.budgetKeptBytes': acc,
                        'nango.records.budgetTotalBytes': budgetTotalBytes,
                        'nango.records.budgetDryRun': envs.RECORDS_MAX_RESPONSE_SIZE_DRY_RUN
                    });
                }
            }

            const recordIds = recordsMetadata.map((r) => r.id);
            const dataById = new Map<string, FormattedRecord['json']>();
            {
                // Drain the result rows into the Map and let the array go out of scope.
                // Keeping both the array and the Map doubles the reference count on each
                // encrypted blob, which prevents `dataById.delete()` below from making
                // them eligible for GC during the loop.
                const rows = await this.dbRead
                    .from(RECORDS_DATA_TABLE)
                    .where({ connection_id: connectionId, model })
                    .whereIn('id', recordIds)
                    .select<{ id: string; data: FormattedRecord['json'] }[]>('id', 'data');
                while (rows.length > 0) {
                    const r = rows.pop()!;
                    dataById.set(r.id, r.data);
                }
            }

            const decryptSpan = tracer.startSpan('nango.records.decrypt', { childOf: span });
            try {
                // TODO: decrypt in batch
                for (const item of recordsMetadata) {
                    const data = dataById.get(item.id) ?? item.json ?? {};
                    // Drop the only remaining reference to the encrypted blob so V8 can
                    // reclaim it when GC fires under heap pressure.
                    dataById.delete(item.id);
                    const decryptedData = await decryptRecordData({ ...item, json: data });
                    results.push({
                        ...decryptedData,
                        id: item.external_id, // record payload can be empty (when pruned), always use external_id as id
                        _nango_metadata: {
                            first_seen_at: item.first_seen_at,
                            last_modified_at: item.last_modified_at,
                            last_action: item.last_action,
                            deleted_at: item.deleted_at,
                            pruned_at: item.pruned_at,
                            cursor: Cursor.new(item)
                        }
                    });
                }
            } finally {
                decryptSpan.finish();
            }

            // all records for the same connection/model are in the same partition
            const partition = recordsMetadata[0]?.partition;
            if (span && partition) {
                span.setTag('nango.partition', partition);
            }

            if (hasMore) {
                const cursorRawElement = recordsMetadata[recordsMetadata.length - 1];
                if (cursorRawElement) {
                    return Ok({
                        records: results,
                        next_cursor: Cursor.new(cursorRawElement),
                        ...(budgetTruncated ? { budgetTruncated } : {})
                    });
                }
            }

            return Ok({
                records: results,
                next_cursor: null,
                ...(budgetTruncated ? { budgetTruncated } : {})
            });
        } catch (err) {
            const e = new Error(`List records error for model ${model}`, { cause: err });
            span.setTag('error', e);
            return Err(e);
        } finally {
            span.setTag('records.count', results.length);
            span.finish();
        }
    }

    async getCursor({ connectionId, model, offset }: { connectionId: number; model: string; offset: CursorOffset }): Promise<Result<string | undefined>> {
        const activeSpan = tracer.scope().active();
        const span = tracer.startSpan('nango.records.getCursor', {
            ...(activeSpan ? { childOf: activeSpan } : {}),
            tags: { 'nango.connectionId': connectionId, 'nango.model': model }
        });
        try {
            const query = this.db
                .from(RECORDS_TABLE)
                .select<{ id: string; last_modified_at: string; partition: string }[]>(
                    // PostgreSQL stores timestamp with microseconds precision
                    // however, javascript date only supports milliseconds precision
                    // we therefore convert timestamp to string (using to_json()) in order to avoid precision loss
                    this.db.raw(`
                        id,
                        to_json(updated_at) as last_modified_at,
                        tableoid::regclass as partition
                    `)
                )
                .where({
                    connection_id: connectionId,
                    model
                })
                .orderBy([
                    { column: 'updated_at', order: offset === 'first' ? 'asc' : 'desc' },
                    { column: 'id', order: offset === 'first' ? 'asc' : 'desc' }
                ])
                .limit(1);

            const [record] = await query;

            if (!record) {
                return Ok(undefined);
            }
            span.setTag('nango.partition', record.partition);
            return Ok(Cursor.new(record));
        } catch (err) {
            span.setTag('error', err);
            return Err(new Error(`Error getting cursor for offset ${offset}`, { cause: err }));
        } finally {
            span.finish();
        }
    }

    async upsert({
        records,
        connectionId,
        environmentId,
        model,
        softDelete = false,
        merging = { strategy: 'override' }
    }: {
        records: FormattedRecord[];
        connectionId: number;
        environmentId: number;
        model: string;
        softDelete?: boolean;
        merging?: MergingStrategy;
    }): Promise<Result<UpsertSummary>> {
        const activeSpan = tracer.scope().active();
        const span = tracer.startSpan('nango.records.upsert', {
            ...(activeSpan ? { childOf: activeSpan } : {}),
            tags: { 'nango.connectionId': connectionId, 'nango.model': model, 'nango.softDelete': softDelete }
        });
        let partition: string | undefined = undefined;

        const { records: recordsWithoutDuplicates, nonUniqueKeys } = removeDuplicateKey(records);
        try {
            if (!recordsWithoutDuplicates || recordsWithoutDuplicates.length === 0) {
                return Err(
                    `There are no records to upsert because there were no records that were not duplicates to insert, but there were ${records.length} records received for the "${model}" model.`
                );
            }
            return await retry(
                () => {
                    return this.db.transaction(async (trx) => {
                        // Lock to prevent concurrent upserts
                        await acquireAdvisoryLock(trx, { name: `lock_records_${softDelete ? 'delete' : 'upsert'}`, connectionId, model });

                        const summary: UpsertSummary = {
                            addedKeys: [],
                            updatedKeys: [],
                            deletedKeys: [],
                            nonUniqueKeys,
                            nextMerging: merging,
                            activatedKeys: [],
                            unchangedKeys: []
                        };
                        let deltaSizeInBytes = 0;
                        const cursor = merging.strategy === 'ignore_if_modified_after_cursor' && merging.cursor ? Cursor.from(merging.cursor) : undefined;
                        for (let i = 0; i < recordsWithoutDuplicates.length; i += BATCH_SIZE) {
                            const chunk = recordsWithoutDuplicates.slice(i, i + BATCH_SIZE);
                            const hasUpdatedAt = chunk.some((r) => r.updated_at); // updated_at is only set explicitely for soft-deleting all the records
                            const incomingColumns = hasUpdatedAt
                                ? 'connection_id, model, id, external_id, data_hash, sync_id, sync_job_id, deleted_at, updated_at'
                                : 'connection_id, model, id, external_id, data_hash, sync_id, sync_job_id, deleted_at';
                            const incomingPlaceholders = chunk
                                .map(() =>
                                    hasUpdatedAt
                                        ? '(?::integer, ?::text, ?::uuid, ?::text, ?::text, ?::uuid, ?::integer, ?::timestamptz, ?::timestamptz)'
                                        : '(?::integer, ?::text, ?::uuid, ?::text, ?::text, ?::uuid, ?::integer, ?::timestamptz)'
                                )
                                .join(', ');
                            const incomingBindings = chunk.flatMap((r) => [
                                r.connection_id,
                                r.model,
                                r.id,
                                r.external_id,
                                r.data_hash,
                                r.sync_id,
                                r.sync_job_id,
                                r.deleted_at ?? null,
                                ...(hasUpdatedAt ? [r.updated_at ?? null] : [])
                            ]);
                            const upsertMetadata = (
                                await trx.raw(
                                    `
                                WITH incoming AS (
                                    SELECT * FROM (VALUES ${incomingPlaceholders}) AS t(${incomingColumns})
                                ),
                                classified AS MATERIALIZED (
                                    SELECT
                                        incoming.connection_id,
                                        incoming.model,
                                        incoming.id,
                                        incoming.external_id,
                                        incoming.data_hash,
                                        incoming.sync_id,
                                        incoming.sync_job_id,
                                        incoming.deleted_at,
                                        ${hasUpdatedAt ? 'incoming.updated_at,' : ''}
                                        r.id as existing_id,
                                        r.deleted_at as existing_deleted_at,
                                        r.updated_at as existing_updated_at,
                                        to_json(r.updated_at) as previous_last_modified_at,
                                        COALESCE(pg_column_size(r.json), 0) as legacy_size_bytes,
                                        r.size_bytes as existing_size_bytes,
                                        r.tableoid::regclass as existing_partition,
                                        (r.external_id IS NULL OR incoming.data_hash IS DISTINCT FROM r.data_hash OR r.json IS NOT NULL OR r.pruned_at IS NOT NULL) as needs_data_write,
                                        (
                                            r.external_id IS NULL
                                            OR (
                                                ${cursor ? '(r.updated_at, r.id) <= (?, ?)' : 'true'}
                                                AND (
                                                    incoming.data_hash IS DISTINCT FROM r.data_hash
                                                    OR incoming.deleted_at IS DISTINCT FROM r.deleted_at
                                                    OR r.json IS NOT NULL
                                                    OR r.pruned_at IS NOT NULL
                                                )
                                            )
                                        ) as should_upsert,
                                        CASE
                                            WHEN r.external_id IS NULL THEN 'inserted'
                                            WHEN r.deleted_at IS NOT NULL AND incoming.deleted_at IS NULL THEN 'undeleted'
                                            WHEN r.deleted_at IS NULL AND incoming.deleted_at IS NOT NULL THEN 'deleted'
                                            WHEN incoming.data_hash IS DISTINCT FROM r.data_hash THEN 'changed'
                                            ELSE 'unchanged'
                                        END as status
                                    FROM incoming
                                    LEFT JOIN ${RECORDS_TABLE} r
                                        ON r.connection_id = ?
                                       AND r.model = ?
                                       AND r.external_id = incoming.external_id
                                ),
                                upsert AS (
                                    INSERT INTO ${RECORDS_TABLE} (
                                        connection_id,
                                        model,
                                        id,
                                        external_id,
                                        json,
                                        data_hash,
                                        sync_id,
                                        sync_job_id,
                                        deleted_at,
                                        pruned_at
                                        ${hasUpdatedAt ? ', updated_at' : ''}
                                    )
                                    SELECT
                                        connection_id,
                                        model,
                                        id,
                                        external_id,
                                        NULL::jsonb,
                                        data_hash,
                                        sync_id,
                                        sync_job_id,
                                        deleted_at,
                                        NULL::timestamptz
                                        ${hasUpdatedAt ? ', updated_at' : ''}
                                    FROM classified
                                    WHERE should_upsert
                                    ON CONFLICT (connection_id, model, external_id)
                                    DO UPDATE SET
                                        id = EXCLUDED.id,
                                        json = EXCLUDED.json,
                                        data_hash = EXCLUDED.data_hash,
                                        sync_id = EXCLUDED.sync_id,
                                        sync_job_id = EXCLUDED.sync_job_id,
                                        deleted_at = EXCLUDED.deleted_at,
                                        pruned_at = EXCLUDED.pruned_at
                                        ${hasUpdatedAt ? ', updated_at = EXCLUDED.updated_at' : ''}
                                    RETURNING
                                        id,
                                        external_id,
                                        updated_at,
                                        tableoid::regclass as partition
                                ),
                                combined AS (
                                    SELECT
                                        partition,
                                        id,
                                        external_id,
                                        updated_at,
                                        true as was_upserted
                                    FROM upsert
                                    UNION ALL
                                    SELECT
                                        existing_partition as partition,
                                        existing_id as id,
                                        external_id,
                                        existing_updated_at as updated_at,
                                        false as was_upserted
                                    FROM classified
                                    WHERE NOT should_upsert
                                      AND NOT needs_data_write
                                      AND existing_id IS NOT NULL
                                )
                                SELECT
                                    combined.partition,
                                    combined.id,
                                    combined.external_id,
                                    to_json(combined.updated_at) as last_modified_at,
                                    classified.previous_last_modified_at,
                                    classified.needs_data_write,
                                    classified.legacy_size_bytes,
                                    classified.existing_size_bytes,
                                    CASE WHEN combined.was_upserted THEN classified.status ELSE 'unchanged' END as status
                                FROM combined
                                JOIN classified ON classified.external_id = combined.external_id
                                ORDER BY combined.updated_at ASC, combined.id ASC
                                `,
                                    [...incomingBindings, ...(cursor ? [cursor.sort, cursor.id] : []), connectionId, model]
                                )
                            ).rows as UpsertedMetadata[];

                            const needsDataWriteIds = new Set(upsertMetadata.filter((r) => r.needs_data_write).map((r) => r.id));
                            const recordsToUpdateData = encryptRecords(chunk.filter((r) => needsDataWriteIds.has(r.id)));

                            let batchDeltaSizeInBytes = 0;
                            if (recordsToUpdateData.length > 0) {
                                const totalLegacySizeInBytes = upsertMetadata.reduce((acc, r) => {
                                    if (r.needs_data_write) {
                                        return acc + r.legacy_size_bytes;
                                    }
                                    return acc;
                                }, 0);
                                const unknownSizeIds = upsertMetadata.filter((r) => r.needs_data_write && r.existing_size_bytes === null).map((r) => r.id);
                                const knownSizes = upsertMetadata.filter((r) => r.needs_data_write && r.existing_size_bytes !== null);
                                const [upsertDataResult] = await trx
                                    .with('unknown_existing_size', (qb) => {
                                        qb.select('id', trx.raw('pg_column_size(data) as prev_size_bytes'))
                                            .from(RECORDS_DATA_TABLE)
                                            .where({ connection_id: connectionId, model })
                                            .whereIn('id', unknownSizeIds);
                                    })
                                    .with('upsert_data', (qb) => {
                                        qb.insert(
                                            recordsToUpdateData.map((r) => ({
                                                id: r.id,
                                                connection_id: r.connection_id,
                                                model: r.model,
                                                data: r.json
                                            }))
                                        )
                                            .into(RECORDS_DATA_TABLE)
                                            .onConflict(['connection_id', 'model', 'id'])
                                            .merge(['data'])
                                            .returning<{ id: string; new_size_bytes: number }[]>(['id', trx.raw('pg_column_size(data) as new_size_bytes')]);
                                    })
                                    .with(
                                        'update_size',
                                        trx.raw(
                                            `UPDATE ${RECORDS_TABLE} r SET size_bytes = upsert_data.new_size_bytes FROM upsert_data WHERE r.id = upsert_data.id AND r.connection_id = ? AND r.model = ?`,
                                            [connectionId, model]
                                        )
                                    )
                                    .select<{ delta_size_bytes: number | string }[]>(
                                        trx.raw(
                                            'COALESCE(SUM(upsert_data.new_size_bytes - COALESCE(unknown_existing_size.prev_size_bytes, 0)), 0)::double precision as delta_size_bytes'
                                        )
                                    )
                                    .from('upsert_data')
                                    .leftJoin('unknown_existing_size', 'unknown_existing_size.id', 'upsert_data.id');

                                const knownSizesTotal = knownSizes.reduce((acc, r) => acc + (r.existing_size_bytes ?? 0), 0);
                                batchDeltaSizeInBytes = Number(upsertDataResult?.delta_size_bytes ?? 0) - knownSizesTotal - totalLegacySizeInBytes;
                            }

                            // insert batch entry with all seen record ids (including unchanged)
                            await this.insertSeenEntry(trx, {
                                connectionId,
                                model,
                                syncJobId: chunk[0]!.sync_job_id,
                                recordIds: chunk.map((r) => r.id)
                            });

                            // Billing:
                            // A record is billed only once per month. ie:
                            // - If a record is inserted, it is billed
                            // - If a record is updated, it is billed if it has not been billed yet during the current month
                            // - If a record is undeleted, it is not billed
                            // - If a record is deleted, it is not billed

                            if (softDelete) {
                                const deleted = upsertMetadata.filter((r) => r.status === 'deleted');
                                summary.deletedKeys?.push(...deleted.map((r) => r.external_id));
                            } else {
                                const undeletedRes = upsertMetadata.filter((r) => r.status === 'undeleted');
                                const changedRes = upsertMetadata.filter((r) => r.status === 'changed');

                                const insertedKeys = upsertMetadata.filter((r) => r.status === 'inserted').map((r) => r.external_id);
                                const undeletedKeys = undeletedRes.map((r) => r.external_id);
                                const addedKeys = insertedKeys.concat(undeletedKeys);
                                const updatedKeys = changedRes.map((r) => r.external_id);
                                const activatedKeys = [...insertedKeys, ...getInactiveThisMonth(changedRes).map((r) => r.external_id)];

                                summary.addedKeys.push(...addedKeys);
                                summary.updatedKeys.push(...updatedKeys);
                                summary.activatedKeys.push(...activatedKeys);
                                summary.unchangedKeys.push(...upsertMetadata.filter((r) => r.status === 'unchanged').map((r) => r.external_id));
                            }

                            if (merging.strategy === 'ignore_if_modified_after_cursor') {
                                // Next cursor is the last MODIFIED record
                                const getLastModifiedRecord = (records: UpsertedMetadata[]): UpsertedMetadata | undefined => {
                                    for (let i = records.length - 1; i >= 0; i--) {
                                        if (records[i]?.status !== 'unchanged') {
                                            return records[i];
                                        }
                                    }
                                    return undefined;
                                };
                                const lastRecord = getLastModifiedRecord(upsertMetadata);
                                if (lastRecord) {
                                    summary.nextMerging = {
                                        strategy: merging.strategy,
                                        cursor: Cursor.new(lastRecord)
                                    };
                                }
                            }
                            deltaSizeInBytes += batchDeltaSizeInBytes;

                            // all records for the same connection/model are in the same partition
                            if (!partition && upsertMetadata[0]?.partition) {
                                partition = upsertMetadata[0].partition;
                            }
                        }
                        const delta = summary.addedKeys.length - (summary.deletedKeys?.length ?? 0);
                        await incrCount(trx, {
                            connectionId,
                            environmentId,
                            model,
                            delta,
                            deltaSizeInBytes
                        });
                        if (partition) {
                            span.setTag('nango.partition', partition);
                        }
                        return Ok(summary);
                    });
                },
                // Retry if deadlock detected
                // https://www.postgresql.org/docs/current/mvcc-serialization-failure-handling.html
                {
                    maxAttempts: 3,
                    delayMs: 500,
                    retryOnError: (err) => {
                        if ('code' in err) {
                            const errorCode = (err as { code: string }).code;
                            return errorCode === '40P01'; // deadlock_detected
                        }
                        return false;
                    }
                }
            );
        } catch (err: any) {
            if (err instanceof LockError) {
                span.setTag('error', err);
                return Err(err);
            }
            let errorMessage = `Failed to upsert ${recordsWithoutDuplicates.length} records. (connectionId: ${connectionId}, model: ${model})\n`;

            if ('code' in err) {
                const errorCode = (err as { code: string }).code;
                errorMessage += `Error code: ${errorCode}.\n`;
                let errorDetail = '';
                switch (errorCode) {
                    case '22001': {
                        errorDetail = "String length exceeds the column's maximum length (string_data_right_truncation)";
                        break;
                    }
                }
                if (errorDetail) errorMessage += `Info: ${errorDetail}.\n`;
            }

            logger.error(`${errorMessage}${err}`);

            span.setTag('error', err);
            return Err(errorMessage);
        } finally {
            span.finish();
        }
    }

    async update({
        records,
        environmentId,
        connectionId,
        model,
        merging = { strategy: 'override' }
    }: {
        records: FormattedRecord[];
        connectionId: number;
        environmentId: number;
        model: string;
        merging?: MergingStrategy;
    }): Promise<Result<UpsertSummary>> {
        const activeSpan = tracer.scope().active();
        const span = tracer.startSpan('nango.records.update', {
            ...(activeSpan ? { childOf: activeSpan } : {}),
            tags: { 'nango.connectionId': connectionId, 'nango.model': model }
        });
        let partition: string | undefined = undefined;

        let nextMerging = merging;
        const { records: recordsWithoutDuplicates, nonUniqueKeys } = removeDuplicateKey(records);

        try {
            if (!recordsWithoutDuplicates || recordsWithoutDuplicates.length === 0) {
                return Err(
                    `There are no records to upsert because there were no records that were not duplicates to insert, but there were ${records.length} records received for the "${model}" model.`
                );
            }
            const updatedKeys: string[] = [];
            const activatedKeys: string[] = [];
            await this.db.transaction(async (trx) => {
                // Lock to prevent concurrent updates
                await acquireAdvisoryLock(trx, { name: 'lock_records_update', connectionId, model });

                let deltaSizeInBytes = 0;
                for (let i = 0; i < recordsWithoutDuplicates.length; i += BATCH_SIZE) {
                    const chunk = recordsWithoutDuplicates.slice(i, i + BATCH_SIZE);

                    const oldRecords = await getRecordsToUpdate({ trx, records: chunk, connectionId, model });

                    const recordsToUpdate: FormattedRecord[] = [];
                    for (const oldRecord of oldRecords) {
                        const oldRecordData = await decryptRecordData(oldRecord);

                        const inputRecord = chunk.find((record) => record.external_id === oldRecord.external_id);
                        if (!inputRecord) {
                            continue;
                        }

                        const { json, ...newRecordRest } = inputRecord;
                        const newRecordData = await decryptRecordData(inputRecord);

                        const newRecord: FormattedRecord = {
                            ...newRecordRest,
                            json: deepMergeRecordData(oldRecordData, newRecordData),
                            updated_at: new Date()
                        };
                        recordsToUpdate.push(newRecord);
                    }
                    if (recordsToUpdate.length > 0) {
                        const encryptedRecords = encryptRecords(recordsToUpdate);
                        const query = trx
                            .with('existing', (qb) => {
                                qb.select(
                                    `${RECORDS_TABLE}.external_id`,
                                    `${RECORDS_TABLE}.id`,
                                    trx.raw(`pg_column_size(${RECORDS_TABLE}.json) as legacy_size_bytes`),
                                    trx.raw(`${RECORDS_TABLE}.tableoid::regclass as partition`),
                                    `${RECORDS_TABLE}.size_bytes`
                                )
                                    .from(RECORDS_TABLE)
                                    .where(`${RECORDS_TABLE}.connection_id`, connectionId)
                                    .where(`${RECORDS_TABLE}.model`, model)
                                    .whereIn(
                                        `${RECORDS_TABLE}.external_id`,
                                        encryptedRecords.map((r) => r.external_id)
                                    );
                            })
                            .with('upsert_metadata', (qb) => {
                                qb.from<{ external_id: string; id: string; last_modified_at: string }>(RECORDS_TABLE)
                                    .insert(
                                        encryptedRecords.map((r) => ({
                                            connection_id: r.connection_id,
                                            model: r.model,
                                            id: r.id,
                                            external_id: r.external_id,
                                            json: trx.raw('NULL'),
                                            data_hash: r.data_hash,
                                            sync_id: r.sync_id,
                                            sync_job_id: r.sync_job_id,
                                            pruned_at: null, // clear pruned_at when record is updated
                                            updated_at: r.updated_at
                                        }))
                                    )
                                    .returning(['external_id', 'id', 'updated_at', trx.raw('tableoid::regclass as partition')])
                                    .onConflict(['connection_id', 'model', 'external_id'])
                                    .merge();
                                if (merging.strategy === 'ignore_if_modified_after_cursor' && merging.cursor) {
                                    const cursor = Cursor.from(merging.cursor);
                                    if (cursor) {
                                        qb.whereRaw(`(${RECORDS_TABLE}.updated_at, ${RECORDS_TABLE}.id) <= (?, ?)`, [cursor.sort, cursor.id]);
                                    }
                                }
                            })
                            .with('previous_size', (qb) => {
                                qb.select(`${RECORDS_DATA_TABLE}.id`, trx.raw(`pg_column_size(${RECORDS_DATA_TABLE}.data) as previous_size_bytes`))
                                    .from(RECORDS_DATA_TABLE)
                                    .join('existing', (join) => {
                                        join.on('existing.id', '=', `${RECORDS_DATA_TABLE}.id`)
                                            .andOnVal(`${RECORDS_DATA_TABLE}.connection_id`, '=', connectionId)
                                            .andOnVal(`${RECORDS_DATA_TABLE}.model`, '=', model);
                                    })
                                    .whereNull('existing.size_bytes');
                            })
                            .with('upsert_data', (qb) => {
                                qb.insert(
                                    trx.raw(
                                        `SELECT upsert_metadata.id, v.connection_id, v.model, v.data
                                    FROM upsert_metadata
                                    JOIN (VALUES ${encryptedRecords.map(() => '(?::uuid, ?::integer, ?::text, ?::jsonb)').join(', ')}) AS v(id, connection_id, model, data) ON v.id = upsert_metadata.id`,
                                        encryptedRecords.flatMap((r) => [r.id, r.connection_id, r.model, r.json])
                                    )
                                )
                                    .into(RECORDS_DATA_TABLE)
                                    .onConflict(['connection_id', 'model', 'id'])
                                    .merge(['data'])
                                    .returning(['id', trx.raw('pg_column_size(data) as new_size_bytes')]);
                            })
                            .select<
                                {
                                    partition: string;
                                    external_id: string;
                                    id: string;
                                    last_modified_at: string;
                                    delta_size_bytes: number;
                                    new_size_bytes: number;
                                }[]
                            >(
                                trx.raw(`
                                upsert_metadata.partition as partition,
                                upsert_metadata.id as id,
                                upsert_metadata.external_id as external_id,
                                to_json(upsert_metadata.updated_at) as last_modified_at,
                                upsert_data.new_size_bytes - COALESCE(existing.size_bytes, previous_size.previous_size_bytes, 0) - COALESCE(existing.legacy_size_bytes, 0) as delta_size_bytes,
                                upsert_data.new_size_bytes as new_size_bytes`)
                            )
                            .from('upsert_metadata')
                            .join('existing', 'existing.id', 'upsert_metadata.id')
                            .join('upsert_data', 'upsert_data.id', 'upsert_metadata.id')
                            .leftJoin('previous_size', 'previous_size.id', 'upsert_metadata.id')
                            .orderBy([
                                { column: 'updated_at', order: 'asc' },
                                { column: 'id', order: 'asc' }
                            ]);
                        const updated = await query;
                        // Update size_bytes separately — can't do it in the same CTE as upsert_metadata
                        // because both would update the same rows in RECORDS_TABLE (PostgreSQL disallows this)
                        if (updated.length > 0) {
                            await trx.raw(
                                `UPDATE ${RECORDS_TABLE} r SET size_bytes = v.new_size_bytes FROM (VALUES ${updated.map(() => '(?::uuid, ?::integer)').join(', ')}) AS v(id, new_size_bytes) WHERE r.id = v.id AND r.connection_id = ? AND r.model = ?`,
                                [...updated.flatMap((r) => [r.id, r.new_size_bytes]), connectionId, model]
                            );
                        }
                        updatedKeys.push(...updated.map((record) => record.external_id));

                        await this.insertSeenEntry(trx, {
                            connectionId,
                            model,
                            syncJobId: encryptedRecords[0]!.sync_job_id,
                            recordIds: updated.map((r) => r.id)
                        });

                        for (const record of updated) {
                            const oldRecord = oldRecords.find((old) => old.external_id === record.external_id);
                            if (!oldRecord?.updated_at) {
                                continue;
                            }
                            if (isInactiveThisMonth({ last_modified_at: record.last_modified_at, previous_last_modified_at: oldRecord.updated_at })) {
                                activatedKeys.push(record.external_id);
                            }
                        }

                        const lastRecord = updated[updated.length - 1];
                        if (merging.strategy === 'ignore_if_modified_after_cursor' && lastRecord) {
                            nextMerging = {
                                strategy: merging.strategy,
                                cursor: Cursor.new(lastRecord)
                            };
                        }
                        deltaSizeInBytes += updated.reduce((acc, r) => acc + r.delta_size_bytes, 0);
                        // all records for the same connection/model are in the same partition
                        if (!partition && updated[0]?.partition) {
                            partition = updated[0].partition;
                        }
                    }
                }
                await incrCount(trx, {
                    connectionId,
                    environmentId,
                    model,
                    delta: 0,
                    deltaSizeInBytes
                });
            });
            if (partition) {
                span.setTag('nango.partition', partition);
            }
            return Ok({
                addedKeys: [],
                updatedKeys,
                deletedKeys: [],
                activatedKeys,
                nonUniqueKeys,
                nextMerging,
                unchangedKeys: []
            });
        } catch (err: any) {
            if (err instanceof LockError) {
                span.setTag('error', err);
                return Err(err);
            }
            let errorMessage = `Failed to update ${recordsWithoutDuplicates.length} records. (connectionId: ${connectionId}, model: ${model})\n`;

            if ('code' in err) errorMessage += `Error code: ${(err as { code: string }).code}.\n`;
            if ('detail' in err) errorMessage += `Detail: ${(err as { detail: string }).detail}.\n`;
            if ('message' in err) errorMessage += `Error Message: ${(err as { message: string }).message}`;

            span.setTag('error', err);
            return Err(errorMessage);
        } finally {
            span.finish();
        }
    }

    /**
     * deleteRecords
     * @desc Deletes records for a given connection and model up to a specified cursor and/or limit (whatever comes first).
     * Deletes all records if neither limit nor toCursorIncluded is provided.
     * @param environmentId - The id of the environment.
     * @param connectionId - The id of the connection.
     * @param model - The model name.
     * @param mode - The deletion mode: 'hard' (permanent deletion), 'soft' (empty payload and set deleted_at) or 'prune' (empty payload only).
     * @param limit - The maximum number of records to delete.
     * @param toCursorIncluded - The cursor up to which records should be deleted (inclusive. ordered by updated_at, id).
     * @param batchSize - The number of records to delete in each batch (default is 1000).
     * @param dryRun - If true, simulates the deletion without actually deleting any records (default is false).
     */
    async deleteRecords({
        connectionId,
        environmentId,
        model,
        mode,
        limit,
        toCursorIncluded,
        batchSize = 1000,
        dryRun = false
    }: {
        connectionId: number;
        environmentId: number;
        model: string;
        mode: 'hard' | 'soft' | 'prune';
        limit?: number;
        toCursorIncluded?: string;
        batchSize?: number;
        dryRun?: boolean;
    }): Promise<Result<{ count: number; lastCursor: string | null }>> {
        const activeSpan = tracer.scope().active();
        const span = tracer.startSpan('nango.records.deletedRecords', {
            ...(activeSpan ? { childOf: activeSpan } : {}),
            tags: {
                'nango.environmentId': environmentId,
                'nango.connectionId': connectionId,
                'nango.model': model,
                'nango.deletionMode': mode,
                'nango.dryRun': dryRun
            }
        });

        let partition: string | undefined = undefined;
        let totalRecords = 0;
        let totalSizeInBytes = 0;
        let paginatedRecords = 0;
        let lastCursor: string | null = null;

        try {
            if (limit !== undefined && limit <= 0) {
                return Err(new Error('limit must be greater than 0'));
            }

            let decodedCursor: { sort: string; id: string } | null = null;
            if (toCursorIncluded) {
                decodedCursor = Cursor.from(toCursorIncluded) || null;
                if (!decodedCursor) {
                    return Err(new Error('invalid_cursor_value'));
                }
            }

            await this.db.transaction(async (trx) => {
                const now = trx.fn.now(6);
                // Lock to prevent concurrent deletions (skip lock if dry run)
                if (!dryRun) {
                    await acquireAdvisoryLock(trx, { name: 'lock_records_delete', connectionId, model });
                }

                // Each batch starts right after the last processed record
                // so the index scan doesn't re-traverse dead tuples from prior batches
                let from: { updated_at: string; id: string } | null = null;

                do {
                    const toDelete = limit ? Math.min(batchSize, limit - totalRecords) : batchSize;
                    if (toDelete <= 0) {
                        break;
                    }

                    const targetIdsSubquery = () => {
                        const subQuery = trx
                            .select('id')
                            .from(RECORDS_TABLE)
                            .where({ connection_id: connectionId, model })
                            .orderBy([
                                { column: 'updated_at', order: 'asc' },
                                { column: 'id', order: 'asc' }
                            ])
                            .limit(toDelete);
                        if (from) {
                            subQuery.whereRaw('(updated_at, id) > (?, ?)', [from.updated_at, from.id]);
                        }
                        if (decodedCursor) {
                            // Delete records up to and including the cursor position
                            subQuery.whereRaw('(updated_at, id) <= (?, ?)', [decodedCursor.sort, decodedCursor.id]);
                        }
                        if (mode === 'soft') {
                            // only soft delete non-deleted records
                            subQuery.whereNull('deleted_at');
                        } else if (mode === 'prune') {
                            // only prune non-pruned records
                            subQuery.whereNull('pruned_at');
                        }
                        return subQuery;
                    };

                    // Fetch the size of records before deletion
                    let sizeRows: { id: string; size_bytes: number }[] = [];
                    if (!dryRun) {
                        sizeRows = await trx
                            .select<{ id: string; size_bytes: number }[]>(
                                'r.id',
                                trx.raw('COALESCE(pg_column_size(r.json), r.size_bytes, pg_column_size(d.data), 0) as size_bytes')
                            )
                            .from({ r: RECORDS_TABLE })
                            .leftJoin({ d: RECORDS_DATA_TABLE }, function () {
                                this.on('d.connection_id', 'r.connection_id').andOn('d.model', 'r.model').andOn('d.id', 'r.id');
                            })
                            .where('r.connection_id', connectionId)
                            .andWhere('r.model', model)
                            .whereIn('r.id', targetIdsSubquery());
                    }

                    // if hard mode, we permanently delete the records
                    // if prune mode, we empty the record payload
                    // if soft mode, we update the deleted_at/updated_at fields
                    const query = trx
                        .from(RECORDS_TABLE)
                        .where({ connection_id: connectionId, model })
                        .whereIn('id', targetIdsSubquery())
                        .returning<{ id: string; partition: string; updated_at: string }[]>([
                            'id',
                            trx.raw('tableoid::regclass as partition'),
                            trx.raw('to_json(updated_at) as updated_at')
                        ]);

                    if (!dryRun) {
                        switch (mode) {
                            case 'prune':
                                query.update({
                                    pruned_at: now,
                                    json: null,
                                    size_bytes: 0
                                    // IMPORTANT: updated_at isn't updated because it would cause the record cursor to also change
                                });
                                break;
                            case 'soft':
                                query.update({
                                    deleted_at: now,
                                    updated_at: now
                                });
                                break;
                            case 'hard':
                                query.del();
                                break;
                        }
                    }

                    const res = await query;
                    const ids = res.map((r) => r.id);

                    if (!dryRun && mode !== 'soft') {
                        await trx.from(RECORDS_DATA_TABLE).where({ connection_id: connectionId, model }).whereIn('id', ids).delete();
                    }

                    const sizeById = new Map(sizeRows.map((r) => [r.id, r.size_bytes]));

                    paginatedRecords = res.length;
                    totalRecords += paginatedRecords;
                    totalSizeInBytes += ids.reduce((acc, id) => acc + (sizeById.get(id) ?? 0), 0);
                    if (!partition && res[0]?.partition) {
                        partition = res[0].partition;
                    }

                    const lastDeletedRecord = res[res.length - 1];
                    if (lastDeletedRecord) {
                        lastCursor = Cursor.new({ id: lastDeletedRecord.id, last_modified_at: lastDeletedRecord.updated_at });
                        // Soft delete sets updated_at = now, so RETURNING gives the new value.
                        // Using it as a cursor would place us past all remaining records.
                        // dryRun doesn't modify updated_at, so cursor advancement is safe there.
                        if (mode !== 'soft' || dryRun) {
                            from = { updated_at: lastDeletedRecord.updated_at, id: lastDeletedRecord.id };
                        }
                    }

                    if (paginatedRecords < toDelete) {
                        break;
                    }
                } while (paginatedRecords > 0);

                if (!dryRun) {
                    const delta = mode === 'prune' ? 0 : -totalRecords; // pruning doesn't affect the records count
                    const newCount = await incrCount(trx, {
                        environmentId,
                        connectionId,
                        model,
                        delta,
                        deltaSizeInBytes: -totalSizeInBytes
                    });

                    // If all records are deleted, clean up the count entry
                    if (newCount?.count === 0) {
                        await deleteCount(trx, {
                            environmentId,
                            connectionId,
                            model
                        });
                    }
                }
            });

            if (partition) {
                span.setTag('nango.partition', partition);
            }

            return Ok({ count: totalRecords, lastCursor });
        } catch (err) {
            if (err instanceof LockError) {
                span.setTag('error', err);
                return Err(err);
            }
            span.setTag('error', err);
            return Err(new Error(`Failed to delete records connection ${connectionId}, model ${model}`, { cause: err }));
        } finally {
            span.finish();
        }
    }

    // Mark all non-deleted records from previous generations as deleted
    // returns the ids of records being deleted
    async deleteOutdatedRecords({
        environmentId,
        connectionId,
        model,
        generation,
        batchSize = 10_000
    }: {
        environmentId: number;
        connectionId: number;
        model: string;
        generation: number;
        batchSize?: number;
    }): Promise<Result<string[]>> {
        const activeSpan = tracer.scope().active();
        const span = tracer.startSpan('nango.records.deleteOutdatedRecords', {
            ...(activeSpan ? { childOf: activeSpan } : {}),
            tags: { 'nango.connectionId': connectionId, 'nango.model': model }
        });
        let partition: string | undefined = undefined;
        try {
            const deletedIds: string[] = [];
            let hasMore = true;
            // Cursor as id: each batch starts right after the last processed record so the
            // index scan doesn't re-traverse dead tuples from prior batches
            // updated_at can't be used as cursor here since the soft delete sets it to now.
            let lastId: string | null = null;
            // NOTE: deletion is intentionally not atomic. Each batch is its own transaction so that
            // long-running deletes (e.g. millions of records) don't hold a single DB connection and
            // row locks for the entire duration, which was causing timeouts and stalling other queries.
            // The tradeoff is that a failure mid-way leaves the dataset in a partially deleted state.
            // This is acceptable because: (1) the sync fails and the user is notified, (2) the next
            // sync run will call deleteOutdatedRecords again and clean up whatever was missed.
            while (hasMore) {
                const batchResult = await retry(
                    () => {
                        return this.db.transaction(async (trx) => {
                            // Lock to prevent concurrent modifications with upserts and deletes
                            await acquireAdvisoryLock(trx, { name: 'lock_records_outdated', connectionId, model });

                            // Fetch page bounds separately
                            // Update query only yields soft-deleted rows
                            // and we can't tell "end of table" from "records in page have all been seen and skipped".
                            // The advisory lock ensures both page and update queries see the same rows.
                            const pageQuery = trx
                                .select<{ id: string }[]>('id')
                                .from(RECORDS_TABLE)
                                .where({ connection_id: connectionId, model })
                                .whereNull('deleted_at')
                                .orderBy('id')
                                .limit(batchSize);
                            if (lastId) {
                                pageQuery.whereRaw('id > ?', [lastId]);
                            }
                            const pageRows = await pageQuery;

                            if (pageRows.length === 0) {
                                return { rows: [], pageLastId: null as string | null, pageSize: 0 };
                            }

                            const res: {
                                id: string;
                                connection_id: number;
                                model: string;
                                external_id: string;
                                legacy_size_bytes: number;
                                size_bytes: number | null;
                                partition: string;
                            }[] = (
                                await trx.raw(
                                    // Paginate records first so the planner knows the driving side is bounded by batchSize.
                                    // This forces a hash anti-join instead of a nested loop anti-join,
                                    // which the planner chooses when it can't estimate the seen CTE cardinality accurately.
                                    // ie: unnest output is consistently underestimated, pg thinks nested loop is cheap, causing O(records*seen) comparisons instead of O(seen+page).
                                    // Seen is still fully unnested.
                                    `WITH page AS MATERIALIZED (
                                    SELECT ctid, id
                                    FROM ${RECORDS_TABLE}
                                    WHERE connection_id = :connectionId
                                      AND model = :model
                                      AND deleted_at IS NULL
                                      AND (:lastId::text IS NULL OR id > :lastId)
                                    ORDER BY id
                                    LIMIT :batchSize
                                ),
                                seen AS MATERIALIZED (
                                    SELECT unnest(record_ids) AS id
                                    FROM ${RECORDS_SEEN_TABLE}
                                    WHERE connection_id = :connectionId
                                      AND model = :model
                                      AND generation >= :generation
                                ),
                                to_delete AS (
                                    SELECT p.ctid, p.id
                                    FROM page p
                                    LEFT JOIN seen s ON s.id = p.id
                                    WHERE s.id IS NULL
                                )
                                UPDATE ${RECORDS_TABLE} r
                                SET
                                    deleted_at = current_timestamp(6),
                                    updated_at = current_timestamp(6)
                                FROM to_delete
                                WHERE r.ctid = to_delete.ctid
                                  AND r.id = to_delete.id
                                  AND r.connection_id = :connectionId
                                  AND r.model = :model
                                RETURNING
                                  r.id,
                                  r.connection_id,
                                  r.model,
                                  r.external_id,
                                  COALESCE(pg_column_size(r.json), 0) as legacy_size_bytes,
                                  r.size_bytes,
                                  r.tableoid::regclass as partition`,
                                    { connectionId, model, generation, batchSize, lastId }
                                )
                            ).rows;

                            // Get size of deleted records — use cached size_bytes when available
                            const knownSizeTotal = res.reduce((acc, r) => acc + (r.size_bytes ?? 0), 0);
                            const unknownSizeIds = res.filter((r) => r.size_bytes === null);
                            let unknownSizeTotal = 0;
                            if (unknownSizeIds.length > 0) {
                                const [sizeRes] = await trx(RECORDS_DATA_TABLE)
                                    .whereIn(
                                        ['connection_id', 'model', 'id'],
                                        unknownSizeIds.map((r) => [r.connection_id, r.model, r.id])
                                    )
                                    .select<{ sum: number }[]>(trx.raw('sum(pg_column_size(data)) as sum'));
                                unknownSizeTotal = sizeRes?.sum || 0;
                            }
                            const totalPreviousSizeBytes = knownSizeTotal + unknownSizeTotal;

                            // update records count and size
                            const deleted = res.length;
                            const totalLegacySizeInBytes = res.reduce((acc, r) => acc + r.legacy_size_bytes, 0);
                            const deltaSizeInBytes = -totalLegacySizeInBytes - totalPreviousSizeBytes;
                            if (deleted > 0) {
                                await incrCount(trx, {
                                    connectionId,
                                    environmentId,
                                    model,
                                    delta: -deleted,
                                    deltaSizeInBytes
                                });
                            }

                            return { rows: res, pageLastId: pageRows.at(-1)?.id ?? null, pageSize: pageRows.length };
                        });
                    },
                    // Retry if deadlock detected
                    // https://www.postgresql.org/docs/current/mvcc-serialization-failure-handling.html
                    {
                        maxAttempts: 3,
                        delayMs: 500,
                        retryOnError: (err) => {
                            if (err !== null && typeof err === 'object' && 'code' in err) {
                                const errorCode = (err as { code: string }).code;
                                return errorCode === '40P01'; // deadlock_detected
                            }
                            return false;
                        }
                    }
                );

                // Use page bounds for cursor and termination
                if (batchResult.pageLastId) {
                    lastId = batchResult.pageLastId;
                }
                if (batchResult.pageSize < batchSize) {
                    hasMore = false;
                }

                if (!partition && batchResult.rows[0]?.partition) {
                    partition = batchResult.rows[0].partition;
                }

                deletedIds.push(...batchResult.rows.map((r) => r.external_id));
            }

            if (partition) {
                span.setTag('nango.partition', partition);
            }
            return Ok(deletedIds);
        } catch (err) {
            if (err instanceof LockError) {
                span.setTag('error', err);
                return Err(err);
            }
            const e = new Error(
                `Failed to mark previous generation records as deleted for connection ${connectionId}, model ${model}, generation ${generation}`,
                {
                    cause: err
                }
            );
            span.setTag('error', e);
            return Err(e);
        } finally {
            span.finish();
        }
    }

    async getCountsByModel({ connectionId, environmentId }: { connectionId: number; environmentId: number }): Promise<Result<Record<string, RecordCount>>> {
        try {
            const results = await this.db
                .from(RECORD_COUNTS_TABLE)
                .where({
                    connection_id: connectionId,
                    environment_id: environmentId
                })
                .select<RecordCount[]>('*');

            const statsByModel: Record<string, RecordCount> = results.reduce(
                (acc, result) => ({
                    ...acc,
                    [result.model]: {
                        ...result,
                        size_bytes: Number(result.size_bytes) // bigint is returned as string by pg
                    }
                }),
                {}
            );
            return Ok(statsByModel);
        } catch {
            const e = new Error(`Failed to fetch stats for connection ${connectionId} and environment ${environmentId}`);
            return Err(e);
        }
    }

    async *paginateCounts({
        environmentIds,
        connectionIds,
        batchSize = 1000
    }: {
        connectionIds?: number[];
        environmentIds?: number[];
        batchSize?: number;
    } = {}): AsyncGenerator<Result<RecordCount[]>> {
        if (batchSize < 1) {
            throw new RangeError(`batchSize must be > 0`);
        }
        let offset = 0;
        try {
            while (true) {
                // TODO: optimize with cursor pagination
                let query = this.db<RecordCount>(RECORD_COUNTS_TABLE).select('*').orderBy(['connection_id', 'model']).limit(batchSize).offset(offset);

                if (environmentIds && environmentIds.length > 0) {
                    query = query.whereIn('environment_id', environmentIds);
                }

                if (connectionIds && connectionIds.length > 0) {
                    query = query.whereIn('connection_id', connectionIds);
                }

                const results = await query;
                if (results.length < batchSize) {
                    return yield Ok(results);
                }

                yield Ok(results);
                offset += results.length;
            }
        } catch (err) {
            return yield Err(`Failed to fetch record counts: ${String(err)}`);
        }
    }

    /*
     * autoPruningCandidate
     * @desc finds a candidate connection/model for auto-pruning
     * This function helps distribute the pruning load across partitions
     * by randomly selecting a partition to search for stale records.
     * @param staleAfterMs - milliseconds since last modification to consider a record stale
     * @returns a Result containing either:
     * - candidate connection and model with a cursor to the stale record
     * - null if no candidate found
     */
    async autoPruningCandidate({ staleAfterMs }: { staleAfterMs: number }): Promise<
        Result<{
            partition: number;
            environmentId: number;
            connectionId: number;
            model: string;
            cursor: string;
        } | null>
    > {
        const partition = Math.floor(Math.random() * 256);
        const table = `${RECORDS_TABLE}_p${partition}`;
        try {
            const [candidate] = await this.db
                .from(table)
                .select<{ id: string; environment_id: number | null; connection_id: number; model: string; last_modified_at: string }[]>(
                    this.db.raw(`
                    ${table}.id,
                    ${table}.connection_id,
                    ${table}.model,
                    record_counts.environment_id,
                    to_json(${table}.updated_at) as last_modified_at
                `)
                )
                .leftJoin('record_counts', function () {
                    this.on(`${table}.connection_id`, 'record_counts.connection_id').andOn(`${table}.model`, 'record_counts.model');
                })
                .whereNull(`${table}.pruned_at`)
                .whereRaw(`${table}.updated_at < NOW() - INTERVAL '${staleAfterMs} milliseconds'`)
                .limit(1);
            if (candidate) {
                if (candidate.environment_id === null) {
                    return Err(
                        new Error(`Missing record_counts entry for connection_id=${candidate.connection_id} model=${candidate.model} in partition ${partition}`)
                    );
                }
                return Ok({
                    partition,
                    environmentId: candidate.environment_id,
                    connectionId: candidate.connection_id,
                    model: candidate.model,
                    cursor: Cursor.new(candidate)
                });
            }
            return Ok(null);
        } catch (err) {
            return Err(new Error(`Failed to find auto-pruning candidate in partition ${partition}`, { cause: err }));
        }
    }

    /*
     * autoDeletingCandidate
     * @desc finds a candidate connection/model for auto-deleting
     * by selecting the least-recently-checked connection/model whose count has not been updated in the past staleAfterMs milliseconds.
     * @param staleAfterMs - milliseconds since last modification to consider a connection as potentially stale
     * @returns a Result containing either:
     * - candidate connection, model and environmentId
     * - null if no candidate found
     */
    async autoDeletingCandidate({ staleAfterMs }: { staleAfterMs: number }): Promise<
        Result<{
            connectionId: number;
            model: string;
            environmentId: number;
        } | null>
    > {
        try {
            const [candidate] = await this.db
                .raw<{ rows: { connection_id: number; model: string; environment_id: number }[] }>(
                    `WITH candidate AS (
                SELECT connection_id, model, environment_id
                FROM ${RECORD_COUNTS_TABLE}
                WHERE updated_at < NOW() - ? * INTERVAL '1 millisecond'
                ORDER BY autodelete_checked_at ASC NULLS FIRST, connection_id ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            UPDATE ${RECORD_COUNTS_TABLE} rc
            SET autodelete_checked_at = NOW()
            FROM candidate
            WHERE rc.connection_id = candidate.connection_id
              AND rc.model = candidate.model
              AND rc.environment_id = candidate.environment_id
            RETURNING rc.connection_id, rc.model, rc.environment_id`,
                    [staleAfterMs]
                )
                .then((r) => r.rows);

            if (candidate) {
                return Ok({
                    connectionId: candidate.connection_id,
                    model: candidate.model,
                    environmentId: candidate.environment_id
                });
            }
            return Ok(null);
        } catch (err) {
            return Err(new Error(`Failed to find auto-delete candidate`, { cause: err }));
        }
    }

    private async insertSeenEntry(
        trx: Knex.Transaction,
        { connectionId, model, syncJobId, recordIds }: { connectionId: number; model: string; syncJobId: number; recordIds: string[] }
    ): Promise<void> {
        if (recordIds.length === 0) return;
        const ensureRes = await this.ensureSeenPartition({ date: new Date() });
        if (ensureRes.isErr()) {
            throw new Error('Failed to ensure seen partition', { cause: ensureRes.error });
        }
        await trx(RECORDS_SEEN_TABLE).insert({
            connection_id: connectionId,
            model,
            sync_job_id: syncJobId,
            // Dual-write the bigint replacement alongside the int4 column. Reads switch to
            // generation in Phase 2d; sync_job_id stops being written in Phase 2f.
            generation: syncJobId,
            record_ids: trx.raw(`ARRAY[${recordIds.map(() => '?::uuid').join(',')}]`, recordIds)
        });
    }
}

export async function incrCount(
    trx: Knex,
    {
        connectionId,
        environmentId,
        model,
        delta,
        deltaSizeInBytes
    }: {
        connectionId: number;
        environmentId: number;
        model: string;
        delta: number;
        deltaSizeInBytes: number;
    }
): Promise<RecordCount> {
    const res = await trx
        .from<RecordCount>(RECORD_COUNTS_TABLE)
        .insert({
            connection_id: connectionId,
            model,
            environment_id: environmentId,
            count: delta,
            size_bytes: deltaSizeInBytes
        })
        .onConflict(['connection_id', 'environment_id', 'model'])
        .merge({
            count: trx.raw(`GREATEST(0, ${RECORD_COUNTS_TABLE}.count + EXCLUDED.count)`),
            size_bytes: trx.raw(`GREATEST(0, ${RECORD_COUNTS_TABLE}.size_bytes + EXCLUDED.size_bytes)`),
            updated_at: trx.fn.now(6)
        })
        .returning('*');

    const [updated] = res;
    if (!updated) {
        throw new Error('Failed to update record count');
    }
    return {
        ...updated,
        size_bytes: Number(updated.size_bytes)
    };
}

async function deleteCount(
    trx: Knex,
    {
        connectionId,
        environmentId,
        model
    }: {
        connectionId: number;
        environmentId: number;
        model: string;
    }
): Promise<void> {
    await trx.from(RECORD_COUNTS_TABLE).where({ connection_id: connectionId, environment_id: environmentId, model }).del();
}

/**
 * getRecordsToUpdate
 * @desc returns records that exist in the records table but have a different data_hash
 */
async function getRecordsToUpdate({
    trx,
    records,
    connectionId,
    model
}: {
    trx: Knex.Transaction;
    records: FormattedRecord[];
    connectionId: number;
    model: string;
}): Promise<FormattedRecord[]> {
    const keys: string[] = records.map((record: FormattedRecord) => getUniqueId(record));
    const keysWithHash: [string, string][] = records.map((record: FormattedRecord) => [getUniqueId(record), record.data_hash]);

    return trx
        .select<FormattedRecord[]>(`${RECORDS_TABLE}.*`, trx.raw(`COALESCE(${RECORDS_DATA_TABLE}.data, ${RECORDS_TABLE}.json, '{}'::jsonb) as json`))
        .from(RECORDS_TABLE)
        .leftJoin(RECORDS_DATA_TABLE, function () {
            this.on(`${RECORDS_DATA_TABLE}.connection_id`, '=', `${RECORDS_TABLE}.connection_id`)
                .andOn(`${RECORDS_DATA_TABLE}.model`, '=', `${RECORDS_TABLE}.model`)
                .andOn(`${RECORDS_DATA_TABLE}.id`, '=', `${RECORDS_TABLE}.id`);
        })
        .where(`${RECORDS_TABLE}.connection_id`, connectionId)
        .where(`${RECORDS_TABLE}.model`, model)
        .whereNull(`${RECORDS_TABLE}.deleted_at`)
        .whereIn(`${RECORDS_TABLE}.external_id`, keys)
        .whereNotIn([`${RECORDS_TABLE}.external_id`, `${RECORDS_TABLE}.data_hash`], keysWithHash);
}

class LockError extends Error {}

async function acquireAdvisoryLock(trx: Knex.Transaction, { name, connectionId, model }: { name: string; connectionId: number; model: string }): Promise<void> {
    try {
        await trx.raw(`SELECT pg_advisory_xact_lock(?) as ${name}`, [newLockId(connectionId, model)]);
    } catch {
        throw new LockError(`Failed to acquire lock for model ${model} (connection ${connectionId}). Another operation may be in progress. Please retry.`);
    }
}

function newLockId(connectionId: number, model: string): bigint {
    // convert modelHash to unsigned 32-bit integer to ensure
    // negative hash values don't cause sign extension problems
    // when combined with connectionId in the bitwise OR operation
    const modelHash = stringToHash(model) >>> 0;

    return (BigInt(connectionId) << 32n) | BigInt(modelHash);
}

function isInactiveThisMonth(record: { last_modified_at: string | Date; previous_last_modified_at: string | Date }): boolean {
    const firstDayOfMonth = dayjs().utc().startOf('month');
    const previousLastModifiedAt = dayjs(record.previous_last_modified_at).utc();
    return previousLastModifiedAt.isBefore(firstDayOfMonth);
}

function getInactiveThisMonth(records: UpsertedMetadata[]): UpsertedMetadata[] {
    return records.filter((r) => {
        if (!r.previous_last_modified_at) {
            return true;
        }
        return isInactiveThisMonth({ last_modified_at: r.last_modified_at, previous_last_modified_at: r.previous_last_modified_at });
    });
}
