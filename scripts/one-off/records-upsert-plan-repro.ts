import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import Knex from 'knex';

const DB_URL = process.env['RECORDS_DATABASE_URL'] || 'postgresql://nango:nango@localhost:5432/nango';
const SCHEMA = process.env['RECORDS_SCHEMA'] || 'records_plan_repro';
const MODEL = 'UnifiedTicket';
const INCOMING_BATCH = 200;
const SCALES = (process.env['SCALES'] || '1000,50000,250000,1000000').split(',').map((v) => parseInt(v, 10));

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../packages/records/lib/stores/postgres/migrations');

const db = Knex({
    client: 'postgres',
    connection: {
        connectionString: DB_URL,
        statement_timeout: 600_000,
        ssl: false,
        application_name: 'plan-repro'
    },
    searchPath: SCHEMA,
    pool: { min: 1, max: 5 },
    migrations: {
        extension: 'ts',
        directory: migrationsDir,
        tableName: 'migrations',
        loadExtensions: ['.ts'],
        schemaName: SCHEMA
    }
});

async function seed(connectionId: number, count: number): Promise<void> {
    const chunk = 100_000;
    for (let start = 1; start <= count; start += chunk) {
        const end = Math.min(start + chunk - 1, count);
        await db.raw(
            `INSERT INTO records (id, external_id, json, data_hash, connection_id, model, sync_id)
             SELECT gen_random_uuid(), 'ext-' || g, NULL, md5(g::text), ?, ?, '00000000-0000-0000-0000-000000000001'::uuid
             FROM generate_series(?::bigint, ?::bigint) g`,
            [connectionId, MODEL, start, end]
        );
    }
}

async function sampleIncoming(connectionId: number): Promise<{ id: string; external_id: string }[]> {
    const res = await db.raw(`SELECT id, external_id FROM records WHERE connection_id = ? AND model = ? ORDER BY external_id LIMIT ?`, [
        connectionId,
        MODEL,
        INCOMING_BATCH
    ]);
    return res.rows;
}

// Verbatim from packages/records/lib/stores/postgres/postgres.ts (hasUpdatedAt = false, no cursor),
// which is the shape that times out in production.
function upsertMetadataSql(rowCount: number): string {
    const placeholders = Array.from({ length: rowCount }, () => '(?::integer, ?::text, ?::uuid, ?::text, ?::text, ?::uuid, ?::integer, ?::timestamptz)').join(
        ', '
    );
    return `
        WITH incoming AS (
            SELECT * FROM (VALUES ${placeholders}) AS t(connection_id, model, id, external_id, data_hash, sync_id, sync_job_id, deleted_at)
        ),
        classified AS MATERIALIZED (
            SELECT
                incoming.connection_id, incoming.model, incoming.id, incoming.external_id,
                incoming.data_hash, incoming.sync_id, incoming.sync_job_id, incoming.deleted_at,
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
                        true
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
            LEFT JOIN records r
                ON r.connection_id = ?
               AND r.model = ?
               AND r.external_id = incoming.external_id
        ),
        upsert AS (
            INSERT INTO records (
                connection_id, model, id, external_id, json, data_hash, sync_id, sync_job_id, deleted_at, pruned_at
            )
            SELECT connection_id, model, id, external_id, NULL::jsonb, data_hash, sync_id, sync_job_id, deleted_at, NULL::timestamptz
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
            RETURNING id, external_id, updated_at, tableoid::regclass as partition
        ),
        combined AS (
            SELECT partition, id, external_id, updated_at, true as was_upserted FROM upsert
            UNION ALL
            SELECT existing_partition as partition, existing_id as id, external_id, existing_updated_at as updated_at, false as was_upserted
            FROM classified
            WHERE NOT should_upsert AND NOT needs_data_write AND existing_id IS NOT NULL
        )
        SELECT
            combined.partition, combined.id, combined.external_id,
            to_json(combined.updated_at) as last_modified_at,
            classified.previous_last_modified_at,
            classified.needs_data_write,
            classified.legacy_size_bytes,
            classified.existing_size_bytes,
            CASE WHEN combined.was_upserted THEN classified.status ELSE 'unchanged' END as status
        FROM combined
        JOIN classified ON classified.external_id = combined.external_id
        ORDER BY combined.updated_at ASC, combined.id ASC
    `;
}

function bindings(connectionId: number, incoming: { id: string; external_id: string }[], run: number): unknown[] {
    const rows = incoming.flatMap((r) => [
        connectionId,
        MODEL,
        r.id,
        r.external_id,
        `changed-${run}-${r.external_id}`, // new data_hash so should_upsert is true, like a real sync
        '00000000-0000-0000-0000-000000000001',
        null,
        null
    ]);
    return [...rows, connectionId, MODEL];
}

async function main(): Promise<void> {
    await db.raw(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
    await db.migrate.latest();

    const results: { scale: number; ms: number; seqScan: boolean; indexScan: boolean }[] = [];

    for (const scale of SCALES) {
        const connectionId = Math.floor(Math.random() * 2_000_000) + 1;
        process.stdout.write(`\nseeding ${scale.toLocaleString()} records (connection ${connectionId})... `);
        await seed(connectionId, scale);
        await db.raw(`ANALYZE records`);
        process.stdout.write('done\n');

        const incoming = await sampleIncoming(connectionId);
        const sql = upsertMetadataSql(incoming.length);

        // warm up so we are not measuring first-call overhead
        await db.raw(sql, bindings(connectionId, incoming, 0) as any);

        const started = Date.now();
        await db.raw(sql, bindings(connectionId, incoming, 1) as any);
        const ms = Date.now() - started;

        const explained = await db.raw(`EXPLAIN (ANALYZE, BUFFERS, VERBOSE) ${sql}`, bindings(connectionId, incoming, 2) as any);
        const plan = explained.rows.map((r: Record<string, string>) => r['QUERY PLAN']).join('\n');

        // Only the `classified` subtree matters: that is the LEFT JOIN against records under test.
        const classified = plan.split('CTE classified')[1]?.split('CTE upsert')[0] ?? plan;
        const seqScan = /Seq Scan on/.test(classified);
        const indexScan = /Index (Only )?Scan using records_connection_id_model_external_id/.test(classified);
        results.push({ scale, ms, seqScan, indexScan });

        fs.writeFileSync(`/tmp/records-plan-${scale}.txt`, plan);
        console.log(`--- scale ${scale.toLocaleString()} : ${ms}ms (full plan: /tmp/records-plan-${scale}.txt) ---`);
        console.log('CTE classified' + classified.trimEnd());
    }

    console.log('\n================ SUMMARY ================');
    console.log('records for conn+model | upsert query | seq scan | uses unique index');
    for (const r of results) {
        console.log(`${r.scale.toLocaleString().padStart(22)} | ${String(r.ms + 'ms').padStart(12)} | ${String(r.seqScan).padStart(8)} | ${r.indexScan}`);
    }
    console.log('\nIf ms grows with scale and seq scan flips to true, the query cost tracks the');
    console.log('connection table rather than the 200-row batch. That is the production failure.');

    await db.destroy();
}

main().catch(async (err) => {
    console.error(err);
    await db.destroy();
    process.exit(1);
});
