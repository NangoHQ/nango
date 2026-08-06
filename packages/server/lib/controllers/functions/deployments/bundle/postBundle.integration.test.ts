import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { isError, runServer, shouldBeProtected } from '../../../../utils/tests.js';

import type { PostFunctionDeploymentBundle } from '@nangohq/types';

const endpoint = '/functions/deployments/bundle';
let api: Awaited<ReturnType<typeof runServer>>;

const validFunction = {
    name: 'fetchIssues',
    integrationId: 'github',
    description: 'Fetch a GitHub issue on demand',
    trigger: { kind: 'none' },
    requires: { connection: true, outbound: true, invoke: false },
    capabilities: {
        usesRecords: false,
        usesOutbound: true,
        usesCheckpoints: false,
        usesMetadata: false,
        usesInvoke: false
    },
    limits: { concurrency: { perConnection: 'max' } },
    input_schema_ref: '#/definitions/FunctionInput_github_fetchIssues',
    output_schema_ref: '#/definitions/FunctionOutput_github_fetchIssues',
    model_schema_refs: [],
    metadata_schema_ref: null,
    checkpoint_schema_ref: null,
    json_schema: {
        definitions: {
            FunctionInput_github_fetchIssues: { type: 'object' },
            FunctionOutput_github_fetchIssues: { type: 'object' }
        }
    },
    fileBody: {
        js: 'module.exports = async () => ({})',
        ts: 'export default async () => ({})'
    }
} satisfies PostFunctionDeploymentBundle['Body']['functions'][number];

const validBody = {
    mode: 'preview',
    functions: [validFunction]
} satisfies PostFunctionDeploymentBundle['Body'];

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
            body: validBody
        });

        shouldBeProtected(res);
    });

    it('should reject inconsistent function configurations', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                ...validBody,
                functions: [
                    {
                        ...validFunction,
                        capabilities: { ...validFunction.capabilities, usesOutbound: false }
                    }
                ]
            }
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json.error.code).toBe('invalid_body');
        expect(res.json.error.errors).toContainEqual(
            expect.objectContaining({
                path: ['functions', '0', 'capabilities', 'usesOutbound']
            })
        );
    });

    it('should validate a function deployment before reporting that deployment is not implemented', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: validBody
        });

        isError(res.json);
        expect(res.res.status).toBe(501);
        expect(res.json).toStrictEqual({
            error: {
                code: 'not_implemented',
                message: 'Function deployment is not implemented yet'
            }
        });
    });
});
