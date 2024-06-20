import { describe, it, beforeAll, expect, vi } from 'vitest';
import type { Environment, SyncConfig } from '@nangohq/shared';
import db, { multipleMigrations } from '@nangohq/database';
import {
    seeders,
    configService,
    connectionService,
    createSync,
    getSchedule,
    createSchedule,
    ScheduleStatus,
    SyncClient,
    DEMO_GITHUB_CONFIG_KEY,
    DEMO_SYNC_NAME,
    SyncConfigType
} from '@nangohq/shared';
import { exec } from './autoIdleDemo.js';
import { nanoid, Ok } from '@nangohq/utils';

describe('Auto Idle Demo', () => {
    let env: Environment;
    beforeAll(async () => {
        await multipleMigrations();
        env = await seeders.createEnvironmentSeed(0, 'dev');
        await seeders.createConfigSeeds(env);
    });

    it('should delete syncs', async () => {
        const syncClient = (await SyncClient.getInstance())!;
        vi.spyOn(syncClient, 'runSyncCommand').mockImplementation(() => {
            return Promise.resolve(Ok(true));
        });

        const connName = nanoid();
        const config = await configService.createProviderConfig({
            unique_key: DEMO_GITHUB_CONFIG_KEY,
            provider: 'github',
            environment_id: env.id,
            oauth_client_id: '',
            oauth_client_secret: ''
        });
        await db.knex
            .from<SyncConfig>('_nango_sync_configs')
            .insert({
                created_at: new Date(),
                sync_name: DEMO_SYNC_NAME,
                nango_config_id: config![0]!.id!,
                file_location: '_LOCAL_FILE_',
                version: '1',
                models: ['GithubIssueDemo'],
                active: true,
                runs: 'every 5 minutes',
                input: '',
                model_schema: [],
                environment_id: env.id,
                deleted: false,
                track_deletes: false,
                type: SyncConfigType.SYNC,
                auto_start: false,
                attributes: {},
                metadata: {},
                pre_built: true,
                is_public: false,
                enabled: true
            })
            .returning('id');
        const conn = await connectionService.upsertConnection(connName, DEMO_GITHUB_CONFIG_KEY, 'github', {} as any, {}, env.id, 0);
        const connId = conn[0]!.connection.id!;
        const sync = (await createSync(connId, DEMO_SYNC_NAME))!;
        await createSchedule(sync.id, '86400', 0, ScheduleStatus.RUNNING, nanoid());
        const schedBefore = await getSchedule(sync.id);
        expect(schedBefore?.status).toBe(ScheduleStatus.RUNNING);

        // First execution nothings happen
        await exec();

        const schedMid = await getSchedule(sync.id);
        expect(schedMid?.status).toBe(ScheduleStatus.RUNNING);

        // Second execution it should pick the old sync
        await db.knex.from('_nango_syncs').update({ updated_at: new Date(Date.now() - 86400 * 2 * 1000) });
        await exec();

        const schedAfter = await getSchedule(sync.id);
        expect(schedAfter?.status).toBe(ScheduleStatus.PAUSED);
    });
});
