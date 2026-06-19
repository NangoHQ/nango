import { beforeAll, describe, expect, it, vi } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { createSync, getFunctionFileLocations, seeders } from '@nangohq/shared';
import { Ok, getLogger } from '@nangohq/utils';

import { DeletionBudgetExceeded } from './batchDelete.js';
import { deleteSyncConfigData } from './deleteSyncConfigData.js';
import { tasks } from '../tasks/index.js';

import type { BatchDeleteSharedOptions } from './batchDelete.js';
import type * as serverUtils from '../utils/utils.js';

vi.mock('../utils/utils.js', async (importOriginal) => {
    const actual = await importOriginal<typeof serverUtils>();
    return {
        ...actual,
        getOrchestrator: () => ({ deleteSyncs: () => Promise.resolve(Ok(undefined)) })
    };
});

const { createConfigSeed, createConnectionSeed, createEnvironmentSeed, createSyncJobSeeds, createSyncSeeds } = seeders;

const logger = getLogger('test.deletion');

const opts = (deadline: Date, limit: number): BatchDeleteSharedOptions => ({ deadline, limit, logger, sleepMs: 0 });

const countSyncs = (syncConfigId: number) =>
    db.knex.from('_nango_syncs').where({ sync_config_id: syncConfigId }).count<{ count: string }[]>('* as count').first();
const countConfig = (id: number) => db.knex.from('_nango_sync_configs').where({ id }).count<{ count: string }[]>('* as count').first();
const configExists = async (id: number) => Number((await countConfig(id))!.count) === 1;

// The seeder always creates an active version; insert sibling versions (history / redeploy) directly.
async function insertVersion(opts: {
    environment_id: number;
    nango_config_id: number;
    sync_name: string;
    version: string;
    active: boolean;
    deleted: boolean;
    fileLocation?: string;
}) {
    const now = new Date();
    const [row] = await db.knex
        .from('_nango_sync_configs')
        .insert({
            environment_id: opts.environment_id,
            sync_name: opts.sync_name,
            type: 'sync',
            file_location: opts.fileLocation ?? 'file_location',
            nango_config_id: opts.nango_config_id,
            version: opts.version,
            source: 'standalone',
            active: opts.active,
            deleted: opts.deleted,
            ...(opts.deleted ? { deleted_at: now } : {}),
            runs: 'runs',
            track_deletes: false,
            auto_start: false,
            webhook_subscriptions: [],
            enabled: true,
            created_at: now,
            updated_at: now,
            models: ['User']
        })
        .returning<{ id: number }[]>('id');
    return row!.id;
}

