import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { createConfigSeed } from '../../../seeders/config.seeder.js';
import { createConnectionSeed } from '../../../seeders/connection.seeder.js';
import { seedAccountEnvAndUser } from '../../../seeders/global.seeder.js';
import { upsert as upsertFunctionConfigs } from './functions.js';
import { hardDelete, search, upsert } from './instances.js';

import type { FunctionConfigUpsert } from './functions.js';

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

describe(hardDelete, () => {
    it('hard-deletes soft-deleted instances within the environment scope', async () => {
        const { env: firstEnv } = await seedAccountEnvAndUser();
        const firstIntegrationKey = `github-${Math.random().toString(36).slice(2, 10)}`;
        await createConfigSeed(firstEnv, firstIntegrationKey, 'github');
        const firstConnection = await createConnectionSeed({ env: firstEnv, provider: firstIntegrationKey });
        const [firstCreatedConfig] = (
            await upsertFunctionConfigs(db.knex, [
                { environmentId: firstEnv.id, integrationId: firstIntegrationKey, name: 'fetchIssues', version: functionVersion }
            ])
        ).unwrap();
        if (!firstCreatedConfig) {
            throw new Error('failed_to_create_function_config');
        }
        const firstInstance = (
            await upsert(db.knex, [
                {
                    function_config_id: firstCreatedConfig.config.id,
                    nango_connection_id: firstConnection.id,
                    name: 'fetchIssues',
                    variant: 'base',
                    frequency: null
                }
            ])
        ).unwrap()[0];
        if (!firstInstance) {
            throw new Error('failed_to_create_function_instance');
        }
        await db.knex.from('function_instances').where({ id: firstInstance.id }).update({ deleted_at: new Date() });

        const { env: secondEnv } = await seedAccountEnvAndUser();
        const secondIntegrationKey = `github-${Math.random().toString(36).slice(2, 10)}`;
        await createConfigSeed(secondEnv, secondIntegrationKey, 'github');
        const secondConnection = await createConnectionSeed({ env: secondEnv, provider: secondIntegrationKey });
        const [secondCreatedConfig] = (
            await upsertFunctionConfigs(db.knex, [
                { environmentId: secondEnv.id, integrationId: secondIntegrationKey, name: 'fetchIssues', version: functionVersion }
            ])
        ).unwrap();
        if (!secondCreatedConfig) {
            throw new Error('failed_to_create_function_config');
        }
        const secondInstance = (
            await upsert(db.knex, [
                {
                    function_config_id: secondCreatedConfig.config.id,
                    nango_connection_id: secondConnection.id,
                    name: 'fetchIssues',
                    variant: 'base',
                    frequency: null
                }
            ])
        ).unwrap()[0];
        if (!secondInstance) {
            throw new Error('failed_to_create_function_instance');
        }
        await db.knex.from('function_instances').where({ id: secondInstance.id }).update({ deleted_at: new Date() });

        const deleted = (await hardDelete(db.knex, { instanceIds: [firstInstance.id, secondInstance.id] }, { environmentId: firstEnv.id })).unwrap();

        expect(deleted.map((deletedInstance) => deletedInstance.id)).toEqual([firstInstance.id]);
        expect((await search(db.knex, { connectionIds: [firstConnection.id] }, { includeDeleted: true })).unwrap()).toEqual([]);
        expect((await search(db.knex, { connectionIds: [secondConnection.id] }, { includeDeleted: true })).unwrap().map(({ id }) => id)).toEqual([
            secondInstance.id
        ]);
    });
});
