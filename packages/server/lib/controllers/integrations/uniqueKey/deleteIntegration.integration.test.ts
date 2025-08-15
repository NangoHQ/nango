import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { gettingStartedService, seeders } from '@nangohq/shared';

import { isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

import type { DBGettingStartedMeta } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/integrations/:uniqueKey';

describe(`DELETE ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, { method: 'DELETE', params: { uniqueKey: 'github' } });

        shouldBeProtected(res);
    });

    it('should delete one', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github', { oauth_client_id: 'foo', oauth_client_secret: 'bar', oauth_scopes: 'hello, world' });

        const res = await api.fetch(endpoint, { method: 'DELETE', token: env.secret_key, params: { uniqueKey: 'github' } });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({
            success: true
        });
    });

    it('should delete getting started meta', async () => {
        const { env, account } = await seeders.seedAccountEnvAndUser();

        // Getting started meta expects a preprovisioned provider config
        await seeders.createPreprovisionedProviderConfigSeed(env, 'google-calendar-getting-started', 'google-calendar', {
            oauth_client_id: 'foo',
            oauth_client_secret: 'bar',
            oauth_scopes: 'hello, world'
        });

        const metaResult = await gettingStartedService.getOrCreateMeta(account.id, env.id);
        expect(metaResult.isOk()).toBe(true);
        const meta = metaResult.unwrap();

        const res = await api.fetch(endpoint, { method: 'DELETE', token: env.secret_key, params: { uniqueKey: 'google-calendar-getting-started' } });
        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            success: true
        });

        const metaAfter = await db.knex.from<DBGettingStartedMeta>('getting_started_meta').where({ id: meta.id }).first();
        expect(metaAfter).toBeUndefined();
    });
});
