import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { customerKeyService, environmentService, PROD_ENVIRONMENT_NAME, seeders, updatePlan } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

import type { AccountApiKeyScope, DBCustomerKey } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;
let keyIndex = 0;

async function seedAccount() {
    const seed = await seeders.seedAccountEnvAndUser();
    await updatePlan(db.knex, { id: seed.plan.id, environments_max: 10 });
    return seed;
}

async function createAccountKey(accountId: number, scopes: AccountApiKeyScope[]): Promise<DBCustomerKey> {
    return (
        await customerKeyService.createAccountApiKey(db.knex, {
            accountId,
            displayName: `Environment management ${keyIndex++}`,
            scopes
        })
    ).unwrap();
}

describe('Public environment management', () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    describe('POST /environments', () => {
        it('should be protected', async () => {
            const res = await api.fetch('/environments', {
                method: 'POST',
                body: { name: 'unauthenticated' }
            });

            shouldBeProtected(res);
        });

        it('should reject an unknown API key', async () => {
            const res = await api.fetch('/environments', {
                method: 'POST',
                token: '00000000-0000-4000-8000-000000000000',
                body: { name: 'unknown-key' }
            });

            expect(res.res.status).toBe(401);
            isError(res.json);
        });

        it('should deny environment API keys', async () => {
            const { apiKey } = await seedAccount();

            const res = await api.fetch('/environments', {
                method: 'POST',
                token: apiKey.secret,
                body: { name: 'not-from-an-environment-key' }
            });

            expect(res.res.status).toBe(403);
            isError(res.json);
            expect(res.json.error).toEqual({
                code: 'forbidden',
                message: 'Insufficient scope. Required: account:environments:create'
            });
        });

        it('should deny Account API keys without the create scope', async () => {
            const { account } = await seedAccount();
            const accountKey = await createAccountKey(account.id, ['account:environments:set_production']);

            const res = await api.fetch('/environments', {
                method: 'POST',
                token: accountKey.secret,
                body: { name: 'not-with-production-scope' }
            });

            expect(res.res.status).toBe(403);
            isError(res.json);
            expect(res.json.error).toEqual({
                code: 'forbidden',
                message: 'Insufficient scope. Required: account:environments:create'
            });
        });

        it('should create a non-production environment with the create scope', async () => {
            const { account } = await seedAccount();
            const accountKey = await createAccountKey(account.id, ['account:environments:create']);

            const res = await api.fetch('/environments', {
                method: 'POST',
                token: accountKey.secret,
                body: { name: 'managed-dev' }
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json.data).toEqual({ id: expect.any(Number), uuid: expect.any(String), name: 'managed-dev' });
            expect(res.json.data.uuid).toBeUUID();

            const environment = await environmentService.getByIdWithoutSecrets(res.json.data.id, account.id);
            expect(environment).toMatchObject({ account_id: account.id, name: 'managed-dev', is_production: false });
        });

        it('should require set_production in addition to create for production environments', async () => {
            const { account } = await seedAccount();
            const createKey = await createAccountKey(account.id, ['account:environments:create']);

            const deniedFlag = await api.fetch('/environments', {
                method: 'POST',
                token: createKey.secret,
                body: { name: 'production-staging', is_production: true }
            });

            expect(deniedFlag.res.status).toBe(403);
            isError(deniedFlag.json);
            expect(deniedFlag.json.error).toEqual({
                code: 'forbidden',
                message: 'Insufficient scope. Required: account:environments:set_production'
            });

            const deniedReservedName = await api.fetch('/environments', {
                method: 'POST',
                token: createKey.secret,
                body: { name: PROD_ENVIRONMENT_NAME }
            });

            expect(deniedReservedName.res.status).toBe(403);
            isError(deniedReservedName.json);
            expect(deniedReservedName.json.error).toEqual({
                code: 'forbidden',
                message: 'Insufficient scope. Required: account:environments:set_production'
            });

            const productionKey = await createAccountKey(account.id, ['account:environments:create', 'account:environments:set_production']);
            const created = await api.fetch('/environments', {
                method: 'POST',
                token: productionKey.secret,
                body: { name: PROD_ENVIRONMENT_NAME }
            });

            expect(created.res.status).toBe(200);
            isSuccess(created.json);
            const environment = await environmentService.getByIdWithoutSecrets(created.json.data.id, account.id);
            expect(environment).toMatchObject({ name: PROD_ENVIRONMENT_NAME, is_production: true });
        });
    });

    describe('DELETE /environments/:environmentUuid', () => {
        it('should be protected', async () => {
            const res = await api.fetch('/environments/:environmentUuid', {
                method: 'DELETE',
                params: { environmentUuid: '123e4567-e89b-12d3-a456-426614174000' }
            });

            shouldBeProtected(res);
        });

        it('should keep create and delete scopes independent', async () => {
            const { account } = await seedAccount();
            const environment = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: 'scope-boundary' })).unwrap();
            const createKey = await createAccountKey(account.id, ['account:environments:create']);
            const deleteKey = await createAccountKey(account.id, ['account:environments:delete']);

            const deniedDelete = await api.fetch('/environments/:environmentUuid', {
                method: 'DELETE',
                token: createKey.secret,
                params: { environmentUuid: environment.uuid }
            });
            expect(deniedDelete.res.status).toBe(403);

            const deniedCreate = await api.fetch('/environments', {
                method: 'POST',
                token: deleteKey.secret,
                body: { name: 'not-with-delete-scope' }
            });
            expect(deniedCreate.res.status).toBe(403);

            const deleted = await api.fetch('/environments/:environmentUuid', {
                method: 'DELETE',
                token: deleteKey.secret,
                params: { environmentUuid: environment.uuid }
            });
            expect(deleted.res.status).toBe(204);
            expect(await environmentService.getById(environment.id)).toBeNull();
        });

        it('should not reveal or delete an environment from another account', async () => {
            const first = await seedAccount();
            const second = await seedAccount();
            const deleteKey = await createAccountKey(first.account.id, ['account:environments:delete']);

            const res = await api.fetch('/environments/:environmentUuid', {
                method: 'DELETE',
                token: deleteKey.secret,
                params: { environmentUuid: second.env.uuid }
            });

            expect(res.res.status).toBe(404);
            isError(res.json);
            expect(res.json.error).toEqual({ code: 'not_found', message: 'Environment not found' });
            expect(await environmentService.getById(second.env.id)).not.toBeNull();
        });

        it('should refuse to delete the protected production environment', async () => {
            const { account } = await seedAccount();
            const production = (
                await environmentService.createEnvironment(db.knex, {
                    accountId: account.id,
                    name: PROD_ENVIRONMENT_NAME
                })
            ).unwrap();
            const deleteKey = await createAccountKey(account.id, ['account:environments:delete']);

            const res = await api.fetch('/environments/:environmentUuid', {
                method: 'DELETE',
                token: deleteKey.secret,
                params: { environmentUuid: production.uuid }
            });

            expect(res.res.status).toBe(400);
            isError(res.json);
            expect(res.json.error).toEqual({
                code: 'cannot_delete_prod_environment',
                message: 'Cannot delete prod environment'
            });
        });

        it('should allow account:* to create and delete environments', async () => {
            const { account } = await seedAccount();
            const accountKey = await createAccountKey(account.id, ['account:*']);

            const created = await api.fetch('/environments', {
                method: 'POST',
                token: accountKey.secret,
                body: { name: 'full-account-access' }
            });
            expect(created.res.status).toBe(200);
            isSuccess(created.json);

            const deleted = await api.fetch('/environments/:environmentUuid', {
                method: 'DELETE',
                token: accountKey.secret,
                params: { environmentUuid: created.json.data.uuid }
            });
            expect(deleted.res.status).toBe(204);
        });
    });
});
