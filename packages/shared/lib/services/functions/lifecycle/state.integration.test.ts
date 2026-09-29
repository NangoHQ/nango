import { beforeAll, describe, expect, it, vi } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { Ok } from '@nangohq/utils';

import { createConfigSeed } from '../../../seeders/config.seeder.js';
import { createConnectionSeed } from '../../../seeders/connection.seeder.js';
import { seedAccountEnvAndUser } from '../../../seeders/global.seeder.js';
import { upsert as upsertFunctionConfigs } from '../models/functions.js';
import { search as searchInstances, upsert as upsertInstances } from '../models/instances.js';
import { disable, enable } from './state.js';

import type { Orchestrator } from '../../../clients/orchestrator.js';
import type { FunctionConfigUpsert } from '../models/functions.js';
import type { FunctionTriggerDefinition } from '@nangohq/types';

function functionVersion(trigger: FunctionTriggerDefinition): FunctionConfigUpsert['version'] {
    return {
        description: 'Fetch issues',
        file_location: 'github/functions/fetchIssues.js',
        version: '1',
        source: 'repo',
        trigger,
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
}

beforeAll(async () => {
    await multipleMigrations();
});

async function seed(trigger: FunctionTriggerDefinition = { kind: 'schedule', frequency: 'every hour' }) {
    const { env } = await seedAccountEnvAndUser();
    const integrationKey = `github-${Math.random().toString(36).slice(2, 10)}`;
    await createConfigSeed(env, integrationKey, 'github');
    const config = (
        await upsertFunctionConfigs(db.knex, [{ environmentId: env.id, integrationId: integrationKey, name: 'fetchIssues', version: functionVersion(trigger) }])
    ).unwrap()[0]!;

    return { env, integrationKey, config };
}

describe(enable, () => {
    it('enables the config and schedules a base instance for each connection', async () => {
        const { env, integrationKey, config } = await seed();
        await db.knex('function_configs').where({ id: config.config.id }).update({ enabled: false });
        const connection = await createConnectionSeed({ env, provider: integrationKey });
        const otherConnection = await createConnectionSeed({ env, provider: integrationKey });
        const scheduleFunctions = vi.fn<Orchestrator['scheduleFunctions']>().mockResolvedValue(Ok(undefined));

        const updated = (await enable({ environmentId: env.id, config, orchestrator: { scheduleFunctions } })).unwrap();

        expect(updated.enabled).toBe(true);
        const instances = (await searchInstances(db.knex, { functionConfigIds: [config.config.id] })).unwrap();
        expect(instances).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ nango_connection_id: connection.id, variant: 'base', enabled: true, frequency: null }),
                expect.objectContaining({ nango_connection_id: otherConnection.id, variant: 'base', enabled: true, frequency: null })
            ])
        );
        expect(instances).toHaveLength(2);
        expect(scheduleFunctions).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    environmentId: env.id,
                    connection: expect.objectContaining({ id: connection.id }),
                    frequencyFallback: 'every hour',
                    autoStart: true
                }),
                expect.objectContaining({
                    environmentId: env.id,
                    connection: expect.objectContaining({ id: otherConnection.id }),
                    frequencyFallback: 'every hour',
                    autoStart: true
                })
            ])
        );
    });

    it('uses trigger.autoStart when set', async () => {
        const { env, integrationKey, config } = await seed({ kind: 'schedule', frequency: 'every hour', autoStart: false });
        await db.knex('function_configs').where({ id: config.config.id }).update({ enabled: false });
        await createConnectionSeed({ env, provider: integrationKey });
        const scheduleFunctions = vi.fn<Orchestrator['scheduleFunctions']>().mockResolvedValue(Ok(undefined));

        (await enable({ environmentId: env.id, config, orchestrator: { scheduleFunctions } })).unwrap();

        expect(scheduleFunctions).toHaveBeenCalledWith([expect.objectContaining({ autoStart: false })]);
    });

    it('does not schedule a function if trigger is not scheduled', async () => {
        const { env, integrationKey, config } = await seed({ kind: 'http', subscriptions: [] });
        await db.knex('function_configs').where({ id: config.config.id }).update({ enabled: false });
        await createConnectionSeed({ env, provider: integrationKey });
        const scheduleFunctions = vi.fn<Orchestrator['scheduleFunctions']>().mockResolvedValue(Ok(undefined));

        const updated = (await enable({ environmentId: env.id, config, orchestrator: { scheduleFunctions } })).unwrap();

        expect(updated.enabled).toBe(true);
        expect(scheduleFunctions).not.toHaveBeenCalled();
        expect((await searchInstances(db.knex, { functionConfigIds: [config.config.id] })).unwrap()).toEqual([]);
    });

    it('re-enables base instances but leaves disabled variants off and unscheduled', async () => {
        const { env, integrationKey, config } = await seed();
        const connection = await createConnectionSeed({ env, provider: integrationKey });
        // What a prior disable leaves behind: disabled, no schedules.
        const [base, canary] = (
            await upsertInstances(db.knex, [
                { function_config_id: config.config.id, nango_connection_id: connection.id, name: 'fetchIssues', variant: 'base', frequency: null },
                { function_config_id: config.config.id, nango_connection_id: connection.id, name: 'fetchIssues', variant: 'canary', frequency: 'every day' }
            ])
        ).unwrap();
        await db.knex('function_instances').whereIn('id', [base!.id, canary!.id]).update({ enabled: false });
        const scheduleFunctions = vi.fn<Orchestrator['scheduleFunctions']>().mockResolvedValue(Ok(undefined));

        (await enable({ environmentId: env.id, config, orchestrator: { scheduleFunctions } })).unwrap();

        const instances = (await searchInstances(db.knex, { functionConfigIds: [config.config.id] })).unwrap();
        expect(instances).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: base!.id, variant: 'base', enabled: true }),
                expect.objectContaining({ id: canary!.id, variant: 'canary', enabled: false, frequency: 'every day' })
            ])
        );
        expect(scheduleFunctions).toHaveBeenCalledWith([expect.objectContaining({ instance: expect.objectContaining({ id: base!.id }) })]);
    });

    it('re-enabling does not duplicate instances', async () => {
        const { env, integrationKey, config } = await seed();
        const connection = await createConnectionSeed({ env, provider: integrationKey });
        const existing = (
            await upsertInstances(db.knex, [
                { function_config_id: config.config.id, nango_connection_id: connection.id, name: 'fetchIssues', variant: 'base', frequency: null }
            ])
        ).unwrap();
        const scheduleFunctions = vi.fn<Orchestrator['scheduleFunctions']>().mockResolvedValue(Ok(undefined));

        (await enable({ environmentId: env.id, config, orchestrator: { scheduleFunctions } })).unwrap();

        const instances = (await searchInstances(db.knex, { functionConfigIds: [config.config.id] })).unwrap();
        expect(instances.map((instance) => instance.id)).toEqual(existing.map((instance) => instance.id));
    });
});

