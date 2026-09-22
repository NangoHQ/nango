import { beforeAll, describe, expect, it, vi } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { Err, Ok } from '@nangohq/utils';

import { createConfigSeed } from '../../seeders/config.seeder.js';
import { createConnectionSeed } from '../../seeders/connection.seeder.js';
import { seedAccountEnvAndUser } from '../../seeders/global.seeder.js';
import configService from '../config.service.js';
import { upsert as upsertFunctionConfigs } from './models/functions.js';
import { search as searchInstances, upsert as upsertInstances } from './models/instances.js';
import { CONFIGS_TABLE, VERSIONS_TABLE } from './models/tables.js';

import type { Orchestrator } from '../../clients/orchestrator.js';
import type { FunctionConfigUpsert } from './models/functions.js';
import type { DBConnection, DBFunctionConfig, DBFunctionConfigVersion, IntegrationConfig } from '@nangohq/types';

const functionVersion: FunctionConfigUpsert['version'] = {
    description: 'Fetch issues',
    file_location: 'github/functions/fetchIssues.js',
    version: '1',
    source: 'repo',
    trigger: { kind: 'schedule', frequency: 'every hour' },
    requires: { connection: true, outbound: true, invoke: false },
    capabilities: { usesOutbound: true, usesRecords: false, usesMetadata: false, usesCheckpoints: false, usesInvoke: false },
    limits: { concurrency: { perConnection: 'max' } },
    input_schema_ref: null,
    output_schema_ref: null,
    model_schema_refs: [],
    metadata_schema_ref: null,
    checkpoint_schema_ref: null,
    json_schema: { type: 'object' }
};

beforeAll(async () => {
    await multipleMigrations();
});

async function seed() {
    const { env } = await seedAccountEnvAndUser();
    const targetKey = `github-${Math.random().toString(36).slice(2, 10)}`;
    const otherKey = `gitlab-${Math.random().toString(36).slice(2, 10)}`;
    const targetIntegration = await createConfigSeed(env, targetKey, 'github');
    await createConfigSeed(env, otherKey, 'gitlab');
    const targetConnection = await createConnectionSeed({ env, provider: targetKey });
    const otherConnection = await createConnectionSeed({ env, provider: otherKey });
    const targetConfig = (
        await upsertFunctionConfigs(db.knex, [{ environmentId: env.id, integrationId: targetKey, name: 'fetchIssues', version: functionVersion }])
    ).unwrap()[0]?.config;
    const otherConfig = (
        await upsertFunctionConfigs(db.knex, [{ environmentId: env.id, integrationId: otherKey, name: 'fetchIssues', version: functionVersion }])
    ).unwrap()[0]?.config;
    if (!targetIntegration.id || !targetConfig || !otherConfig) {
        throw new Error('failed_to_seed_integration_functions');
    }
    const targetInstances = (
        await upsertInstances(db.knex, [
            { function_config_id: targetConfig.id, nango_connection_id: targetConnection.id, name: 'fetchIssues', variant: 'base', frequency: null },
            { function_config_id: targetConfig.id, nango_connection_id: targetConnection.id, name: 'fetchIssues', variant: 'canary', frequency: null }
        ])
    ).unwrap();
    (
        await upsertInstances(db.knex, [
            { function_config_id: otherConfig.id, nango_connection_id: otherConnection.id, name: 'fetchIssues', variant: 'base', frequency: null }
        ])
    ).unwrap();

    return { env, targetKey, targetIntegrationId: targetIntegration.id, targetConnection, targetConfig, targetInstances, otherConnection, otherConfig };
}

describe('integration function deletion', () => {
    it('soft-deletes configs, versions and instances after deleting their schedules', async () => {
        const ctx = await seed();
        const deleteFunctionSchedules = vi.fn<Orchestrator['deleteFunctionSchedules']>().mockResolvedValue(Ok(undefined));

        const deleted = await configService.deleteProviderConfig({
            id: ctx.targetIntegrationId,
            environmentId: ctx.env.id,
            providerConfigKey: ctx.targetKey,
            orchestrator: { deleteFunctionSchedules, deleteSync: vi.fn() }
        });

        expect(deleted).toBe(true);
        expect(deleteFunctionSchedules).toHaveBeenCalledWith({
            environmentId: ctx.env.id,
            instanceIds: ctx.targetInstances.map((instance) => instance.id)
        });
        const [targetIntegration] = await db.knex.select<IntegrationConfig[]>('*').from('_nango_configs').where({ id: ctx.targetIntegrationId });
        const [targetConnection] = await db.knex.select<DBConnection[]>('*').from('_nango_connections').where({ id: ctx.targetConnection.id });
        const [targetConfig] = await db.knex.select<DBFunctionConfig[]>('*').from(CONFIGS_TABLE).where({ id: ctx.targetConfig.id });
        const targetVersions = await db.knex.select<DBFunctionConfigVersion[]>('*').from(VERSIONS_TABLE).where({ function_config_id: ctx.targetConfig.id });
        const targetInstances = (await searchInstances(db.knex, { connectionIds: [ctx.targetConnection.id] }, { includeDeleted: true })).unwrap();
        expect(targetIntegration?.deleted).toBe(true);
        expect(targetConnection?.deleted).toBe(true);
        expect(targetConfig?.deleted_at).toEqual(expect.any(Date));
        expect(targetVersions.map((version) => version.deleted_at)).toEqual([expect.any(Date)]);
        expect(targetInstances.map((instance) => instance.deleted_at)).toEqual([expect.any(Date), expect.any(Date)]);

        const [otherConfig] = await db.knex.select<DBFunctionConfig[]>('*').from(CONFIGS_TABLE).where({ id: ctx.otherConfig.id });
        const otherInstances = (await searchInstances(db.knex, { connectionIds: [ctx.otherConnection.id] }, { includeDeleted: true })).unwrap();
        expect(otherConfig?.deleted_at).toBeNull();
        expect(otherInstances).toEqual([expect.objectContaining({ deleted_at: null })]);
    });

    it('does not delete anything when schedule deletion fails', async () => {
        const ctx = await seed();
        const cause = new Error('orchestrator unavailable');
        const deleteFunctionSchedules = vi.fn<Orchestrator['deleteFunctionSchedules']>().mockResolvedValue(Err(cause));

        await expect(
            configService.deleteProviderConfig({
                id: ctx.targetIntegrationId,
                environmentId: ctx.env.id,
                providerConfigKey: ctx.targetKey,
                orchestrator: { deleteFunctionSchedules, deleteSync: vi.fn() }
            })
        ).rejects.toMatchObject({ message: 'failed_to_delete_functions_for_integration', cause });

        const [targetIntegration] = await db.knex.select<IntegrationConfig[]>('*').from('_nango_configs').where({ id: ctx.targetIntegrationId });
        const [targetConnection] = await db.knex.select<DBConnection[]>('*').from('_nango_connections').where({ id: ctx.targetConnection.id });
        const [targetConfig] = await db.knex.select<DBFunctionConfig[]>('*').from(CONFIGS_TABLE).where({ id: ctx.targetConfig.id });
        const targetInstances = (await searchInstances(db.knex, { connectionIds: [ctx.targetConnection.id] }, { includeDeleted: true })).unwrap();
        expect(targetIntegration?.deleted).toBe(false);
        expect(targetConnection?.deleted).toBe(false);
        expect(targetConfig?.deleted_at).toBeNull();
        expect(targetInstances.map((instance) => instance.deleted_at)).toEqual([null, null]);
    });
});
