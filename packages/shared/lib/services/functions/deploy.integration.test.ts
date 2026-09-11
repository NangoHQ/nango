import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { createAccount } from '../../seeders/account.seeder.js';
import { createConfigSeed } from '../../seeders/config.seeder.js';
import { createConnectionSeed } from '../../seeders/connection.seeder.js';
import { createEnvironmentSeed } from '../../seeders/environment.seeder.js';
import remoteFileService from '../file/remote.service.js';
import { deployBundle, prepareDeploymentBundle } from './deploy.js';
import { upsert } from './models/functions.js';
import { CONFIGS_TABLE, INSTANCES_TABLE } from './models/tables.js';
import { functionVersionHash } from './version.js';

import type { DBFunctionConfigVersion, DBFunctionInstance, FunctionDeploymentArtifact } from '@nangohq/types';

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
        await upsert(db.knex, [
            {
                environmentId: environment.id,
                integrationId: artifact.integrationId,
                name: artifact.name,
                version: functionVersion(artifact)
            }
        ]);
    }

    return environment.id;
}

describe('deployBundle instances', () => {
    const scheduled: FunctionDeploymentArtifact = { ...githubArtifact, trigger: { kind: 'schedule', frequency: 'every 5 minutes' } };

    beforeAll(async () => {
        await multipleMigrations();
    });

    beforeEach(() => {
        vi.spyOn(remoteFileService, 'upload').mockImplementation(({ destinationPath }) => Promise.resolve(destinationPath));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    async function setup() {
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        await createConfigSeed(environment, 'github', 'github');
        const connection = await createConnectionSeed({ env: environment, provider: 'github' });
        const deploy = async (functions: FunctionDeploymentArtifact[]) => {
            const reconciliation = (
                await prepareDeploymentBundle({ functions, environmentId: environment.id, reconciliationScope: { kind: 'environment' } })
            ).unwrap();
            return deployBundle({ accountId: account.id, environmentId: environment.id, environmentName: environment.name, reconciliation });
        };
        const instances = () =>
            db.knex
                .from<DBFunctionInstance>(INSTANCES_TABLE)
                .whereIn('function_config_id', db.knex.from(CONFIGS_TABLE).select('id').where({ environment_id: environment.id }))
                .orderBy('id');
        return { environment, connection, deploy, instances };
    }

    it('creates base instances only for active connections in the matching integration and environment', async () => {
        const ctx = await setup();
        const second = await createConnectionSeed({ env: ctx.environment, provider: 'github' });
        const deleted = await createConnectionSeed({ env: ctx.environment, provider: 'github' });
        await db.knex.from('_nango_connections').where({ id: deleted.id }).update({ deleted: true });
        await createConfigSeed(ctx.environment, 'gitlab', 'gitlab');
        await createConnectionSeed({ env: ctx.environment, provider: 'gitlab' });
        const other = await setup();

        (await ctx.deploy([scheduled])).unwrap();

        const rows = await ctx.instances();
        expect(rows).toHaveLength(2);
        expect(rows.map((row) => row.nango_connection_id).sort((a, b) => a - b)).toEqual([ctx.connection.id, second.id].sort((a, b) => a - b));
        for (const row of rows) {
            expect(row).toMatchObject({
                name: scheduled.name,
                variant: 'base',
                frequency: scheduled.trigger.kind === 'schedule' ? scheduled.trigger.frequency : null,
                deleted_at: null
            });
        }
        expect(await other.instances()).toEqual([]);
    });

    it('creates instances when a non-scheduled function becomes scheduled', async () => {
        const ctx = await setup();
        (await ctx.deploy([githubArtifact])).unwrap();
        expect(await ctx.instances()).toEqual([]);

        (await ctx.deploy([scheduled])).unwrap();
        expect(await ctx.instances()).toEqual([expect.objectContaining({ nango_connection_id: ctx.connection.id, variant: 'base', deleted_at: null })]);
    });

    it('preserves instances and frequency overrides on unchanged and updated scheduled deployments', async () => {
        const ctx = await setup();
        (await ctx.deploy([scheduled])).unwrap();
        await db.knex.from(INSTANCES_TABLE).where({ nango_connection_id: ctx.connection.id }).update({ frequency: 'every 30 minutes' });
        const before = await ctx.instances();

        (await ctx.deploy([scheduled])).unwrap();
        expect(await ctx.instances()).toEqual(before);
        (await ctx.deploy([{ ...scheduled, trigger: { kind: 'schedule', frequency: 'every 10 minutes' } }])).unwrap();
        expect(await ctx.instances()).toEqual(before);
    });

    it.each(['trigger change', 'config removal'])('soft-deletes instances on %s without affecting another environment', async (reason) => {
        const ctx = await setup();
        const other = await setup();
        (await ctx.deploy([scheduled])).unwrap();
        (await other.deploy([scheduled])).unwrap();
        const before = await ctx.instances();
        const otherBefore = await other.instances();

        (await ctx.deploy(reason === 'trigger change' ? [githubArtifact] : [])).unwrap();

        const after = await ctx.instances();
        expect(after).toHaveLength(1);
        expect(after[0]?.id).toBe(before[0]?.id);
        expect(after[0]?.deleted_at).toBeInstanceOf(Date);
        expect(await other.instances()).toEqual(otherBefore);
    });
});

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
