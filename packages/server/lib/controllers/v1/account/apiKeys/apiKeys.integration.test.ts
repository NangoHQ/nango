import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { MAX_API_KEYS_PER_ACCOUNT, seeders, userService } from '@nangohq/shared';

import { authenticateUser, isError, isSuccess, runServer, shouldBeProtected } from '../../../../utils/tests.js';

import type { DBCustomerKey } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

describe('Account API keys endpoints', () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch('/api/v1/account/api-keys', { method: 'GET' });
        shouldBeProtected(res);
    });

    it('should create and list a readable full-access account key', async () => {
        const { apiKey: environmentApiKey, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const create = await api.fetch('/api/v1/account/api-keys', {
            method: 'POST',
            body: { display_name: 'Billing automation' },
            session
        });

        expect(create.res.status).toBe(200);
        isSuccess(create.json);
        const createdKey = create.json.data;
        expect(createdKey).toMatchObject({
            display_name: 'Billing automation',
            scopes: ['account:*']
        });
        expect(typeof createdKey.id).toBe('number');
        expect(createdKey.uuid).toBeUUID();
        expect(typeof createdKey.secret).toBe('string');
        expect(typeof createdKey.created_at).toBe('string');

        const list = await api.fetch('/api/v1/account/api-keys', { method: 'GET', session });
        expect(list.res.status).toBe(200);
        isSuccess(list.json);
        const listedKey = list.json.data.find((key) => key.id === createdKey.id);
        expect(listedKey).toEqual({
            id: createdKey.id,
            uuid: createdKey.uuid,
            display_name: 'Billing automation',
            scopes: ['account:*'],
            secret: createdKey.secret,
            last_used_at: null,
            created_at: createdKey.created_at
        });
        expect(list.json.data.some((key) => key.id === environmentApiKey.id)).toBe(false);
    });

    it('should reject client-configured scopes', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const res = await api.fetch('/api/v1/account/api-keys', {
            method: 'POST',
            body: {
                display_name: 'Custom scopes',
                // @ts-expect-error scopes are intentionally not accepted by this endpoint
                scopes: ['account:environments:create']
            },
            session
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json.error.code).toBe('invalid_body');
    });

    it('should keep account keys out of the environment key list', async () => {
        const { env, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const create = await api.fetch('/api/v1/account/api-keys', {
            method: 'POST',
            body: { display_name: 'Account only' },
            session
        });
        isSuccess(create.json);
        const keyId = create.json.data.id;

        const environmentKeys = await api.fetch('/api/v1/environment/api-keys', {
            method: 'GET',
            // @ts-expect-error query params are required
            query: { env: env.name },
            session
        });
        isSuccess(environmentKeys.json);
        expect(environmentKeys.json.data.some((key) => key.id === keyId)).toBe(false);
    });

    it('should isolate listing and deletion by account', async () => {
        const first = await seeders.seedAccountEnvAndUser();
        const second = await seeders.seedAccountEnvAndUser();
        const firstSession = await authenticateUser(api, first.user);
        const secondSession = await authenticateUser(api, second.user);

        const create = await api.fetch('/api/v1/account/api-keys', {
            method: 'POST',
            body: { display_name: 'First account key' },
            session: firstSession
        });
        isSuccess(create.json);
        const keyId = create.json.data.id;

        const secondList = await api.fetch('/api/v1/account/api-keys', { method: 'GET', session: secondSession });
        isSuccess(secondList.json);
        expect(secondList.json.data.some((key) => key.id === keyId)).toBe(false);

        const deletion = await api.fetch('/api/v1/account/api-keys/:keyId', {
            method: 'DELETE',
            params: { keyId },
            session: secondSession
        });
        expect(deletion.res.status).toBe(404);
        isError(deletion.json);
        expect(deletion.json.error.code).toBe('not_found');
    });

    it('should soft-delete an account key', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);
        const create = await api.fetch('/api/v1/account/api-keys', {
            method: 'POST',
            body: { display_name: 'Disposable key' },
            session
        });
        isSuccess(create.json);
        const keyId = create.json.data.id;

        const deletion = await api.fetch('/api/v1/account/api-keys/:keyId', {
            method: 'DELETE',
            params: { keyId },
            session
        });
        expect(deletion.res.status).toBe(200);
        expect(deletion.json).toEqual({ success: true });

        const stored = await db.knex<Pick<DBCustomerKey, 'id' | 'deleted_at'>>('customer_keys').select('deleted_at').where({ id: keyId }).first();
        expect(stored?.deleted_at).toBeInstanceOf(Date);

        const list = await api.fetch('/api/v1/account/api-keys', { method: 'GET', session });
        isSuccess(list.json);
        expect(list.json.data.some((key) => key.id === keyId)).toBe(false);
    });

    it('should not delete an environment key through the account route', async () => {
        const { apiKey: environmentApiKey, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const deletion = await api.fetch('/api/v1/account/api-keys/:keyId', {
            method: 'DELETE',
            params: { keyId: environmentApiKey.id },
            session
        });

        expect(deletion.res.status).toBe(404);
        isError(deletion.json);
        expect(deletion.json.error.code).toBe('not_found');

        const stored = await db
            .knex<Pick<DBCustomerKey, 'id' | 'deleted_at'>>('customer_keys')
            .select('deleted_at')
            .where({ id: environmentApiKey.id })
            .first();
        expect(stored?.deleted_at).toBeNull();
    });

    it('should reject a non-numeric key id', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const deletion = await api.fetch('/api/v1/account/api-keys/:keyId', {
            method: 'DELETE',
            // @ts-expect-error the route only accepts a numeric keyId
            params: { keyId: 'not-a-number' },
            session
        });

        expect(deletion.res.status).toBe(400);
        isError(deletion.json);
        expect(deletion.json.error.code).toBe('invalid_uri_params');
    });

    it('should enforce the per-account key limit', async () => {
        const { account, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        await db.knex('customer_keys').insert(
            Array.from({ length: MAX_API_KEYS_PER_ACCOUNT - 1 }, (_, index) => ({
                account_id: account.id,
                key_type: 'api',
                display_name: `account-key-${index}`,
                scopes: ['account:*'],
                secret: `secret-${index}`,
                iv: '',
                tag: '',
                hashed: `account-key-hash-${account.id}-${index}`
            }))
        );

        const atCap = await api.fetch('/api/v1/account/api-keys', {
            method: 'POST',
            body: { display_name: 'Last allowed account key' },
            session
        });
        expect(atCap.res.status).toBe(200);
        isSuccess(atCap.json);

        const overLimit = await api.fetch('/api/v1/account/api-keys', {
            method: 'POST',
            body: { display_name: 'One too many' },
            session
        });

        expect(overLimit.res.status).toBe(400);
        isError(overLimit.json);
        expect(overLimit.json.error.code).toBe('resource_capped');
    });

    it('should restrict account key management to administrators', async () => {
        const { account, user } = await seeders.seedAccountEnvAndUser({ plan: { has_rbac: true } });
        await userService.update({ id: user.id, role: 'production_support' });
        const session = await authenticateUser(api, user);

        const [existingKey] = await db
            .knex('customer_keys')
            .insert({
                account_id: account.id,
                key_type: 'api',
                display_name: 'admin managed key',
                scopes: ['account:*'],
                secret: 'rbac-secret',
                iv: '',
                tag: '',
                hashed: `account-key-hash-${account.id}-rbac`
            })
            .returning('id');

        const list = await api.fetch('/api/v1/account/api-keys', { method: 'GET', session });
        expect(list.res.status).toBe(403);
        isError(list.json);
        expect(list.json.error.code).toBe('forbidden');

        const create = await api.fetch('/api/v1/account/api-keys', {
            method: 'POST',
            body: { display_name: 'Not allowed' },
            session
        });
        expect(create.res.status).toBe(403);
        isError(create.json);
        expect(create.json.error.code).toBe('forbidden');

        const deletion = await api.fetch('/api/v1/account/api-keys/:keyId', {
            method: 'DELETE',
            params: { keyId: existingKey!.id },
            session
        });
        expect(deletion.res.status).toBe(403);
        isError(deletion.json);
        expect(deletion.json.error.code).toBe('forbidden');

        const stored = await db.knex<Pick<DBCustomerKey, 'id' | 'deleted_at'>>('customer_keys').select('deleted_at').where({ id: existingKey!.id }).first();
        expect(stored?.deleted_at).toBeNull();
    });
});
