import Knex from 'knex';
import ms from 'ms';
import { uuidv7 } from 'uuidv7';

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

interface SourceSchedule {
    id: string;
    status: 'PAUSED' | 'RUNNING';
    sync_id: string;
    frequency: string;
    created_at: string;
    updated_at: string;
    deleted_at: string;
    sync_name: string;
    connection_id: string;
    nango_connection_id: string;
    provider_config_key: string;
    environment_id: string;
}

// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
type JsonObject = { [Key in string]: JsonValue } & { [Key in string]?: JsonValue | undefined };
type JsonArray = JsonValue[] | readonly JsonValue[];
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonArray;

interface TargetSchedule {
    id: string;
    name: string;
    state: 'PAUSED' | 'STARTED' | 'DELETED';
    starts_at: Date;
    frequency: string;
    payload: JsonValue;
    group_key: string;
    retry_max: number;
    created_to_started_timeout_secs: number;
    started_to_completed_timeout_secs: number;
    heartbeat_timeout_secs: number;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
}

function readSchedules(): Promise<SourceSchedule[]> {
    return sourceKnex
        .select<SourceSchedule[]>(
            sourceKnex.raw(`
                    schedule.id,
                    schedule.status,
                    schedule.sync_id,
                    schedule.frequency,
                    schedule.created_at,
                    schedule.updated_at,
                    schedule.deleted_at,
                    sync.name as sync_name,
                    connection.id as nango_connection_id,
                    connection.connection_id as connection_id,
                    connection.provider_config_key as provider_config_key,
                    connection.environment_id as environment_id
                `)
        )
        .from<SourceSchedule>({ schedule: `nango._nango_sync_schedules` })
        .join('nango._nango_syncs as sync', 'schedule.sync_id', 'sync.id')
        .join('nango._nango_connections as connection', 'sync.nango_connection_id', 'connection.id')
        .where({ 'schedule.deleted_at': null })
        .orderBy('schedule.created_at', 'asc');
}

async function writeSchedule(schedule: SourceSchedule): Promise<{ id: string }> {
    const frequencyMs = ms(schedule.frequency);
    if (!frequencyMs) {
        return Promise.reject(new Error(`Invalid frequency: ${schedule.frequency}`));
    }
    const targetSchedule: TargetSchedule = {
        id: uuidv7(),
        name: `environment:${schedule.environment_id}:sync:${schedule.sync_id}`,
        state: schedule.status === 'PAUSED' ? 'PAUSED' : 'STARTED',
        starts_at: new Date(schedule.created_at),
        frequency: `${ms(schedule.frequency)} milliseconds`,
        payload: {
            type: 'sync',
            syncId: schedule.sync_id,
            syncName: schedule.sync_name,
            debug: false,
            connection: {
                id: schedule.nango_connection_id,
                connection_id: schedule.connection_id,
                provider_config_key: schedule.provider_config_key,
                environment_id: schedule.environment_id
            }
        },
        group_key: 'sync',
        retry_max: 0,
        created_to_started_timeout_secs: 3600,
        started_to_completed_timeout_secs: 86400,
        heartbeat_timeout_secs: 1800,
        created_at: new Date(schedule.created_at),
        updated_at: new Date(schedule.updated_at),
        deleted_at: null
    };
    return targetKnex.insert(targetSchedule).into<{ id: string }>(`nango_scheduler.schedules`).onConflict(['name']).ignore().returning(['id']);
}

async function migrate() {
    console.log('Starting schedules migration...');
    console.log('Source DB:', SOURCE_DB_URL);
    console.log('Target DB:', TARGET_DB_URL);

    const schedules = await readSchedules();
    for (const schedule of schedules) {
        try {
            const res = await writeSchedule(schedule);
            console.log('Schedule migrated:', res);
        } catch (err) {
            console.error('Error migrating schedule:', err);
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    console.log('Data migration completed');
}

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
