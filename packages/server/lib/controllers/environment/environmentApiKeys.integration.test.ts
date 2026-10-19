import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { customerKeyService, seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

import type { AccountApiKeyScope, ApiKeyScope, DBCustomerKey } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;
let keyIndex = 0;

async function seedAccount() {
    return await seeders.seedAccountEnvAndUser();
}

async function createEnvironmentKey(accountId: number, environmentId: number, displayName: string, scopes?: ApiKeyScope[]): Promise<DBCustomerKey> {
    return (await customerKeyService.createApiKey(db.knex, { accountId, environmentId, displayName, ...(scopes ? { scopes } : {}) })).unwrap();
}

async function findEnvironmentKey(accountId: number, environmentId: number, keyUuid: string) {
    const found = (await customerKeyService.search(db.knex, { type: 'environment', environmentId, accountId, keyUuid }, { withSecrets: true })).unwrap();
    return found[0];
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

    describe('GET /environments/:environmentUuid/api-keys', () => {
        it('should be protected', async () => {
            const res = await api.fetch('/environments/:environmentUuid/api-keys', {
                method: 'GET',
                params: { environmentUuid: '123e4567-e89b-12d3-a456-426614174000' },
                query: {}
            });

            shouldBeProtected(res);
        });

        it('should deny environment API keys', async () => {
            const { env, apiKey } = await seedAccount();

            const res = await api.fetch('/environments/:environmentUuid/api-keys', {
                method: 'GET',
                token: apiKey.secret,
                params: { environmentUuid: env.uuid },
                query: {}
            });

            expect(res.res.status).toBe(403);
            isError(res.json);
            expect(res.json.error).toEqual({
                code: 'forbidden',
                message: 'Insufficient scope. Required: account:environments:api_keys:list'
            });
        });

        it('should deny Account API keys without the list scope', async () => {
            const { account, env } = await seedAccount();
            const accountKey = await createAccountKey(account.id, ['account:environments:api_keys:create']);

            const res = await api.fetch('/environments/:environmentUuid/api-keys', {
                method: 'GET',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid },
                query: {}
            });

            expect(res.res.status).toBe(403);
            isError(res.json);
            expect(res.json.error).toEqual({
                code: 'forbidden',
                message: 'Insufficient scope. Required: account:environments:api_keys:list'
            });
        });

        it('should list keys without their secrets and filter by exact display name', async () => {
            const { account, env } = await seedAccount();
            const apiKey = (
                await customerKeyService.createApiKey(db.knex, {
                    accountId: account.id,
                    environmentId: env.id,
                    displayName: 'readable-key'
                })
            ).unwrap();
            const accountKey = await createAccountKey(account.id, ['account:environments:api_keys:list']);

            const res = await api.fetch('/environments/:environmentUuid/api-keys', {
                method: 'GET',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid },
                query: { display_name: apiKey.display_name }
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json).toStrictEqual({
                data: [
                    {
                        id: apiKey.id,
                        uuid: apiKey.uuid,
                        display_name: apiKey.display_name,
                        scopes: ['environment:*'],
                        last_used_at: null,
                        created_at: apiKey.created_at.toISOString()
                    }
                ]
            });
        });

        it('should return an empty list for no match and reject invalid parameters', async () => {
            const { account, env } = await seedAccount();
            const accountKey = await createAccountKey(account.id, ['account:environments:api_keys:list']);

            const noMatch = await api.fetch('/environments/:environmentUuid/api-keys', {
                method: 'GET',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid },
                query: { display_name: 'does-not-exist' }
            });
            expect(noMatch.res.status).toBe(200);
            isSuccess(noMatch.json);
            expect(noMatch.json).toStrictEqual({ data: [] });

            const invalid = await api.fetch('/environments/:environmentUuid/api-keys', {
                method: 'GET',
                token: accountKey.secret,
                params: { environmentUuid: 'not-a-uuid' },
                query: {}
            });
            expect(invalid.res.status).toBe(400);

            const unknownQuery = await api.fetch('/environments/:environmentUuid/api-keys', {
                method: 'GET',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid },
                // @ts-expect-error on purpose
                query: { unknown: 'value' }
            });
            expect(unknownQuery.res.status).toBe(400);
        });

        it('should support account:* and isolate keys by account', async () => {
            const first = await seedAccount();
            const second = await seedAccount();
            const accountKey = await createAccountKey(first.account.id, ['account:*']);

            const own = await api.fetch('/environments/:environmentUuid/api-keys', {
                method: 'GET',
                token: accountKey.secret,
                params: { environmentUuid: first.env.uuid },
                query: {}
            });

            expect(own.res.status).toBe(200);
            isSuccess(own.json);
            expect(own.json.data).toContainEqual(expect.objectContaining({ uuid: first.apiKey.uuid }));

            const otherAccount = await api.fetch('/environments/:environmentUuid/api-keys', {
                method: 'GET',
                token: accountKey.secret,
                params: { environmentUuid: second.env.uuid },
                query: {}
            });

            expect(otherAccount.res.status).toBe(404);
            isError(otherAccount.json);
            expect(otherAccount.json.error).toEqual({ code: 'not_found', message: 'Environment not found' });
        });
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

        it('should create an environment API key with the requested scopes', async () => {
            const { account, env } = await seedAccount();
            const accountKey = await createAccountKey(account.id, ['account:environments:api_keys:create']);

            const res = await api.fetch('/environments/:environmentUuid/api-keys', {
                method: 'POST',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid },
                body: { display_name: 'scoped-ci', scopes: ['environment:deploy'] }
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json.data.scopes).toEqual(['environment:deploy']);
        });

        it.each([
            { name: 'empty scopes', scopes: [] },
            { name: 'an unknown scope', scopes: ['environment:not_a_scope'] },
            { name: 'an account scope with wildcard', scopes: ['account:*'] },
            { name: 'an account scope', scopes: ['account:environments:create'] },
            { name: 'a non-string scope', scopes: [42] }
        ])('should reject $name', async ({ scopes }) => {
            const { account, env } = await seedAccount();
            const accountKey = await createAccountKey(account.id, ['account:environments:api_keys:create']);

            const res = await api.fetch('/environments/:environmentUuid/api-keys', {
                method: 'POST',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid },
                // @ts-expect-error testing invalid scopes
                body: { display_name: 'invalid-scopes', scopes }
            });

            expect(res.res.status).toBe(400);
            isError(res.json);
            expect(res.json.error.code).toBe('invalid_body');
        });
    });

    describe('GET /environments/:environmentUuid/api-keys/:keyUuid', () => {
        it('should be protected', async () => {
            const res = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'GET',
                params: {
                    environmentUuid: '123e4567-e89b-12d3-a456-426614174000',
                    keyUuid: '123e4567-e89b-12d3-a456-426614174001'
                }
            });

            shouldBeProtected(res);
        });

        it('should deny environment API keys', async () => {
            const { env, apiKey } = await seedAccount();

            const res = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'GET',
                token: apiKey.secret,
                params: { environmentUuid: env.uuid, keyUuid: apiKey.uuid }
            });

            expect(res.res.status).toBe(403);
            isError(res.json);
            expect(res.json.error).toEqual({
                code: 'forbidden',
                message: 'Insufficient scope. Required: account:environments:api_keys:read'
            });
        });

        it('should reject an invalid key UUID', async () => {
            const { account, env } = await seedAccount();
            const accountKey = await createAccountKey(account.id, ['account:environments:api_keys:read']);

            const res = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'GET',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid, keyUuid: 'not-a-uuid' }
            });

            expect(res.res.status).toBe(400);
            isError(res.json);
            expect(res.json.error.code).toBe('invalid_uri_params');
        });

        it('should reject an invalid environment UUID', async () => {
            const { account, apiKey } = await seedAccount();
            const accountKey = await createAccountKey(account.id, ['account:environments:api_keys:read']);

            const res = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'GET',
                token: accountKey.secret,
                params: { environmentUuid: 'not-a-uuid', keyUuid: apiKey.uuid }
            });

            expect(res.res.status).toBe(400);
            isError(res.json);
            expect(res.json.error.code).toBe('invalid_uri_params');
        });

        it('should return not found for an unknown key in the environment', async () => {
            const { account, env } = await seedAccount();
            const accountKey = await createAccountKey(account.id, ['account:environments:api_keys:read']);

            const res = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'GET',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid, keyUuid: '123e4567-e89b-12d3-a456-426614174001' }
            });

            expect(res.res.status).toBe(404);
            isError(res.json);
            expect(res.json.error).toEqual({ code: 'not_found', message: 'API key not found' });
        });

        it('should require the read scope', async () => {
            const { account, env } = await seedAccount();
            const apiKey = (
                await customerKeyService.createApiKey(db.knex, {
                    accountId: account.id,
                    environmentId: env.id,
                    displayName: 'read-scope-key'
                })
            ).unwrap();
            const listKey = await createAccountKey(account.id, ['account:environments:api_keys:list']);

            const res = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'GET',
                token: listKey.secret,
                params: { environmentUuid: env.uuid, keyUuid: apiKey.uuid }
            });

            expect(res.res.status).toBe(403);
            isError(res.json);
            expect(res.json.error).toEqual({
                code: 'forbidden',
                message: 'Insufficient scope. Required: account:environments:api_keys:read'
            });
        });

        it('should return a key and its secret with the read scope', async () => {
            const { account, env } = await seedAccount();
            const apiKey = (
                await customerKeyService.createApiKey(db.knex, {
                    accountId: account.id,
                    environmentId: env.id,
                    displayName: 'readable-secret-key'
                })
            ).unwrap();
            const accountKey = await createAccountKey(account.id, ['account:environments:api_keys:read']);

            const res = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'GET',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid, keyUuid: apiKey.uuid }
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json).toStrictEqual({
                data: {
                    id: apiKey.id,
                    uuid: apiKey.uuid,
                    display_name: apiKey.display_name,
                    scopes: ['environment:*'],
                    secret: apiKey.secret,
                    last_used_at: null,
                    created_at: apiKey.created_at.toISOString()
                }
            });
        });

        it('should not reveal a key from another account', async () => {
            const first = await seedAccount();
            const second = await seedAccount();
            const accountKey = await createAccountKey(first.account.id, ['account:environments:api_keys:read']);

            const res = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'GET',
                token: accountKey.secret,
                params: { environmentUuid: second.env.uuid, keyUuid: second.apiKey.uuid }
            });

            expect(res.res.status).toBe(404);
            isError(res.json);
            expect(res.json.error).toEqual({ code: 'not_found', message: 'Environment not found' });
        });

        it('should allow account:*', async () => {
            const { account, env, apiKey } = await seedAccount();
            const accountKey = await createAccountKey(account.id, ['account:*']);

            const res = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'GET',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid, keyUuid: apiKey.uuid }
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json.data.secret).toBe(apiKey.secret);
        });
    });

    describe('PATCH /environments/:environmentUuid/api-keys/:keyUuid', () => {
        it('should be protected', async () => {
            const res = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'PATCH',
                params: {
                    environmentUuid: '123e4567-e89b-12d3-a456-426614174000',
                    keyUuid: '123e4567-e89b-12d3-a456-426614174001'
                },
                body: { display_name: 'renamed' }
            });

            shouldBeProtected(res);
        });

        it('should deny environment API keys', async () => {
            const { env, apiKey } = await seedAccount();

            const res = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'PATCH',
                token: apiKey.secret,
                params: { environmentUuid: env.uuid, keyUuid: apiKey.uuid },
                body: { scopes: ['environment:deploy'] }
            });

            expect(res.res.status).toBe(403);
            isError(res.json);
            expect(res.json.error).toEqual({
                code: 'forbidden',
                message: 'Insufficient scope. Required: account:environments:api_keys:update'
            });
        });

        it('should deny Account API keys without the update scope', async () => {
            const { account, env } = await seedAccount();
            const key = await createEnvironmentKey(account.id, env.id, 'not-updatable');
            const accountKey = await createAccountKey(account.id, ['account:environments:api_keys:create', 'account:environments:api_keys:read']);

            const res = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'PATCH',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid, keyUuid: key.uuid },
                body: { display_name: 'renamed' }
            });

            expect(res.res.status).toBe(403);
            isError(res.json);
            expect(res.json.error).toEqual({
                code: 'forbidden',
                message: 'Insufficient scope. Required: account:environments:api_keys:update'
            });
            expect((await findEnvironmentKey(account.id, env.id, key.uuid))?.display_name).toBe('not-updatable');
        });

        it('should update the display name and keep scopes and secret', async () => {
            const { account, env } = await seedAccount();
            const key = await createEnvironmentKey(account.id, env.id, 'before-rename', ['environment:deploy']);
            const accountKey = await createAccountKey(account.id, ['account:environments:api_keys:update']);

            const res = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'PATCH',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid, keyUuid: key.uuid },
                body: { display_name: 'after-rename' }
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json).toStrictEqual({
                data: {
                    id: key.id,
                    uuid: key.uuid,
                    display_name: 'after-rename',
                    scopes: ['environment:deploy'],
                    last_used_at: null,
                    created_at: key.created_at.toISOString()
                }
            });

            const stored = await findEnvironmentKey(account.id, env.id, key.uuid);
            expect(stored).toMatchObject({ display_name: 'after-rename', scopes: ['environment:deploy'], secret: key.secret });
        });

        it('should replace scopes and keep the display name', async () => {
            const { account, env } = await seedAccount();
            const key = await createEnvironmentKey(account.id, env.id, 'rescoped');
            const accountKey = await createAccountKey(account.id, ['account:environments:api_keys:update']);

            const res = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'PATCH',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid, keyUuid: key.uuid },
                body: { scopes: ['environment:deploy'] }
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json.data).toMatchObject({ display_name: 'rescoped', scopes: ['environment:deploy'] });
            expect(await findEnvironmentKey(account.id, env.id, key.uuid)).toMatchObject({ display_name: 'rescoped', scopes: ['environment:deploy'] });
        });

        it('should update display name and scopes together', async () => {
            const { account, env } = await seedAccount();
            const key = await createEnvironmentKey(account.id, env.id, 'both-before');
            const accountKey = await createAccountKey(account.id, ['account:environments:api_keys:update']);

            const res = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'PATCH',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid, keyUuid: key.uuid },
                body: { display_name: 'both-after', scopes: ['environment:deploy'] }
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json.data).toMatchObject({ display_name: 'both-after', scopes: ['environment:deploy'] });
            expect(await findEnvironmentKey(account.id, env.id, key.uuid)).toMatchObject({ display_name: 'both-after', scopes: ['environment:deploy'] });
        });

        it('should reject a duplicate display name without changing scopes', async () => {
            const { account, env } = await seedAccount();
            await createEnvironmentKey(account.id, env.id, 'taken-name');
            const key = await createEnvironmentKey(account.id, env.id, 'conflicting');
            const accountKey = await createAccountKey(account.id, ['account:environments:api_keys:update']);

            const res = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'PATCH',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid, keyUuid: key.uuid },
                body: { display_name: 'taken-name', scopes: ['environment:deploy'] }
            });

            expect(res.res.status).toBe(409);
            isError(res.json);
            expect(res.json.error).toEqual({ code: 'conflict', message: 'A key with this name already exists' });
            expect(await findEnvironmentKey(account.id, env.id, key.uuid)).toMatchObject({ display_name: 'conflicting', scopes: ['environment:*'] });
        });

        it.each([
            { name: 'an empty body', body: {} },
            { name: 'an empty display name', body: { display_name: '' } },
            { name: 'empty scopes', body: { scopes: [] } },
            { name: 'an unknown scope', body: { scopes: ['environment:not_a_scope'] } },
            { name: 'an account scope', body: { scopes: ['account:*'] } },
            { name: 'an unknown field', body: { display_name: 'renamed', secret: 'abc' } }
        ])('should reject $name', async ({ body }) => {
            const { account, env } = await seedAccount();
            const key = await createEnvironmentKey(account.id, env.id, 'invalid-update');
            const accountKey = await createAccountKey(account.id, ['account:environments:api_keys:update']);

            const res = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'PATCH',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid, keyUuid: key.uuid },
                // @ts-expect-error testing invalid bodies
                body
            });

            expect(res.res.status).toBe(400);
            isError(res.json);
            expect(res.json.error.code).toBe('invalid_body');
            expect(await findEnvironmentKey(account.id, env.id, key.uuid)).toMatchObject({ display_name: 'invalid-update', scopes: ['environment:*'] });
        });

        it('should return not found for an unknown key in the environment', async () => {
            const { account, env } = await seedAccount();
            const accountKey = await createAccountKey(account.id, ['account:environments:api_keys:update']);

            const res = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'PATCH',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid, keyUuid: '123e4567-e89b-12d3-a456-426614174099' },
                body: { display_name: 'renamed' }
            });

            expect(res.res.status).toBe(404);
            isError(res.json);
            expect(res.json.error).toEqual({ code: 'not_found', message: 'API key not found' });
        });

        it('should not update a key from another account', async () => {
            const first = await seedAccount();
            const second = await seedAccount();
            const accountKey = await createAccountKey(first.account.id, ['account:environments:api_keys:update']);

            const res = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'PATCH',
                token: accountKey.secret,
                params: { environmentUuid: second.env.uuid, keyUuid: second.apiKey.uuid },
                body: { scopes: ['environment:deploy'] }
            });

            expect(res.res.status).toBe(404);
            isError(res.json);
            expect(res.json.error).toEqual({ code: 'not_found', message: 'Environment not found' });
            expect((await findEnvironmentKey(second.account.id, second.env.id, second.apiKey.uuid))?.scopes).toEqual(['environment:*']);
        });

        it('should not update a key through another environment of the same account', async () => {
            const { account, env, apiKey } = await seedAccount();
            const otherEnv = await seeders.createEnvironmentSeed(account.id, 'other-env');
            const accountKey = await createAccountKey(account.id, ['account:environments:api_keys:update']);

            const res = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'PATCH',
                token: accountKey.secret,
                params: { environmentUuid: otherEnv.uuid, keyUuid: apiKey.uuid },
                body: { scopes: ['environment:deploy'] }
            });

            expect(res.res.status).toBe(404);
            isError(res.json);
            expect(res.json.error).toEqual({ code: 'not_found', message: 'API key not found' });
            expect((await findEnvironmentKey(account.id, env.id, apiKey.uuid))?.scopes).toEqual(['environment:*']);
        });

        it('should allow account:*', async () => {
            const { account, env } = await seedAccount();
            const key = await createEnvironmentKey(account.id, env.id, 'wildcard-update');
            const accountKey = await createAccountKey(account.id, ['account:*']);

            const res = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'PATCH',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid, keyUuid: key.uuid },
                body: { display_name: 'wildcard-updated' }
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
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

            const remaining = (
                await customerKeyService.search(db.knex, { type: 'environment', environmentId: second.env.id, accountId: second.account.id })
            ).unwrap();
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
