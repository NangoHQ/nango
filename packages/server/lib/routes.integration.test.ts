import { seeders } from '@nangohq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runServer } from './utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;
describe('route', () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });
    describe('GET /api/v1/environment/callback', () => {
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
});
