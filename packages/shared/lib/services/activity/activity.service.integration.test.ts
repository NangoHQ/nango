import { expect, describe, it, beforeAll } from 'vitest';
import db, { multipleMigrations } from '@nangohq/database';
import * as ActivityService from './activity.service.js';
import type { ActivityLog } from '../../models/Activity.js';

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
});
