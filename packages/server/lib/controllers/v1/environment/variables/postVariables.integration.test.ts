import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { environmentService, seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/api/v1/environments/variables';

describe(`POST ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'dev' },
            body: { variables: [] }
        });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            // @ts-expect-error - intentionally missing env query param
            query: {},
            body: { variables: [] }
        });

        shouldRequireQueryEnv(res);
    });

    it('should validate body', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            query: { env: env.name },
            // @ts-expect-error - intentionally invalid body
            body: { invalid: 'body' }
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json.error.code).toBe('invalid_body');
    });

    it('should store and retrieve environment variables', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const variables = [
            { name: 'TEST_VAR', value: 'test_value' },
            { name: 'ANOTHER_VAR', value: 'another_value' }
        ];

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            query: { env: env.name },
            body: { variables }
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json).toStrictEqual({ success: true });

        const retrieved = await environmentService.getEnvironmentVariables(env.id);
        expect(retrieved).toHaveLength(2);
        expect(retrieved.map((v) => ({ name: v.name, value: v.value }))).toEqual(expect.arrayContaining(variables));
    });

    it('should store environment variable with value up to 4000 characters', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const largeValue = 'x'.repeat(4000);
        const variables = [{ name: 'LARGE_VALUE_VAR', value: largeValue }];

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            query: { env: env.name },
            body: { variables }
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        const retrieved = await environmentService.getEnvironmentVariables(env.id);
        expect(retrieved).toHaveLength(1);
        expect(retrieved[0]!.value).toBe(largeValue);
        expect(retrieved[0]!.value).toHaveLength(4000);
    });

    it('should store environment variable with name up to 256 characters', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const largeName = 'X'.repeat(256);
        const variables = [{ name: largeName, value: 'test_value' }];

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            query: { env: env.name },
            body: { variables }
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        const retrieved = await environmentService.getEnvironmentVariables(env.id);
        expect(retrieved).toHaveLength(1);
        expect(retrieved[0]!.name).toBe(largeName);
        expect(retrieved[0]!.name).toHaveLength(256);
    });

    it('should reject environment variable name exceeding 256 characters', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const tooLongName = 'X'.repeat(257);
        const variables = [{ name: tooLongName, value: 'test_value' }];

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            query: { env: env.name },
            body: { variables }
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json.error.code).toBe('invalid_body');
    });

    it('should reject environment variable value exceeding 4000 characters', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const tooLongValue = 'x'.repeat(4001);
        const variables = [{ name: 'TEST_VAR', value: tooLongValue }];

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            query: { env: env.name },
            body: { variables }
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json.error.code).toBe('invalid_body');
    });

    it('should reject more than 100 environment variables', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const variables = Array.from({ length: 101 }, (_, i) => ({
            name: `VAR_${i}`,
            value: `value_${i}`
        }));

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            query: { env: env.name },
            body: { variables }
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json.error.code).toBe('invalid_body');
    });
});
