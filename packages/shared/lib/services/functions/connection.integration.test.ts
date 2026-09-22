import { beforeAll, describe, expect, it, vi } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { Ok } from '@nangohq/utils';

import { createConfigSeed } from '../../seeders/config.seeder.js';
import { createConnectionSeed } from '../../seeders/connection.seeder.js';
import { seedAccountEnvAndUser } from '../../seeders/global.seeder.js';
import connectionService from '../connection.service.js';
import { ensureForConnection, softDeleteInstancesForConnection } from './connection.js';
import { upsert as upsertFunctionConfigs } from './models/functions.js';
import { search as searchInstances, upsert as upsertInstances } from './models/instances.js';

import type { Orchestrator } from '../../clients/orchestrator.js';
import type { SlackService } from '../notification/slack.service.js';
import type { FunctionConfigUpsert } from './models/functions.js';
import type { DBConnectionDecrypted } from '@nangohq/types';

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
    const integrationKey = `github-${Math.random().toString(36).slice(2, 10)}`;
    await createConfigSeed(env, integrationKey, 'github');
    const connection = await createConnectionSeed({ env, provider: integrationKey });
    const config = (
        await upsertFunctionConfigs(db.knex, [{ environmentId: env.id, integrationId: integrationKey, name: 'fetchIssues', version: functionVersion }])
    ).unwrap()[0]!.config;

    return { env, integrationKey, connection, config };
}

describe(ensureForConnection, () => {
    it('creates and schedules the base instance for a given connection', async () => {
        const { env, connection, config } = await seed();
        const scheduleFunctions = vi.fn<Orchestrator['scheduleFunctions']>().mockResolvedValue(Ok(undefined));

        (await ensureForConnection(db.knex, { connection, orchestrator: { scheduleFunctions } })).unwrap();

        const instances = (await searchInstances(db.knex, { connectionIds: [connection.id] })).unwrap();
        expect(instances).toEqual([
            expect.objectContaining({
                function_config_id: config.id,
                nango_connection_id: connection.id,
                name: 'fetchIssues',
                variant: 'base',
                frequency: null,
                deleted_at: null
            })
        ]);
        expect(scheduleFunctions).toHaveBeenCalledWith([
            {
                environmentId: env.id,
                instance: instances[0],
                connection,
                frequencyFallback: 'every hour',
                autoStart: true
            }
        ]);
    });
});

describe('connectionService.ensureFunctionInstances', () => {
    it('does not create instances for a deleted connection', async () => {
        const { connection } = await seed();
        await db.knex.from('_nango_connections').where({ id: connection.id }).update({ deleted: true, deleted_at: new Date() });
        const scheduleFunctions = vi.fn<Orchestrator['scheduleFunctions']>().mockResolvedValue(Ok(undefined));

        (await connectionService.ensureFunctionInstances({ connection, orchestrator: { scheduleFunctions } })).unwrap();

        expect(scheduleFunctions).not.toHaveBeenCalled();
        await expect(searchInstances(db.knex, { connectionIds: [connection.id] }).then((result) => result.unwrap())).resolves.toEqual([]);
    });
});

describe('connectionService.deleteConnection', () => {
    it('unschedules function instances', async () => {
        const { env, integrationKey, connection, config } = await seed();
        const instances = (
            await upsertInstances(db.knex, [
                {
                    function_config_id: config.id,
                    nango_connection_id: connection.id,
                    name: 'fetchIssues',
                    variant: 'base',
                    frequency: null
                },
                {
                    function_config_id: config.id,
                    nango_connection_id: connection.id,
                    name: 'fetchIssues',
                    variant: 'canary',
                    frequency: null
                }
            ])
        ).unwrap();
        const deleteFunctionSchedules = vi.fn<Orchestrator['deleteFunctionSchedules']>().mockResolvedValue(Ok(undefined));
        const orchestrator = { deleteFunctionSchedules } as unknown as Orchestrator;
        const slackService = {
            closeOpenNotificationForConnection: vi.fn().mockResolvedValue(undefined)
        } as unknown as SlackService;
        const decryptedConnection = {
            ...connection,
            credentials: { type: 'API_KEY', apiKey: 'test' }
        } satisfies DBConnectionDecrypted;

        await connectionService.deleteConnection({
            connection: decryptedConnection,
            providerConfigKey: integrationKey,
            environmentId: env.id,
            orchestrator,
            slackService,
            preDeletionHook: () => Promise.resolve()
        });

        expect(deleteFunctionSchedules).toHaveBeenCalledWith({
            environmentId: env.id,
            instanceIds: instances.map((instance) => instance.id)
        });
        const instancesAfter = (await searchInstances(db.knex, { connectionIds: [connection.id] }, { includeDeleted: true })).unwrap();
        expect(instancesAfter.map((instance) => instance.deleted_at)).toEqual([expect.any(Date), expect.any(Date)]);
    });
});

describe(softDeleteInstancesForConnection, () => {
    it('soft-deletes every function instance for a given connection', async () => {
        const { env, integrationKey, connection, config } = await seed();
        const otherConnection = await createConnectionSeed({ env, provider: integrationKey });
        const instance = (nango_connection_id: number, variant: string) => ({
            function_config_id: config.id,
            nango_connection_id,
            name: 'fetchIssues',
            variant,
            frequency: null
        });
        await upsertInstances(db.knex, [instance(connection.id, 'base'), instance(connection.id, 'canary'), instance(otherConnection.id, 'base')]);

        const res = (await softDeleteInstancesForConnection(db.knex, { connection })).unwrap();

        expect(res).toHaveLength(2);
        expect(res).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ nango_connection_id: connection.id, name: 'fetchIssues', variant: 'base' }),
                expect.objectContaining({ nango_connection_id: connection.id, name: 'fetchIssues', variant: 'canary' })
            ])
        );
        const targetAfter = (await searchInstances(db.knex, { connectionIds: [connection.id] }, { includeDeleted: true })).unwrap();
        expect(targetAfter.map((row) => row.deleted_at)).toEqual([expect.any(Date), expect.any(Date)]);
        const otherAfter = (await searchInstances(db.knex, { connectionIds: [otherConnection.id] }, { includeDeleted: true })).unwrap();
        expect(otherAfter).toEqual([expect.objectContaining({ deleted_at: null })]);
    });
});
