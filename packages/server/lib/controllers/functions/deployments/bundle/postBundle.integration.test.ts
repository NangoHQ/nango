import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { getLocking } from '@nangohq/kvstore';
import { configService, functionConfigService, remoteFileService, seeders } from '@nangohq/shared';
import { Err } from '@nangohq/utils';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../../../utils/tests.js';

import type { DBFunctionConfig, DBFunctionConfigVersion, FunctionDeploymentArtifact, PostFunctionDeploymentBundle } from '@nangohq/types';

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
} satisfies FunctionDeploymentArtifact;

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

    it('should preview a deployment without uploading files or writing to the database', async () => {
        const { apiKey, env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const uploadSpy = vi.spyOn(remoteFileService, 'upload');

        try {
            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: apiKey.secret,
                body: validBody
            });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(res.json).toStrictEqual({
                created: [{ integrationId: 'github', name: 'fetchIssues' }],
                updated: [],
                unchanged: [],
                deleted: []
            });
            expect(uploadSpy).not.toHaveBeenCalled();
            expect(await db.knex<DBFunctionConfig>('function_configs').where({ environment_id: env.id })).toHaveLength(0);
        } finally {
            uploadSpy.mockRestore();
        }
    });

    it('should reject functions whose integration does not exist', async () => {
        const { apiKey, env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const uploadSpy = vi.spyOn(remoteFileService, 'upload');
        const missingIntegrationFunction = {
            ...validFunction,
            name: 'fetchPullRequests',
            integrationId: 'missing-integration'
        } satisfies FunctionDeploymentArtifact;

        try {
            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: apiKey.secret,
                body: { mode: 'apply', functions: [validFunction, missingIntegrationFunction] }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json).toStrictEqual({
                error: {
                    code: 'integration_not_found',
                    message: 'Integration(s) not found: missing-integration'
                }
            });
            expect(uploadSpy).not.toHaveBeenCalled();
            expect(await db.knex<DBFunctionConfig>('function_configs').where({ environment_id: env.id })).toHaveLength(0);
        } finally {
            uploadSpy.mockRestore();
        }
    });

    it('should return a deployment error when fetching integrations fails', async () => {
        const { apiKey, env } = await seeders.seedAccountEnvAndUser();
        const listIntegrationsSpy = vi.spyOn(configService, 'listProviderConfigs').mockRejectedValue(new Error('Failed to query integrations'));
        const uploadSpy = vi.spyOn(remoteFileService, 'upload');

        try {
            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: apiKey.secret,
                body: { ...validBody, mode: 'apply' }
            });

            isError(res.json);
            expect(res.res.status).toBe(500);
            expect(res.json).toStrictEqual({
                error: {
                    code: 'functions_deployment_error',
                    message: 'Failed to deploy functions'
                }
            });
            expect(uploadSpy).not.toHaveBeenCalled();
            expect(await db.knex<DBFunctionConfig>('function_configs').where({ environment_id: env.id })).toHaveLength(0);
        } finally {
            uploadSpy.mockRestore();
            listIntegrationsSpy.mockRestore();
        }
    });

    it('should reject a concurrent apply deployment', async () => {
        const { apiKey, env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const locking = await getLocking();
        const acquireSpy = vi.spyOn(locking, 'acquire').mockRejectedValue(new Error('Failed to acquire lock'));

        try {
            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: apiKey.secret,
                body: { ...validBody, mode: 'apply' }
            });

            isError(res.json);
            expect(res.res.status).toBe(409);
            expect(res.json).toStrictEqual({
                error: {
                    code: 'concurrent_deployment',
                    message: 'A deployment is already in progress. Please wait for the current deployment to finish.'
                }
            });
        } finally {
            acquireSpy.mockRestore();
        }
    });

    it('should rollback all db writes when an upsert fails', async () => {
        const { apiKey, env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        await seeders.createConfigSeed(env, 'gitlab', 'gitlab');
        const uploadSpy = vi.spyOn(remoteFileService, 'upload').mockImplementation(({ destinationPath }) => Promise.resolve(destinationPath));
        const originalUpsert = functionConfigService.upsert;
        const upsertSpy = vi.spyOn(functionConfigService, 'upsert').mockImplementation(async (trx, params) => {
            if (params.integrationId === 'gitlab') {
                return Err(new Error('Failed to upsert function'));
            }
            return await originalUpsert(trx, params);
        });
        const secondFunction = {
            ...validFunction,
            name: 'fetchPullRequests',
            integrationId: 'gitlab'
        } satisfies FunctionDeploymentArtifact;

        try {
            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: apiKey.secret,
                body: { mode: 'apply', functions: [validFunction, secondFunction] }
            });

            isError(res.json);
            expect(res.res.status).toBe(500);
            expect(res.json).toStrictEqual({
                error: {
                    code: 'functions_deployment_error',
                    message: 'Failed to deploy functions'
                }
            });
            expect(uploadSpy).toHaveBeenCalledTimes(4);
            expect(await db.knex<DBFunctionConfig>('function_configs').where({ environment_id: env.id })).toHaveLength(0);
        } finally {
            upsertSpy.mockRestore();
            uploadSpy.mockRestore();
        }
    });

    it('should apply, skip an unchanged bundle, update changed source, and reconcile deletions', async () => {
        const { apiKey, env } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        if (!integration.id) {
            throw new Error('Expected integration seed to have an id');
        }

        const uploadSpy = vi.spyOn(remoteFileService, 'upload').mockImplementation(({ destinationPath }) => Promise.resolve(destinationPath));
        const deployRequest = async (body: PostFunctionDeploymentBundle['Body']) =>
            await api.fetch(endpoint, {
                method: 'POST',
                token: apiKey.secret,
                body
            });

        try {
            const created = await deployRequest({ mode: 'apply', functions: [validFunction] });
            isSuccess(created.json);
            expect(created.res.status).toBe(200);
            expect(created.json).toStrictEqual({
                created: [{ integrationId: 'github', name: 'fetchIssues' }],
                updated: [],
                unchanged: [],
                deleted: []
            });
            expect(uploadSpy).toHaveBeenCalledTimes(2);

            const initialConfig = await db
                .knex<DBFunctionConfig>('function_configs')
                .where({ nango_config_id: integration.id, name: validFunction.name })
                .first();
            if (!initialConfig) {
                throw new Error('Expected function config to be created');
            }
            const initialVersions = await db.knex<DBFunctionConfigVersion>('function_config_versions').where({ function_config_id: initialConfig.id });
            expect(initialVersions).toHaveLength(1);
            const initialVersion = initialVersions[0];
            if (!initialVersion) {
                throw new Error('Expected function version to be created');
            }
            expect(initialVersion.version).toBeSha256();

            uploadSpy.mockClear();
            const unchanged = await deployRequest({ mode: 'apply', functions: [validFunction] });
            isSuccess(unchanged.json);
            expect(unchanged.json).toStrictEqual({
                created: [],
                updated: [],
                unchanged: [{ integrationId: 'github', name: 'fetchIssues' }],
                deleted: []
            });
            expect(uploadSpy).not.toHaveBeenCalled();

            const unchangedConfig = await db.knex<DBFunctionConfig>('function_configs').where({ id: initialConfig.id }).first();
            if (!unchangedConfig) {
                throw new Error('Expected unchanged function config to exist');
            }
            const unchangedVersions = await db.knex<DBFunctionConfigVersion>('function_config_versions').where({ function_config_id: initialConfig.id });
            expect(unchangedConfig.updated_at).toEqual(initialConfig.updated_at);
            expect(unchangedVersions).toStrictEqual(initialVersions);

            const changedFunction = {
                ...validFunction,
                fileBody: {
                    ...validFunction.fileBody,
                    ts: 'export default async () => ({ changed: true })'
                }
            } satisfies FunctionDeploymentArtifact;

            uploadSpy.mockClear();
            const updated = await deployRequest({ mode: 'apply', functions: [changedFunction] });
            isSuccess(updated.json);
            expect(updated.json).toStrictEqual({
                created: [],
                updated: [{ integrationId: 'github', name: 'fetchIssues' }],
                unchanged: [],
                deleted: []
            });
            expect(uploadSpy).toHaveBeenCalledTimes(2);

            const updatedConfig = await db.knex<DBFunctionConfig>('function_configs').where({ id: initialConfig.id }).first();
            const updatedVersions = await db
                .knex<DBFunctionConfigVersion>('function_config_versions')
                .where({ function_config_id: initialConfig.id })
                .orderBy('id');
            expect(updatedVersions).toHaveLength(2);
            const updatedVersion = updatedVersions[1];
            if (!updatedConfig || !updatedVersion) {
                throw new Error('Expected function config and version to be updated');
            }
            expect(updatedVersion.version).toBeSha256();
            expect(updatedVersion.version).not.toBe(initialVersion.version);
            expect(updatedConfig.current_version_id).toBe(updatedVersion.id);

            uploadSpy.mockClear();
            const deleted = await deployRequest({ mode: 'apply', functions: [] });
            isSuccess(deleted.json);
            expect(deleted.json).toStrictEqual({
                created: [],
                updated: [],
                unchanged: [],
                deleted: [{ integrationId: 'github', name: 'fetchIssues' }]
            });
            expect(uploadSpy).not.toHaveBeenCalled();

            const deletedConfig = await db.knex<DBFunctionConfig>('function_configs').where({ id: initialConfig.id }).first();
            expect(deletedConfig?.deleted_at).toBeInstanceOf(Date);
        } finally {
            uploadSpy.mockRestore();
        }
    });
});
