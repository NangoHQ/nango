import { randomUUID } from 'crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { customerKeyService, seeders } from '@nangohq/shared';

import { runServer } from '../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

/**
 * One auth path resolves both key planes, so isolation is enforced by the route guards rather than by
 * authentication: an account key presented to an environment route authenticates and is then refused
 * with 403, not 401.
 */
describe('account-plane key isolation', () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    it('should refuse an account key on an environment-plane route', async () => {
        const { accountApiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch('/connection', { method: 'GET', query: {}, token: accountApiKey.secret });

        expect(res.res.status).toBe(403);
        expect(res.json).toMatchObject({ error: { code: 'forbidden' } });
    });

    // Provider metadata is account-agnostic, so this route carries no scope guard and an account key
    // is allowed through.
    it('should allow an account key on the provider catalog, which is not environment data', async () => {
        const { accountApiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch('/providers', { method: 'GET', query: {}, token: accountApiKey.secret });

        expect(res.res.status).toBe(200);
    });

    /**
     * `/v1/*` is a catch-all with no `withScope` guard of its own, so nothing refuses the key before the
     * handler. `asyncWrapperWithEnvironment` is what turns that into a 403 instead of a 500.
     */
    it('should refuse an account key on /v1/* with 403 rather than 500', async () => {
        const { accountApiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch('/v1/:path', {
            method: 'GET',
            params: { path: 'anything' },
            query: {},
            headers: { 'provider-config-key': 'unused', 'connection-id': 'unused' },
            token: accountApiKey.secret
        });

        expect(res.res.status).toBe(403);
        expect(res.json).toMatchObject({ error: { code: 'forbidden' } });
    });

    /**
     * A key naming no environment is the account plane by construction, so one carrying environment
     * scopes is self-contradictory: its scopes satisfy the route guard, but there is no environment for
     * the handler to act on. No service path produces this — the relation is deleted directly here — and
     * the contract is that it is refused rather than surfacing as a 500.
     */
    it('should refuse an environment-scoped key bound to no environment', async () => {
        const { account, env } = await seeders.seedAccountEnvAndUser();
        const key = (
            await customerKeyService.createApiKey(db.knex, {
                accountId: account.id,
                target: { type: 'environment', environmentId: env.id },
                displayName: `orphan-${randomUUID()}`,
                scopes: ['environment:*'],
                withSandboxSigningSecret: false
            })
        ).unwrap();
        await db.knex('customer_keys_relations').where({ customer_key_id: key.id }).delete();

        const res = await api.fetch('/connection', { method: 'GET', query: {}, token: key.secret });

        expect(res.res.status).toBe(403);
        expect(res.json).toMatchObject({ error: { code: 'forbidden' } });
    });
});
