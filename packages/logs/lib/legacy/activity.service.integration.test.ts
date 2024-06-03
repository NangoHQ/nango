import { expect, describe, it, beforeAll } from 'vitest';
import db, { multipleMigrations } from '@nangohq/database';
import * as ActivityService from './activity.service.js';
import type { ActivityLog } from './types.js';

describe('Activity service integration tests', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('Should not create an activity without an environment id', async () => {
        const log: ActivityLog = {} as ActivityLog;

        const logId = await ActivityService.createActivityLog(log);
        expect(logId).toBeNull();
    });

    it('Should create an activity log and retrieve its ID', async () => {
        const result = await db.knex.select('*').from('_nango_environments');

        const log: ActivityLog = {
            environment_id: result[0].id
        } as ActivityLog;

        const logId = await ActivityService.createActivityLog(log);
        expect(logId).not.toBeNull();
    });

    it('Should update provider for a given activity log ID', async () => {
        const result = await db.knex.select('*').from('_nango_environments');
        const log: ActivityLog = {
            environment_id: result[0].id
        } as ActivityLog;
        const createdLog = await ActivityService.createActivityLog(log);
        const provider = 'newProvider';
        await ActivityService.updateProvider(createdLog as number, provider);

        const updatedLog = await db.knex
            .from<ActivityLog>('_nango_activity_logs')
            .where({ id: createdLog as number })
            .first();
        expect(updatedLog.provider).toEqual(provider);
    });
});
