import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { customerKeyService, seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

import type { AccountApiKeyScope, DBCustomerKey } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;
let keyIndex = 0;

async function seedAccount() {
    return await seeders.seedAccountEnvAndUser();
}

async function createAccountKey(accountId: number, scopes: AccountApiKeyScope[]): Promise<DBCustomerKey> {
    return (
        await customerKeyService.createAccountApiKey(db.knex, {
            accountId,
            displayName: `Environment API key management ${keyIndex++}`,
            scopes
        })
    ).unwrap();
}

describe('Public environment API key management', () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    describe('POST /environment/api-keys', () => {
        it('should be protected', async () => {
            const res = await api.fetch('/environment/api-keys', {
                method: 'POST',
                body: { environment_id: 1, display_name: 'unauthenticated' }
            });

            shouldBeProtected(res);
        });

        it('should deny environment API keys', async () => {
            const { env, apiKey } = await seedAccount();

            const res = await api.fetch('/environment/api-keys', {
                method: 'POST',
                token: apiKey.secret,
                body: { environment_id: env.id, display_name: 'not-from-an-environment-key' }
            });

            expect(res.res.status).toBe(403);
            isError(res.json);
            expect(res.json.error).toEqual({
                code: 'forbidden',
                message: 'Insufficient scope. Required: account:environments:api_keys:create'
            });
        });

        it('should deny Account API keys without the create scope', async () => {
            const { account, env } = await seedAccount();
            const accountKey = await createAccountKey(account.id, ['account:environments:api_keys:delete']);

            const res = await api.fetch('/environment/api-keys', {
                method: 'POST',
                token: accountKey.secret,
                body: { environment_id: env.id, display_name: 'not-with-delete-scope' }
            });

            expect(res.res.status).toBe(403);
            isError(res.json);
            expect(res.json.error).toEqual({
                code: 'forbidden',
                message: 'Insufficient scope. Required: account:environments:api_keys:create'
            });
        });

        it('should create an environment API key with the create scope', async () => {
            const { account, env } = await seedAccount();
            const accountKey = await createAccountKey(account.id, ['account:environments:api_keys:create']);

            const res = await api.fetch('/environment/api-keys', {
                method: 'POST',
                token: accountKey.secret,
                body: { environment_id: env.id, display_name: 'provisioned-ci' }
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json.data).toEqual({
                id: expect.any(Number),
                display_name: 'provisioned-ci',
                scopes: ['environment:*'],
                secret: expect.any(String),
                created_at: expect.any(String)
            });
        });

        it('should not create a key for an environment from another account', async () => {
            const first = await seedAccount();
            const second = await seedAccount();
            const accountKey = await createAccountKey(first.account.id, ['account:environments:api_keys:create']);

            const res = await api.fetch('/environment/api-keys', {
                method: 'POST',
                token: accountKey.secret,
                body: { environment_id: second.env.id, display_name: 'cross-account' }
            });

            expect(res.res.status).toBe(404);
            isError(res.json);
            expect(res.json.error).toEqual({ code: 'not_found', message: 'Environment not found' });
        });
    });

    describe('DELETE /environment/api-keys', () => {
        it('should be protected', async () => {
            const res = await api.fetch('/environment/api-keys', {
                method: 'DELETE',
                body: { environment_id: 1, key_id: 1 }
            });

            shouldBeProtected(res);
        });

        it('should keep create and delete scopes independent', async () => {
            const { account, env } = await seedAccount();
            const createKey = await createAccountKey(account.id, ['account:environments:api_keys:create']);
            const deleteKey = await createAccountKey(account.id, ['account:environments:api_keys:delete']);

            const created = await api.fetch('/environment/api-keys', {
                method: 'POST',
                token: createKey.secret,
                body: { environment_id: env.id, display_name: 'scope-boundary' }
            });
            expect(created.res.status).toBe(200);
            isSuccess(created.json);

            const deniedDelete = await api.fetch('/environment/api-keys', {
                method: 'DELETE',
                token: createKey.secret,
                body: { environment_id: env.id, key_id: created.json.data.id }
            });
            expect(deniedDelete.res.status).toBe(403);

            const deniedCreate = await api.fetch('/environment/api-keys', {
                method: 'POST',
                token: deleteKey.secret,
                body: { environment_id: env.id, display_name: 'not-with-delete-scope' }
            });
            expect(deniedCreate.res.status).toBe(403);

            const deleted = await api.fetch('/environment/api-keys', {
                method: 'DELETE',
                token: deleteKey.secret,
                body: { environment_id: env.id, key_id: created.json.data.id }
            });
            expect(deleted.res.status).toBe(200);
            isSuccess(deleted.json);
            expect(deleted.json).toEqual({ success: true });
        });

        it('should not reveal or delete a key from another account', async () => {
            const first = await seedAccount();
            const second = await seedAccount();
            const created = (
                await customerKeyService.createApiKey(db.knex, {
                    accountId: second.account.id,
                    environmentId: second.env.id,
                    displayName: 'other-account-key'
                })
            ).unwrap();
            const deleteKey = await createAccountKey(first.account.id, ['account:environments:api_keys:delete']);

            const res = await api.fetch('/environment/api-keys', {
                method: 'DELETE',
                token: deleteKey.secret,
                body: { environment_id: second.env.id, key_id: created.id }
            });

            expect(res.res.status).toBe(404);
            isError(res.json);
            expect(res.json.error).toEqual({ code: 'not_found', message: 'Environment not found' });

            const remaining = (await customerKeyService.getApiKeysByEnv(db.knex, second.env.id)).unwrap();
            expect(remaining.map((key) => key.id)).toContain(created.id);
        });

        it('should allow account:* to create and delete environment API keys', async () => {
            const { account, env } = await seedAccount();
            const accountKey = await createAccountKey(account.id, ['account:*']);

            const created = await api.fetch('/environment/api-keys', {
                method: 'POST',
                token: accountKey.secret,
                body: { environment_id: env.id, display_name: 'full-account-access' }
            });
            expect(created.res.status).toBe(200);
            isSuccess(created.json);

            const deleted = await api.fetch('/environment/api-keys', {
                method: 'DELETE',
                token: accountKey.secret,
                body: { environment_id: env.id, key_id: created.json.data.id }
            });
            expect(deleted.res.status).toBe(200);
            isSuccess(deleted.json);
        });
    });
});
