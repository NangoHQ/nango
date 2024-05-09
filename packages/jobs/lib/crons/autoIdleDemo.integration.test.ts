import { describe, it, beforeAll, expect, vi } from 'vitest';
import type { Environment } from '@nangohq/shared';
import {
    seeders,
    multipleMigrations,
    configService,
    connectionService,
    createSync,
    db,
    getSchedule,
    createSchedule,
    ScheduleStatus,
    SyncClient,
    DEMO_GITHUB_CONFIG_KEY,
    DEMO_SYNC_NAME
} from '@nangohq/shared';
import { exec } from './autoIdleDemo.js';
import { nanoid, resultOk } from '@nangohq/utils';

describe('Auto Idle Demo', async () => {
    let env: Environment;
    beforeAll(async () => {
        await multipleMigrations();
        env = await seeders.createEnvironmentSeed(0, 'dev');
        await seeders.createConfigSeeds(env);
    });

    it('should delete syncs', async () => {
        const syncClient = (await SyncClient.getInstance())!;
        vi.spyOn(syncClient, 'runSyncCommand').mockImplementation(() => {
            return Promise.resolve(resultOk(true));
        });

        const connName = nanoid();
        await configService.createProviderConfig({
            unique_key: DEMO_GITHUB_CONFIG_KEY,
            provider: 'github',
            environment_id: env.id,
            oauth_client_id: '',
            oauth_client_secret: ''
        });
        const conn = await connectionService.upsertConnection(connName, DEMO_GITHUB_CONFIG_KEY, 'github', {} as any, {}, env.id, 0);
        const connId = conn[0]!.id;
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