describe(disable, () => {
    it('disables the config and every instance, deletes schedules', async () => {
        const { env, integrationKey, config } = await seed();
        const connection = await createConnectionSeed({ env, provider: integrationKey });
        const instances = (
            await upsertInstances(db.knex, [
                { function_config_id: config.config.id, nango_connection_id: connection.id, name: 'fetchIssues', variant: 'base', frequency: null },
                { function_config_id: config.config.id, nango_connection_id: connection.id, name: 'fetchIssues', variant: 'canary', frequency: 'every day' }
            ])
        ).unwrap();
        const deleteFunctionSchedules = vi.fn<Orchestrator['deleteFunctionSchedules']>().mockResolvedValue(Ok(undefined));

        const updated = (await disable({ environmentId: env.id, config, orchestrator: { deleteFunctionSchedules } })).unwrap();

        expect(updated.enabled).toBe(false);
        expect(deleteFunctionSchedules).toHaveBeenCalledWith({ environmentId: env.id, instanceIds: instances.map((instance) => instance.id) });
        const after = (await searchInstances(db.knex, { functionConfigIds: [config.config.id] })).unwrap();
        expect(after).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ variant: 'base', enabled: false, deleted_at: null }),
                expect.objectContaining({ variant: 'canary', enabled: false, deleted_at: null, frequency: 'every day' })
            ])
        );
    });

    it('is a no-op when already disabled', async () => {
        const { env, config } = await seed();
        await db.knex('function_configs').where({ id: config.config.id }).update({ enabled: false });
        const deleteFunctionSchedules = vi.fn<Orchestrator['deleteFunctionSchedules']>().mockResolvedValue(Ok(undefined));

        const updated = (await disable({ environmentId: env.id, config, orchestrator: { deleteFunctionSchedules } })).unwrap();

        expect(updated.enabled).toBe(false);
        expect(deleteFunctionSchedules).not.toHaveBeenCalled();
    });
});
