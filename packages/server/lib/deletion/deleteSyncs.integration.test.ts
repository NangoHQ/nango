import { beforeAll, describe, expect, it, vi } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { format, recordModelName, records } from '@nangohq/records';
import { createSync, seeders } from '@nangohq/shared';
import { getLogger, Ok } from '@nangohq/utils';

import { envs } from '../env.js';
import { tasks } from '../tasks/index.js';
import { deleteSyncRecords } from './deleteSyncRecords.js';
import { deleteSyncs } from './deleteSyncs.js';

import type * as serverUtils from '../utils/utils.js';
import type { BatchDeleteSharedOptions } from './batchDelete.js';

vi.mock('../utils/utils.js', async (importOriginal) => {
    const actual = await importOriginal<typeof serverUtils>();
    return {
        ...actual,
        getOrchestrator: () => ({ deleteSyncs: () => Promise.resolve(Ok(undefined)) })
    };
});

const { createConfigSeed, createConnectionSeed, createEnvironmentSeed, createSyncJobSeeds, createSyncSeeds } = seeders;

const logger = getLogger('test.deletion');
const opts: BatchDeleteSharedOptions = { deadline: new Date(Date.now() + 60_000), limit: 100, logger, sleepMs: 0 };
const MODEL = 'User';
const EXTERNAL_ID = 'synthetic-sentinel';

describe('deleteSyncs records', () => {
    beforeAll(async () => {
        await multipleMigrations();
        await tasks.migrate();
        await records.migrate();
    });

    it('deletes the variant records and leaves the base records active', async () => {
        const seeded = await seedBaseAndVariant();

        await deleteSyncs(
            [
                {
                    id: seeded.variant.id,
                    nangoConnectionId: seeded.connectionId,
                    environmentId: seeded.environmentId,
                    models: seeded.models,
                    variant: 'foo'
                }
            ],
            opts
        );
        await runEnqueuedDeleteRecords(seeded.variant.id);

        expect(await lastAction(seeded, recordModelName(MODEL, 'base'))).toBe('ADDED');
        expect(await lastAction(seeded, recordModelName(MODEL, 'foo'))).toBe('DELETED');
    });

    it('deletes the base records and leaves the variant records active', async () => {
        const seeded = await seedBaseAndVariant();

        await deleteSyncs(
            [
                {
                    id: seeded.base.id,
                    nangoConnectionId: seeded.connectionId,
                    environmentId: seeded.environmentId,
                    models: seeded.models,
                    variant: 'base'
                }
            ],
            opts
        );
        await runEnqueuedDeleteRecords(seeded.base.id);

        expect(await lastAction(seeded, recordModelName(MODEL, 'base'))).toBe('DELETED');
        expect(await lastAction(seeded, recordModelName(MODEL, 'foo'))).toBe('ADDED');
    });
});

async function seedBaseAndVariant() {
    const env = await createEnvironmentSeed();
    const integration = await createConfigSeed(env, 'github', 'github');
    const connection = await createConnectionSeed({ env, provider: 'github' });
    const { syncConfig, sync: base } = await createSyncSeeds({
        connectionId: connection.id,
        environment_id: env.id,
        nango_config_id: integration.id!,
        sync_name: 'variant-cleanup',
        type: 'sync',
        source: 'standalone',
        models: [MODEL]
    });
    const variant = await createSync({ connectionId: connection.id, syncConfig, variant: 'foo' });
    if (!variant) {
        throw new Error('failed to seed variant sync');
    }

    const baseJob = await createSyncJobSeeds(base.id);
    const variantJob = await createSyncJobSeeds(variant.id);
    await saveRecord({ connectionId: connection.id, environmentId: env.id, syncId: base.id, syncJobId: baseJob.id, variant: 'base' });
    await saveRecord({ connectionId: connection.id, environmentId: env.id, syncId: variant.id, syncJobId: variantJob.id, variant: 'foo' });

    return { connectionId: connection.id, environmentId: env.id, models: syncConfig.models, base, variant };
}

async function saveRecord({
    connectionId,
    environmentId,
    syncId,
    syncJobId,
    variant
}: {
    connectionId: number;
    environmentId: number;
    syncId: string;
    syncJobId: number;
    variant: string;
}) {
    const model = recordModelName(MODEL, variant);
    const formatted = format.formatRecords({
        data: [{ id: EXTERNAL_ID, stream: variant }],
        connectionId,
        model,
        syncId,
        syncJobId
    });
    if (formatted.isErr()) {
        throw formatted.error;
    }
    const saved = await records.upsert({ records: formatted.value, connectionId, environmentId, model, plan: null });
    if (saved.isErr()) {
        throw saved.error;
    }
}

async function runEnqueuedDeleteRecords(syncId: string) {
    const row = await db.knex
        .withSchema(envs.TASKS_DATABASE_SCHEMA)
        .from('tasks')
        .whereRaw("payload->>'syncId' = ?", [syncId])
        .orderBy('created_at', 'desc')
        .first<{ id: string; payload: { syncId: string; nangoConnectionId: number; environmentId: number; models: string[]; generation: number } }>();
    if (!row) {
        throw new Error(`deleteRecords task was not enqueued for sync ${syncId}`);
    }

    await deleteSyncRecords(row.payload, { logger, deadline: new Date(Date.now() + 60_000) });
}

async function lastAction(seeded: { connectionId: number }, model: string) {
    const result = await records.getRecords({ connectionId: seeded.connectionId, model, externalIds: [EXTERNAL_ID], plan: null });
    if (result.isErr()) {
        throw result.error;
    }
    return result.value.records[0]?._nango_metadata.last_action ?? null;
}
