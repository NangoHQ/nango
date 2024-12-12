import Knex from 'knex';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const SOURCE_DB_URL = process.env['SOURCE_DB_URL'] || '';
const sourceKnex = Knex({
    client: 'pg',
    connection: {
        connectionString: SOURCE_DB_URL,
        ssl: 'no-verify',
        statement_timeout: 60000
    },
    pool: {
        min: 1,
        max: 10
    }
});

const TARGET_DB_URL = process.env['TARGET_DB_URL'] || '';
const targetKnex = Knex({
    client: 'pg',
    connection: {
        connectionString: TARGET_DB_URL,
        ssl: 'no-verify',
        statement_timeout: 60000
    },
    pool: {
        min: 1,
        max: 10
    }
});

const BATCH_SIZE = 1000;

interface Checkpoint {
    lastCreatedAt: string | null;
    lastId: string | null;
}

interface TargetRecord {
    id: string;
    external_id: string;
    json: object;
    data_hash: string;
    connection_id: number;
    model: string;
    sync_id: string;
    sync_job_id: number;
    created_at_raw: string;
    created_at: string;
    updated_at: string;
    deleted_at: string;
}

const dirname = path.dirname(fileURLToPath(import.meta.url));
const checkpointFile = path.join(dirname, 'migrate_checkpoint.json');

function readRecords(checkpoint: Checkpoint): Promise<TargetRecord[]> {
    const batchSize = BATCH_SIZE;
    return sourceKnex
        .select<TargetRecord[]>(
            sourceKnex.raw(`
                    id,
                    external_id,
                    json,
                    data_hash,
                    nango_connection_id as connection_id,
                    model,
                    sync_id,
                    sync_job_id,
                    to_json(created_at) as created_at,
                    to_json(updated_at) as updated_at,
                    to_json(external_deleted_at) as deleted_at,
                    created_at as created_at_raw
                `)
        )
        .from<TargetRecord>(`nango._nango_sync_data_records`)
        .where((builder) => {
            if (checkpoint.lastCreatedAt && checkpoint.lastId) {
                builder.where(sourceKnex.raw(`(created_at, id) > (?, ?)`, [checkpoint.lastCreatedAt, checkpoint.lastId]));
            }
        })
        .orderBy([
            { column: 'created_at_raw', order: 'asc' },
            { column: 'id', order: 'asc' }
        ])
        .limit(batchSize);
}

function writeRecords(records: any[]): Promise<{ id: string; created_at: Date }[]> {
    return targetKnex
        .insert(records)
        .into<{ id: string; updated_at: string }>(`nango_records.records`)
        .onConflict(['connection_id', 'model', 'external_id'])
        .merge()
        .returning(['id', 'created_at']);
}

async function migrate() {
    console.log('Starting records migration...');
    console.log('Source DB:', SOURCE_DB_URL);
    console.log('Target DB:', TARGET_DB_URL);
    let checkpoint = await getCheckpoint();

    const more = true;
    let records: TargetRecord[] | undefined = undefined;
    while (more) {
        const startRead = Date.now();
        if (!records) {
            records = await readRecords(checkpoint);
        }

        if (records.length === 0) {
            console.log('No rows to migrate. Sleeping...');
            await new Promise((resolve) => setTimeout(resolve, 2000));
            records = undefined;
            continue;
        }

        const toInsert = records.map((record) => {
            const { created_at_raw, ...rest } = record;
            return rest;
        });
        const lastRow = toInsert[toInsert.length - 1];
        checkpoint = { lastCreatedAt: lastRow.created_at, lastId: lastRow.id };

        const [res, nextRecords] = await Promise.all([writeRecords(toInsert), readRecords(checkpoint)]);
        records = nextRecords;
        const endWrite = Date.now();
        try {
            await saveCheckpoint(checkpoint);
            console.log(`${res.length} rows migrated in ${endWrite - startRead}ms. lastCreatedAt: ${checkpoint.lastCreatedAt}.`);
        } catch (err) {
            console.error('Error saving checkpoint:', err);
            process.exit(1);
        }
    }
    console.log('Data migration completed');
}

async function getCheckpoint(): Promise<Checkpoint> {
    try {
        const data = await fs.promises.readFile(checkpointFile, 'utf8');
        return JSON.parse(data) as Checkpoint;
    } catch (err) {
        if (err['code'] == 'ENOENT') {
            return { lastCreatedAt: null, lastId: null };
        }
        throw err;
    }
}

async function saveCheckpoint(checkpoint: Checkpoint) {
    await fs.promises.writeFile(checkpointFile, JSON.stringify(checkpoint));
}

// time execution
const start = new Date();
migrate()
    .catch((err: unknown) => {
        console.error('Error occurred during data migration:', err);
    })
    .finally(async () => {
        await sourceKnex.destroy();
        await targetKnex.destroy();

        const end = new Date();
        console.log('Execution took:', (end.getTime() - start.getTime()) / 1000, 's');
    });
