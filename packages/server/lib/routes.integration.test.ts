import { migrateMapping } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { multipleMigrations } from '@nangohq/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runServer } from './utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;
describe('GET /logs', () => {
    beforeAll(async () => {
        await multipleMigrations();
        await migrateMapping();

        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should handle invalid json', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await fetch(`${api.url}/api/v1/environment/callback`, {
            method: 'POST',
            body: 'undefined',
            headers: { Authorization: `Bearer ${env.secret_key}`, 'content-type': 'application/json' }
        });

        expect(await res.json()).toStrictEqual({
            error: {
                code: 'invalid_json',
                message: expect.any(String) // unfortunately the message is different depending on the platform
            }
        });
    });
});
