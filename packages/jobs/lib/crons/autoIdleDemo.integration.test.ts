import { describe, it, beforeAll, expect, vi } from 'vitest';
import {
    seeders,
    multipleMigrations,
    configService,
    environmentService,
    connectionService,
    createSync,
    db,
    getSchedule,
    createSchedule,
    ScheduleStatus,
    SyncClient,
    resultOk
} from '@nangohq/shared';
import { exec } from './autoIdleDemo.js';
import { nanoid } from 'nanoid';

const envName = 'dev';

describe('Auto Idle Demo', () => {
    beforeAll(async () => {
        await multipleMigrations();
        await seeders.createConfigSeeds(envName);
    });

    it('should delete syncs', async () => {
        const syncClient = (await SyncClient.getInstance())!;
        vi.spyOn(syncClient, 'runSyncCommand').mockImplementation(() => {
            return Promise.resolve(resultOk(true));
        });

        const connName = nanoid();
        const env = await environmentService.createEnvironment(0, envName);
        await configService.createProviderConfig({
            unique_key: 'demo-github-integration',
            provider: 'github',
            environment_id: env!.id,
            oauth_client_id: '',
            oauth_client_secret: ''
        });
        const conn = await connectionService.upsertConnection(connName, 'demo-github-integration', 'github', {} as any, {}, env!.id, 0);
        const connId = conn[0]!.id;
        const sync = (await createSync(connId, 'github-issues-lite'))!;
        await createSchedule(sync.id!, '86400', 0, ScheduleStatus.RUNNING, nanoid());
        const schedBefore = await getSchedule(sync.id!);
        expect(schedBefore?.status).toBe(ScheduleStatus.RUNNING);

        // First execution nothings happen
        await exec();

        const schedMid = await getSchedule(sync.id!);
        expect(schedMid?.status).toBe(ScheduleStatus.RUNNING);

        // Second execution it should pick the old sync
        await db.knex.from('nango._nango_syncs').update({ updated_at: new Date(Date.now() - 86400 * 2 * 1000) });
        await exec();

        const schedAfter = await getSchedule(sync.id!);
        expect(schedAfter?.status).toBe(ScheduleStatus.PAUSED);
    });
});