describe('deleteSyncConfigData (deletion tree)', () => {
    beforeAll(async () => {
        await multipleMigrations();
        await tasks.migrate();
    });

    it('hard-deletes every sync (across connections + variants), their jobs, endpoints, and the config last', async () => {
        const env = await createEnvironmentSeed();
        const integration = await createConfigSeed(env, 'github', 'github');
        const conn1 = await createConnectionSeed({ env, provider: 'github' });
        const conn2 = await createConnectionSeed({ env, provider: 'github' });

        const { syncConfig, sync: syncA } = await createSyncSeeds({
            connectionId: conn1.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'tree-sync',
            type: 'sync',
            source: 'standalone',
            models: ['User'],
            endpoints: [{ method: 'GET', path: '/users', model: 'User' }]
        });
        const syncAVariant = await createSync({ connectionId: conn1.id, syncConfig: syncConfig, variant: 'other' });
        const syncB = await createSync({ connectionId: conn2.id, syncConfig: syncConfig, variant: 'base' });
        if (!syncAVariant || !syncB) {
            throw new Error('failed to seed syncs');
        }

        await createSyncJobSeeds(syncA.id);
        await createSyncJobSeeds(syncB.id);

        // Sanity: 3 syncs for this config.
        expect(Number((await countSyncs(syncConfig.id))!.count)).toBe(3);

        // Small batch size, generous deadline → runs to completion.
        await deleteSyncConfigData({ syncConfigId: syncConfig.id, environmentId: env.id, models: ['User'] }, opts(new Date(Date.now() + 60_000), 1));

        expect(Number((await countSyncs(syncConfig.id))!.count)).toBe(0);
        expect(Number((await countConfig(syncConfig.id))!.count)).toBe(0);
        const jobs = await db.knex
            .from('_nango_sync_jobs')
            .whereIn('sync_id', [syncA.id, syncAVariant.id, syncB.id])
            .count<{ count: string }[]>('* as count')
            .first();
        expect(Number(jobs!.count)).toBe(0);
        const endpoints = await db.knex.from('_nango_sync_endpoints').where({ sync_config_id: syncConfig.id }).count<{ count: string }[]>('* as count').first();
        expect(Number(endpoints!.count)).toBe(0);
    });

    it('deletes the whole version history of the function but preserves a redeployed active version of the same name', async () => {
        const env = await createEnvironmentSeed();
        const integration = await createConfigSeed(env, 'github', 'github');
        const connTarget = await createConnectionSeed({ env, provider: 'github' });
        const connLive = await createConnectionSeed({ env, provider: 'github' });

        // The deleted version (soft-deleted: active=false, deleted=true) — the row the task is handed.
        const { syncConfig: target } = await createSyncSeeds({
            connectionId: connTarget.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'versioned-fn',
            version: '2.0.0',
            type: 'sync',
            source: 'standalone',
            models: ['User']
        });
        await db.knex.from('_nango_sync_configs').where({ id: target.id }).update({ active: false, deleted: true, deleted_at: new Date() });

        // An older inactive history version (active=false, deleted=false) — never reaped by the cron today.
        const historyId = await insertVersion({
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'versioned-fn',
            version: '1.0.0',
            active: false,
            deleted: false
        });

        // A redeploy of the SAME name after the delete → a fresh active version that must survive.
        const liveId = await insertVersion({
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'versioned-fn',
            version: '3.0.0',
            active: true,
            deleted: false
        });
        const liveSync = await createSync({ connectionId: connLive.id, syncConfig: { ...target, id: liveId, version: '3.0.0' }, variant: 'base' });
        if (!liveSync) {
            throw new Error('failed to seed live sync');
        }

        await deleteSyncConfigData({ syncConfigId: target.id, environmentId: env.id, models: ['User'] }, opts(new Date(Date.now() + 60_000), 1));

        // The handed-in version and its inactive history are gone, along with their syncs.
        expect(await configExists(target.id)).toBe(false);
        expect(await configExists(historyId)).toBe(false);
        expect(Number((await countSyncs(target.id))!.count)).toBe(0);

        // The redeployed live version (active, same name) and its sync are untouched.
        expect(await configExists(liveId)).toBe(true);
        expect(Number((await countSyncs(liveId))!.count)).toBe(1);
    });

    it('gathers artifact keys only for the deleted versions, never an active redeploy of the same name', async () => {
        const env = await createEnvironmentSeed();
        const integration = await createConfigSeed(env, 'github', 'github');

        const historyId = await insertVersion({
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'scoped-fn',
            version: '1.0.0',
            active: false,
            deleted: false,
            fileLocation: 'config/hist/scoped-fn.js'
        });
        await insertVersion({
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'scoped-fn',
            version: '2.0.0',
            active: true,
            deleted: false,
            fileLocation: 'config/live/scoped-fn.js'
        });

        const files = await getFunctionFileLocations(historyId);

        expect(files).toContain('config/hist/scoped-fn.js');
        expect(files).not.toContain('config/live/scoped-fn.js');
    });

    it('keeps a file_location shared with an active version (a redeploy can reuse an older version path)', async () => {
        const env = await createEnvironmentSeed();
        const integration = await createConfigSeed(env, 'github', 'github');
        const shared = 'config/shared/shared-fn.js';

        const historyId = await insertVersion({
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'shared-fn',
            version: '1.0.0',
            active: false,
            deleted: false,
            fileLocation: shared
        });
        // Active redeploy reusing the SAME file_location (unchanged file → deploy reuses the path).
        await insertVersion({
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'shared-fn',
            version: '2.0.0',
            active: true,
            deleted: false,
            fileLocation: shared
        });

        const files = await getFunctionFileLocations(historyId);

        // The shared .js (and its derived .ts) must NOT be deleted — the live version still points at it.
        expect(files).not.toContain(shared);
        expect(files).not.toContain('config/shared/shared-fn.ts');
    });

    it('throws DeletionBudgetExceeded on a passed deadline and leaves the config row in place (resumable)', async () => {
        const env = await createEnvironmentSeed();
        const integration = await createConfigSeed(env, 'github', 'github');
        const conn1 = await createConnectionSeed({ env, provider: 'github' });
        const conn2 = await createConnectionSeed({ env, provider: 'github' });

        const { syncConfig } = await createSyncSeeds({
            connectionId: conn1.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'tree-sync-budget',
            type: 'sync',
            source: 'standalone',
            models: ['User']
        });
        const syncB = await createSync({ connectionId: conn2.id, syncConfig: syncConfig, variant: 'base' });
        if (!syncB) {
            throw new Error('failed to seed sync');
        }

        // limit 1 + already-past deadline → after deleting the first sync, the budget check throws.
        await expect(
            deleteSyncConfigData({ syncConfigId: syncConfig.id, environmentId: env.id, models: ['User'] }, opts(new Date(Date.now() - 1), 1))
        ).rejects.toBeInstanceOf(DeletionBudgetExceeded);

        // The config row must survive (hard-deleted only after all syncs are gone) so a retry resumes.
        expect(Number((await countConfig(syncConfig.id))!.count)).toBe(1);
        expect(Number((await countSyncs(syncConfig.id))!.count)).toBeGreaterThan(0);
    });
});
