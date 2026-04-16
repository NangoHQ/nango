import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { envs } from '../../env.js';
import { isError, runServer, shouldBeProtected } from '../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;
const originalNodeEnv = envs.NODE_ENV;

async function seedAccountWithRemoteFunctions() {
    const seed = await seeders.seedAccountEnvAndUser();
    await db.knex('plans').where('id', seed.plan.id).update({ remote_functions: true });
    return seed;
}

describe('remote-function public API', () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    afterEach(() => {
        envs.NODE_ENV = originalNodeEnv;
    });

    it('protects POST /remote-function/compile', async () => {
        const res = await api.fetch('/remote-function/compile', {
            method: 'POST',
            body: {
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: 'sync',
                code: 'export default {}'
            }
        });

        shouldBeProtected(res);
    });

    it('rejects valid secret keys without remote functions plan flag', async () => {
        const { secret } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch('/remote-function/compile', {
            method: 'POST',
            token: secret.secret,
            body: {
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: 'sync',
                code: 'export default {}'
            }
        });

        expect(res.res.status).toBe(403);
        expect(res.json).toStrictEqual({
            error: {
                code: 'forbidden',
                message: 'Remote functions are not enabled for this account'
            }
        });
    });

    it('rejects unsafe function names on POST /remote-function/compile', async () => {
        const { secret } = await seedAccountWithRemoteFunctions();

        const res = await api.fetch('/remote-function/compile', {
            method: 'POST',
            token: secret.secret,
            body: {
                integration_id: 'github',
                function_name: 'bad/name',
                function_type: 'sync',
                code: 'export default {}'
            }
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json.error.code).toBe('invalid_body');
    });

    it('returns integration_not_found on POST /remote-function/compile', async () => {
        const { secret } = await seedAccountWithRemoteFunctions();

        const res = await api.fetch('/remote-function/compile', {
            method: 'POST',
            token: secret.secret,
            body: {
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: 'sync',
                code: 'export default {}'
            }
        });

        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual({
            error: {
                code: 'integration_not_found',
                message: "Integration 'github' was not found"
            }
        });
    });

    it('allows valid secret keys in production', async () => {
        envs.NODE_ENV = 'production';

        const { secret } = await seedAccountWithRemoteFunctions();

        const res = await api.fetch('/remote-function/compile', {
            method: 'POST',
            token: secret.secret,
            body: {
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: 'sync',
                code: 'export default {}'
            }
        });

        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual({
            error: {
                code: 'integration_not_found',
                message: "Integration 'github' was not found"
            }
        });
    });

    it('returns connection_not_found on POST /remote-function/dryrun', async () => {
        const { env, secret } = await seedAccountWithRemoteFunctions();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch('/remote-function/dryrun', {
            method: 'POST',
            token: secret.secret,
            body: {
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: 'sync',
                code: 'export default {}',
                connection_id: 'missing-connection'
            }
        });

        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual({
            error: {
                code: 'connection_not_found',
                message: "Connection 'missing-connection' was not found for integration 'github'"
            }
        });
    });

    it('returns integration_not_found on POST /remote-function/deploy', async () => {
        const { secret } = await seedAccountWithRemoteFunctions();

        const res = await api.fetch('/remote-function/deploy', {
            method: 'POST',
            token: secret.secret,
            body: {
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: 'sync',
                code: 'export default {}'
            }
        });

        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual({
            error: {
                code: 'integration_not_found',
                message: "Integration 'github' was not found"
            }
        });
    });
});
