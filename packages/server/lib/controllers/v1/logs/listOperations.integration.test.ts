import { migrateMapping } from '@nangohq/logs';
import { multipleMigrations } from '@nangohq/shared';
import { beforeAll, describe } from 'vitest';

describe('GET /logs', () => {
    beforeAll(async () => {
        await multipleMigrations();
        await migrateMapping();
    });

    // it('should be protected', async () => {
    //     const res = await t.fetch.get('/0/activities');
    //     await shouldBeProtected(res);
    // });
});
