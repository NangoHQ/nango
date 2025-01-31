import { seeders } from '@nangohq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isError, runServer } from './utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;
describe('route', () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    describe('Content-type', () => {
        it.each(['GET', 'POST'] as const)('should enforce content-type %s', async (val) => {
            const res = await api.fetch(`/connect/sessions`, {
                method: val as any,
                body: '' as any,
                headers: { 'content-type': 'application/octet-stream' }
            });

            isError(res.json);
            expect(res.json).toStrictEqual({
                error: { code: 'invalid_content_type', message: 'Content-Type header must be application/json' }
            });
        });

        it('should allow empty content-type', async () => {
            const res = await api.fetch(`/connect/sessions`, {
                method: 'POST',
                body: '' as any,
                headers: { 'content-type': '' }
            });

            isError(res.json);
            expect(res.json).toMatchObject({
                error: { code: 'missing_auth_header' }
            });
        });
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
