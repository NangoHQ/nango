import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { createAccount } from '../../seeders/account.seeder.js';
import { createConfigSeed } from '../../seeders/config.seeder.js';
import { createEnvironmentSeed } from '../../seeders/environment.seeder.js';
import { prepareDeploymentBundle } from './deploy.js';
import { upsert } from './models/functions.js';
import { functionVersionHash } from './version.js';

import type { DBFunctionConfigVersion, FunctionDeploymentArtifact } from '@nangohq/types';

const githubArtifact = {
    name: 'fetchIssues',
    integrationId: 'github',
    description: 'Fetch issues',
    trigger: { kind: 'none' },
    requires: { connection: true, outbound: true, invoke: false },
    capabilities: { usesOutbound: true, usesRecords: false, usesMetadata: false, usesCheckpoints: false, usesInvoke: false },
    limits: { concurrency: { perConnection: 'max' } },
    input_schema_ref: null,
    output_schema_ref: null,
    model_schema_refs: [],
    metadata_schema_ref: null,
    checkpoint_schema_ref: null,
    json_schema: { type: 'object' },
    fileBody: { js: 'export default async function run() {}', ts: 'export default async function run(): Promise<void> {}' }
} satisfies FunctionDeploymentArtifact;

const gitlabArtifact = {
    ...githubArtifact,
    name: 'fetchMergeRequests',
    integrationId: 'gitlab'
} satisfies FunctionDeploymentArtifact;

function functionVersion(
    artifact: FunctionDeploymentArtifact
): Omit<DBFunctionConfigVersion, 'id' | 'function_config_id' | 'created_at' | 'updated_at' | 'deleted_at'> {
    return {
        description: artifact.description,
        file_location: `functions/${artifact.integrationId}/${artifact.name}`,
        version: functionVersionHash(artifact).unwrap(),
        source: 'repo',
        trigger: artifact.trigger,
        requires: artifact.requires,
        capabilities: artifact.capabilities,
        limits: artifact.limits,
        input_schema_ref: artifact.input_schema_ref,
        output_schema_ref: artifact.output_schema_ref,
        model_schema_refs: artifact.model_schema_refs,
        metadata_schema_ref: artifact.metadata_schema_ref,
        checkpoint_schema_ref: artifact.checkpoint_schema_ref,
        json_schema: artifact.json_schema
    };
}

async function seedEnvironmentWithFunctions(): Promise<number> {
    const account = await createAccount();
    const environment = await createEnvironmentSeed(account.id);
    await createConfigSeed(environment, githubArtifact.integrationId, 'github');
    await createConfigSeed(environment, gitlabArtifact.integrationId, 'gitlab');

    for (const artifact of [githubArtifact, gitlabArtifact]) {
        await upsert(db.knex, {
            environmentId: environment.id,
            integrationId: artifact.integrationId,
            name: artifact.name,
            version: functionVersion(artifact)
        });
    }

    return environment.id;
}

describe(prepareDeploymentBundle, () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('deletes every deployed function for an empty environment-scoped deployment', async () => {
        const environmentId = await seedEnvironmentWithFunctions();

        const reconciliation = (await prepareDeploymentBundle({ functions: [], environmentId, reconciliationScope: { kind: 'environment' } })).unwrap();

        expect(reconciliation.created).toStrictEqual([]);
        expect(reconciliation.updated).toStrictEqual([]);
        expect(reconciliation.unchanged).toStrictEqual([]);
        expect(reconciliation.deleted.map(({ integration, config }) => ({ integrationId: integration.unique_key, name: config.name }))).toEqual(
            expect.arrayContaining([
                { integrationId: githubArtifact.integrationId, name: githubArtifact.name },
                { integrationId: gitlabArtifact.integrationId, name: gitlabArtifact.name }
            ])
        );
        expect(reconciliation.deleted).toHaveLength(2);
    });

    it('deletes every deployed function for an empty integration-scoped deployment', async () => {
        const environmentId = await seedEnvironmentWithFunctions();

        const reconciliation = (
            await prepareDeploymentBundle({
                functions: [],
                environmentId,
                reconciliationScope: { kind: 'integration', integrationId: githubArtifact.integrationId }
            })
        ).unwrap();

        expect(reconciliation.created).toStrictEqual([]);
        expect(reconciliation.updated).toStrictEqual([]);
        expect(reconciliation.unchanged).toStrictEqual([]);
        expect(reconciliation.deleted.map(({ integration, config }) => ({ integrationId: integration.unique_key, name: config.name }))).toStrictEqual([
            { integrationId: githubArtifact.integrationId, name: githubArtifact.name }
        ]);
    });

    it('reconciles only the requested integration for an integration-scoped deployment', async () => {
        const environmentId = await seedEnvironmentWithFunctions();

        const reconciliation = (
            await prepareDeploymentBundle({
                functions: [githubArtifact],
                environmentId,
                reconciliationScope: { kind: 'integration', integrationId: githubArtifact.integrationId }
            })
        ).unwrap();

        expect(reconciliation).toStrictEqual({ created: [], updated: [], unchanged: [githubArtifact], deleted: [] });
    });

    it('rejects functions outside the requested integration scope', async () => {
        const environmentId = await seedEnvironmentWithFunctions();

        const result = await prepareDeploymentBundle({
            functions: [gitlabArtifact],
            environmentId,
            reconciliationScope: { kind: 'integration', integrationId: githubArtifact.integrationId }
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.code).toBe('functions_deployment_error');
            expect(result.error.cause).toEqual(
                expect.objectContaining({
                    message: 'function_integration_scope_mismatch',
                    cause: {
                        integrationId: githubArtifact.integrationId,
                        mismatchedIntegrationIds: [gitlabArtifact.integrationId]
                    }
                })
            );
        }
    });

    it('reconciles every integration for an environment-scoped deployment', async () => {
        const environmentId = await seedEnvironmentWithFunctions();

        const reconciliation = (
            await prepareDeploymentBundle({ functions: [githubArtifact], environmentId, reconciliationScope: { kind: 'environment' } })
        ).unwrap();

        expect(reconciliation.created).toStrictEqual([]);
        expect(reconciliation.updated).toStrictEqual([]);
        expect(reconciliation.unchanged).toStrictEqual([githubArtifact]);
        expect(reconciliation.deleted.map(({ integration, config }) => ({ integrationId: integration.unique_key, name: config.name }))).toStrictEqual([
            { integrationId: gitlabArtifact.integrationId, name: gitlabArtifact.name }
        ]);
    });
});
