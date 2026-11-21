import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { environmentService, seeders } from '@nangohq/shared';

import { authenticateUser, isError, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/api/v1/environments';

describe(`PATCH ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            // @ts-expect-error query params are required
            query: { env: 'test' },
            body: { name: 'new-name' }
        });

        shouldBeProtected(res);
    });

    it('rejects an empty body', async () => {
        const { env, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            // @ts-expect-error query params are required
            query: { env: env.name },
            body: {},
            session
        });

        expect(res.res.status).toBe(400);
        expect(res.json).toEqual({ error: { code: 'invalid_body', message: 'Nothing to update' } });
    });

    it('should successfully rename an environment', async () => {
        const { env, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);
        const newName = 'renamed-env';

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            // @ts-expect-error query params are required
            query: { env: env.name },
            body: { name: newName },
            session
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: expect.objectContaining({
                id: expect.any(Number),
                name: newName,
                account_id: expect.any(Number),
                created_at: expect.any(String),
                updated_at: expect.any(String)
            })
        });
    });

    it.each([
        {
            name: 'updates the OTLP endpoint and replaces headers',
            body: { otlp_endpoint: 'https://example.com/new', otlp_headers: [{ name: 'Authorization', value: 'new-token' }] },
            expected: { endpoint: 'https://example.com/new', headers: { Authorization: 'new-token' } }
        },
        {
            name: 'updates the OTLP endpoint and preserves omitted headers',
            body: { otlp_endpoint: 'https://example.com/new' },
            expected: { endpoint: 'https://example.com/new', headers: { Authorization: 'old-token', Other: 'keep' } }
        },
        {
            name: 'clears OTLP headers and preserves the omitted endpoint',
            body: { otlp_headers: [] },
            expected: { endpoint: 'https://example.com/old', headers: {} }
        }
    ])('$name', async ({ body, expected }) => {
        const { env, account, user } = await seeders.seedAccountEnvAndUser({ plan: { has_otel: true } });
        (
            await environmentService.updateEnvironment(db.knex, {
                accountId: account.id,
                environmentUuid: env.uuid,
                otlpSettings: { endpoint: 'https://example.com/old', headers: { Authorization: 'old-token', Other: 'keep' } }
            })
        ).unwrap();
        const session = await authenticateUser(api, user);
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            // @ts-expect-error query params are required
            query: { env: env.name },
            session,
            body
        });
        expect(res.res.status).toBe(200);
        expect((await environmentService.getByIdWithoutSecrets(env.id))?.otlp_settings).toEqual(expected);
    });

    it('updates HMAC settings through the shared service and preserves the environment response', async () => {
        const { env, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            // @ts-expect-error query params are required
            query: { env: env.name },
            session,
            body: { hmac_key: 'private-hmac-key', hmac_enabled: true }
        });
        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data).toMatchObject({ id: env.id, name: env.name, hmac_key: 'private-hmac-key', hmac_enabled: true });
        expect(await environmentService.getByIdWithoutSecrets(env.id)).toMatchObject({ hmac_key: 'private-hmac-key', hmac_enabled: true });
    });

    it('applies the shared production-name restriction', async () => {
        const { account, user } = await seeders.seedAccountEnvAndUser();
        await seeders.createEnvironmentSeed(account.id, 'prod');
        const session = await authenticateUser(api, user);
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            // @ts-expect-error query params are required
            query: { env: 'prod' },
            session,
            body: { name: 'renamed-prod' }
        });
        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json.error.code).toBe('cannot_change_prod_environment_name');
    });

    it('should not allow renaming to an existing environment name', async () => {
        const { env, account, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);
        await environmentService.createEnvironment(db.knex, { accountId: account.id, name: 'existing' });

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            // @ts-expect-error query params are required
            query: { env: env.name },
            body: { name: 'existing' },
            session
        });

        expect(res.res.status).toBe(409);
        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'conflict',
                message: 'An environment with this name already exists'
            }
        });
    });
});
