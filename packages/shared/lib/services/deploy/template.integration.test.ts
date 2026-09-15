import { afterEach, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';

import { createConfigSeed, seedAccountEnvAndUser } from '../../seeders/index.js';
import { getTestStdSyncConfig } from '../../seeders/syncConfig.seeder.js';
import remoteFileService from '../file/remote.service.js';
import { getActionsByProviderConfigKey } from '../sync/config/config.service.js';
import { deployTemplates } from './template.js';

import type { LogContext } from '@nangohq/logs';
import type { DBSyncConfig, NangoSyncConfig } from '@nangohq/types';

function mockLogCtx(): { logCtx: LogContext; success: ReturnType<typeof vi.fn>; failed: ReturnType<typeof vi.fn> } {
    const success = vi.fn().mockResolvedValue(undefined);
    const failed = vi.fn().mockResolvedValue(undefined);
    return {
        success,
        failed,
        logCtx: {
            info: vi.fn().mockResolvedValue(undefined),
            error: vi.fn().mockResolvedValue(undefined),
            debug: vi.fn().mockResolvedValue(undefined),
            success,
            failed
        } as unknown as LogContext
    };
}

function actionTemplate(name: string, overrides: Partial<NangoSyncConfig> = {}): NangoSyncConfig {
    return getTestStdSyncConfig({
        name,
        type: 'action',
        endpoints: [{ method: 'POST', path: `/${name}` }],
        returns: ['Result'],
        json_schema: { type: 'object' },
        ...overrides
    });
}

describe('deployTemplates', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('deploys several catalog actions in one pass', async () => {
        vi.spyOn(remoteFileService, 'copy').mockResolvedValue('_LOCAL_FILE_');
        const { env, account } = await seedAccountEnvAndUser();
        const integration = await createConfigSeed(env, 'bulk-actions', 'github');
        const { logCtx, success, failed } = mockLogCtx();

        const result = await deployTemplates({
            environment: env,
            team: account,
            templates: [actionTemplate('create-issue'), actionTemplate('create-label')],
            integration,
            deployInfo: { integrationId: integration.unique_key, provider: 'github' },
            logCtx
        });

        expect(result.skipped).toEqual([]);
        expect(result.deployed.map((item) => item.name).sort()).toEqual(['create-issue', 'create-label']);

        const stored = await getActionsByProviderConfigKey(env.id, integration.unique_key);
        expect(stored.map((row) => row.sync_name).sort()).toEqual(['create-issue', 'create-label']);
        expect(stored.every((row) => row.enabled && row.source === 'catalog' && row.type === 'action')).toBe(true);
        expect(success).not.toHaveBeenCalled();
        expect(failed).not.toHaveBeenCalled();
    });

    it('skips names that already have an active config, including custom source', async () => {
        vi.spyOn(remoteFileService, 'copy').mockResolvedValue('_LOCAL_FILE_');
        const { env, account } = await seedAccountEnvAndUser();
        const integration = await createConfigSeed(env, 'bulk-skip', 'github');
        const now = new Date();
        await db.knex.from<DBSyncConfig>('_nango_sync_configs').insert({
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'create-issue',
            type: 'action',
            source: 'repo',
            active: true,
            deleted: false,
            file_location: 'file_location',
            version: '0.0.0',
            models: [],
            runs: null,
            track_deletes: false,
            auto_start: false,
            enabled: true,
            webhook_subscriptions: [],
            created_at: now,
            updated_at: now
        });

        const result = await deployTemplates({
            environment: env,
            team: account,
            templates: [actionTemplate('create-issue'), actionTemplate('create-label')],
            integration,
            deployInfo: { integrationId: integration.unique_key, provider: 'github' },
            logCtx: mockLogCtx().logCtx
        });

        expect(result.skipped).toEqual([{ name: 'create-issue', reason: 'already_deployed' }]);
        expect(result.deployed.map((item) => item.name)).toEqual(['create-label']);
    });

    it('continues the batch when one copy fails', async () => {
        vi.spyOn(remoteFileService, 'copy').mockImplementation(({ sourcePath }) => {
            if (sourcePath.includes('create-issue')) {
                return Promise.resolve(null);
            }
            return Promise.resolve('_LOCAL_FILE_');
        });
        const { env, account } = await seedAccountEnvAndUser();
        const integration = await createConfigSeed(env, 'bulk-copy-fail', 'github');

        const result = await deployTemplates({
            environment: env,
            team: account,
            templates: [actionTemplate('create-issue'), actionTemplate('create-label')],
            integration,
            deployInfo: { integrationId: integration.unique_key, provider: 'github' },
            logCtx: mockLogCtx().logCtx
        });

        expect(result.skipped).toEqual([{ name: 'create-issue', reason: 'copy_failed' }]);
        expect(result.deployed.map((item) => item.name)).toEqual(['create-label']);
    });
});
