import { migrateMapping } from '@nangohq/logs';
import { multipleMigrations } from '@nangohq/shared';
import { beforeAll, describe, it } from 'vitest';
import { runServer, shouldBeProtected } from '../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;
describe('GET /logs', () => {
    beforeAll(async () => {
        await multipleMigrations();
        await migrateMapping();

        api = await runServer();
    });

    it('should be protected', async () => {
        const res = await api.fetch('/api/v1/logs/operations', { method: 'GET', query: { env: 'dev' } });

        shouldBeProtected(res);
    });

    it('should not allow query params', async () => {
        const res = await api.fetch('/api/v1/logs/operations', { method: 'GET' });

        shouldBeProtected(res);
    });
});
