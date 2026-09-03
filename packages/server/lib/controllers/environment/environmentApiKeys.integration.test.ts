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

    describe('POST /environments/:environmentUuid/api-keys', () => {
        it('should be protected', async () => {
            const res = await api.fetch('/environments/:environmentUuid/api-keys', {
                method: 'POST',
                params: { environmentUuid: '123e4567-e89b-12d3-a456-426614174000' },
                body: { display_name: 'unauthenticated' }
            });

            shouldBeProtected(res);
        });

        it('should deny environment API keys', async () => {
            const { env, apiKey } = await seedAccount();

            const res = await api.fetch('/environments/:environmentUuid/api-keys', {
                method: 'POST',
                token: apiKey.secret,
                params: { environmentUuid: env.uuid },
                body: { display_name: 'not-from-an-environment-key' }
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

            const res = await api.fetch('/environments/:environmentUuid/api-keys', {
                method: 'POST',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid },
                body: { display_name: 'not-with-delete-scope' }
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

            const res = await api.fetch('/environments/:environmentUuid/api-keys', {
                method: 'POST',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid },
                body: { display_name: 'provisioned-ci' }
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json.data).toEqual({
                id: expect.any(Number),
                uuid: expect.any(String),
                display_name: 'provisioned-ci',
                scopes: ['environment:*'],
                secret: expect.any(String),
                created_at: expect.any(String)
            });
            expect(res.json.data.uuid).toBeUUID();
        });

        it('should not create a key for an environment from another account', async () => {
            const first = await seedAccount();
            const second = await seedAccount();
            const accountKey = await createAccountKey(first.account.id, ['account:environments:api_keys:create']);

            const res = await api.fetch('/environments/:environmentUuid/api-keys', {
                method: 'POST',
                token: accountKey.secret,
                params: { environmentUuid: second.env.uuid },
                body: { display_name: 'cross-account' }
            });

            expect(res.res.status).toBe(404);
            isError(res.json);
            expect(res.json.error).toEqual({ code: 'not_found', message: 'Environment not found' });
        });
    });

    describe('DELETE /environments/:environmentUuid/api-keys/:keyUuid', () => {
        it('should be protected', async () => {
            const res = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'DELETE',
                params: { environmentUuid: '123e4567-e89b-12d3-a456-426614174000', keyUuid: '123e4567-e89b-12d3-a456-426614174001' }
            });

            shouldBeProtected(res);
        });

        it('should keep create and delete scopes independent', async () => {
            const { account, env } = await seedAccount();
            const createKey = await createAccountKey(account.id, ['account:environments:api_keys:create']);
            const deleteKey = await createAccountKey(account.id, ['account:environments:api_keys:delete']);

            const created = await api.fetch('/environments/:environmentUuid/api-keys', {
                method: 'POST',
                token: createKey.secret,
                params: { environmentUuid: env.uuid },
                body: { display_name: 'scope-boundary' }
            });
            expect(created.res.status).toBe(200);
            isSuccess(created.json);

            const deniedDelete = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'DELETE',
                token: createKey.secret,
                params: { environmentUuid: env.uuid, keyUuid: created.json.data.uuid }
            });
            expect(deniedDelete.res.status).toBe(403);

            const deniedCreate = await api.fetch('/environments/:environmentUuid/api-keys', {
                method: 'POST',
                token: deleteKey.secret,
                params: { environmentUuid: env.uuid },
                body: { display_name: 'not-with-delete-scope' }
            });
            expect(deniedCreate.res.status).toBe(403);

            const deleted = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'DELETE',
                token: deleteKey.secret,
                params: { environmentUuid: env.uuid, keyUuid: created.json.data.uuid }
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

            const res = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'DELETE',
                token: deleteKey.secret,
                params: { environmentUuid: second.env.uuid, keyUuid: created.uuid }
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

            const created = await api.fetch('/environments/:environmentUuid/api-keys', {
                method: 'POST',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid },
                body: { display_name: 'full-account-access' }
            });
            expect(created.res.status).toBe(200);
            isSuccess(created.json);

            const deleted = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'DELETE',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid, keyUuid: created.json.data.uuid }
            });
            expect(deleted.res.status).toBe(200);
            isSuccess(deleted.json);
        });
    });
});
