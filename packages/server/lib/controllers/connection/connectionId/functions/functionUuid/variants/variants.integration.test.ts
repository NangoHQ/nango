import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { functionConfigService, functionInstanceService, Orchestrator, seeders } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { runServer, shouldBeProtected } from '../../../../../../utils/tests.js';

import type { FunctionTriggerDefinition } from '@nangohq/types';

const endpoint = '/connections/:connectionId/functions/:functionUuid/variants';
const deleteEndpoint = `${endpoint}/:variant`;
const patchEndpoint = `${endpoint}/:variant`;
let api: Awaited<ReturnType<typeof runServer>>;

async function seed(trigger: FunctionTriggerDefinition = { kind: 'schedule', frequency: 'every hour', autoStart: false }, maxVariants = 100) {
    const { apiKey, env } = await seeders.seedAccountEnvAndUser({ plan: { variants_per_sync_max: maxVariants } });
    await db
        .knex('customer_keys')
        .where('id', apiKey.id)
        .update({ scopes: ['environment:functions:update'] });
    const integration = await seeders.createConfigSeed(env, `github-${randomUUID()}`, 'github');
    const connection = await seeders.createConnectionSeed({ env, provider: integration.unique_key, connectionId: randomUUID() });
    const func = (
        await functionConfigService.upsert(db.knex, [
            {
                environmentId: env.id,
                integrationId: integration.unique_key,
                name: 'fetchIssues',
                version: {
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
                }
            }
        ])
    ).unwrap()[0];
    if (!func) {
        throw new Error('Failed to seed function');
    }
    const base = (
        await functionInstanceService.upsert(db.knex, [
            {
                nango_connection_id: connection.id,
                function_config_id: func.config.id,
                name: func.config.name,
                variant: 'base',
                frequency: null
            }
        ])
    ).unwrap()[0];
    if (!base) {
        throw new Error('Failed to seed base variant');
    }
    return { apiKey, env, integration, connection, func, base, params: { connectionId: connection.connection_id, functionUuid: func.config.uuid } };
}

describe('function variant endpoints', () => {
    async function seedVariant() {
        const seeded = await seed();
        const instance = (
            await functionInstanceService.upsert(db.knex, [
                {
                    nango_connection_id: seeded.connection.id,
                    function_config_id: seeded.func.config.id,
                    name: seeded.func.config.name,
                    variant: 'custom',
                    frequency: null,
                    enabled: true
                }
            ])
        ).unwrap()[0]!;
        return {
            ...seeded,
            instance
        };
    }

    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each(['POST', 'DELETE', 'PATCH'] as const)('%s requires authentication', async (method) => {
        const params = { connectionId: 'connection', functionUuid: randomUUID(), variant: 'custom' };
        const request = (() => {
            switch (method) {
                case 'POST':
                    return api.fetch(endpoint, { method: 'POST', params, body: { variant: 'custom' } });
                case 'DELETE':
                    return api.fetch(deleteEndpoint, { method: 'DELETE', params });
                case 'PATCH':
                    return api.fetch(patchEndpoint, { method: 'PATCH', params, body: { enabled: true } });
            }
        })();
        shouldBeProtected(await request);
    });

    it.each(['POST', 'DELETE'] as const)('%s requires the functions update scope', async (method) => {
        const seeded = await seed();
        await db
            .knex('customer_keys')
            .where('id', seeded.apiKey.id)
            .update({ scopes: ['environment:functions:read'] });
        const request = { token: seeded.apiKey.secret, params: { ...seeded.params, variant: 'custom' } };
        const res =
            method === 'POST'
                ? await api.fetch(endpoint, { ...request, method: 'POST', body: { variant: 'custom' } })
                : await api.fetch(deleteEndpoint, { ...request, method: 'DELETE' });
        expect(res.res.status).toBe(403);
    });

    it('creates a variant idempotently, deletes it and allows recreation', async () => {
        const seeded = await seed();
        const schedule = vi.spyOn(Orchestrator.prototype, 'scheduleFunctions').mockResolvedValue(Ok(undefined));
        const unschedule = vi.spyOn(Orchestrator.prototype, 'deleteFunctionSchedules').mockResolvedValue(Ok(undefined));
        const request = { method: 'POST' as const, token: seeded.apiKey.secret, params: seeded.params, body: { variant: 'custom' } };
        const created = await api.fetch(endpoint, request);
        expect(created.res.status).toBe(200);
        expect(created.json).toEqual({
            function: { uuid: seeded.func.config.uuid, name: 'fetchIssues' },
            variant: 'custom',
            frequency: 'every hour',
            state: 'disabled'
        });
        const instances = (await functionInstanceService.search(db.knex, { connectionIds: [seeded.connection.id] })).unwrap();
        const custom = instances.find((instance) => instance.variant === 'custom');
        if (!custom) {
            throw new Error('Created variant was not found');
        }
        expect(custom.enabled).toBe(false);
        expect(schedule).not.toHaveBeenCalled();
        const duplicate = await api.fetch(endpoint, request);
        expect(duplicate.res.status).toBe(200);
        expect(duplicate.json).toEqual(created.json);
        const afterDuplicate = (await functionInstanceService.search(db.knex, { connectionIds: [seeded.connection.id] })).unwrap();
        expect(afterDuplicate.filter((instance) => instance.variant === 'custom')).toHaveLength(1);
        expect(schedule).not.toHaveBeenCalled();

        const deleted = await api.fetch(deleteEndpoint, { method: 'DELETE', token: seeded.apiKey.secret, params: { ...seeded.params, variant: 'custom' } });
        expect(deleted.res.status).toBe(200);
        expect(deleted.json).toEqual({ success: true });
        expect(unschedule).toHaveBeenCalledWith({ environmentId: seeded.env.id, instanceIds: [custom.id] });
        const remaining = (await functionInstanceService.search(db.knex, { connectionIds: [seeded.connection.id] })).unwrap();
        expect(remaining.map((instance) => instance.variant)).toEqual(['base']);
        expect((await api.fetch(endpoint, request)).res.status).toBe(200);
    });

    it.each(['base', 'BASE', 'Base'])('protects variant %s from creation and deletion', async (variant) => {
        const seeded = await seed();
        for (const method of ['POST', 'DELETE'] as const) {
            const request = { token: seeded.apiKey.secret, params: { ...seeded.params, variant } };
            const res =
                method === 'POST'
                    ? await api.fetch(endpoint, { ...request, method: 'POST', body: { variant } })
                    : await api.fetch(deleteEndpoint, { ...request, method: 'DELETE' });
            expect(res.res.status).toBe(400);
            expect(res.json).toMatchObject({ error: { code: 'invalid_variant' } });
        }
    });

    it('rejects invalid body, params and query strings', async () => {
        const seeded = await seed();
        const cases = [
            { params: seeded.params, body: { variant: 'bad variant' }, code: 'invalid_body' },
            { params: seeded.params, body: { variant: 'custom', extra: true }, code: 'invalid_body' },
            { params: { ...seeded.params, functionUuid: 'bad' }, body: { variant: 'custom' }, code: 'invalid_uri_params' }
        ];
        for (const test of cases) {
            const res = await api.fetch(endpoint, { method: 'POST', token: seeded.apiKey.secret, params: test.params, body: test.body });
            expect(res.res.status).toBe(400);
            expect(res.json).toMatchObject({ error: { code: test.code } });
        }
        for (const method of ['POST', 'DELETE'] as const) {
            const request = {
                token: seeded.apiKey.secret,
                params: { ...seeded.params, variant: 'custom' },
                // Deliberately violate the endpoint contract to exercise query validation.
                query: { unexpected: 'true' } as never
            };
            const res =
                method === 'POST'
                    ? await api.fetch(endpoint, { ...request, method: 'POST', body: { variant: 'custom' } })
                    : await api.fetch(deleteEndpoint, { ...request, method: 'DELETE' });
            expect(res.res.status).toBe(400);
            expect(res.json).toMatchObject({ error: { code: 'invalid_query_params' } });
        }
    });

    it('rejects functions from another environment and connections from another integration', async () => {
        const seeded = await seed();
        const other = await seed();
        const otherIntegration = await seeders.createConfigSeed(seeded.env, `github-${randomUUID()}`, 'github');
        const otherConnection = await seeders.createConnectionSeed({
            env: seeded.env,
            provider: otherIntegration.unique_key,
            connectionId: randomUUID()
        });
        const requests = [
            { params: { ...seeded.params, functionUuid: other.func.config.uuid }, code: 'function_not_found' },
            { params: { ...seeded.params, connectionId: otherConnection.connection_id }, code: 'connection_not_found' }
        ];
        for (const request of requests) {
            const res = await api.fetch(endpoint, { method: 'POST', token: seeded.apiKey.secret, params: request.params, body: { variant: 'custom' } });
            expect(res.res.status).toBe(404);
            expect(res.json).toMatchObject({ error: { code: request.code } });
        }
    });

    it('rejects non-scheduled and disabled functions', async () => {
        const nonScheduled = await seed({ kind: 'http' });
        const invalid = await api.fetch(endpoint, {
            method: 'POST',
            token: nonScheduled.apiKey.secret,
            params: nonScheduled.params,
            body: { variant: 'custom' }
        });
        expect(invalid.res.status).toBe(400);
        expect(invalid.json).toMatchObject({ error: { code: 'invalid_variant' } });
        const disabled = await seed();
        await functionConfigService.update(db.knex, { environmentId: disabled.env.id, uuid: disabled.func.config.uuid, fields: { enabled: false } });
        const res = await api.fetch(endpoint, { method: 'POST', token: disabled.apiKey.secret, params: disabled.params, body: { variant: 'custom' } });
        expect(res.res.status).toBe(400);
        expect(res.json).toMatchObject({ error: { code: 'function_disabled' } });
    });

    it('enforces the soft cap per function', async () => {
        const seeded = await seed({ kind: 'schedule', frequency: 'every hour', autoStart: true }, 2);
        const schedule = vi.spyOn(Orchestrator.prototype, 'scheduleFunctions').mockResolvedValue(Ok(undefined));
        const request = { method: 'POST' as const, token: seeded.apiKey.secret, params: seeded.params };
        expect((await api.fetch(endpoint, { ...request, body: { variant: 'first' } })).res.status).toBe(200);
        const capped = await api.fetch(endpoint, { ...request, body: { variant: 'second' } });
        expect(capped.res.status).toBe(400);
        expect(capped.json).toMatchObject({ error: { code: 'resource_capped' } });
        expect(schedule).toHaveBeenCalledTimes(1);
        expect(schedule).toHaveBeenCalledWith([expect.objectContaining({ instance: expect.objectContaining({ variant: 'first', enabled: true }) })]);
    });

    it('enables, changes frequency, resets the override and disables a variant', async () => {
        const seeded = await seedVariant();
        const request = {
            method: 'PATCH' as const,
            token: seeded.apiKey.secret,
            params: {
                connectionId: seeded.connection.connection_id,
                functionUuid: seeded.func.config.uuid,
                variant: seeded.instance.variant
            }
        };

        const schedule = vi.spyOn(Orchestrator.prototype, 'scheduleFunctions').mockResolvedValue(Ok(undefined));
        const unschedule = vi.spyOn(Orchestrator.prototype, 'deleteFunctionSchedules').mockResolvedValue(Ok(undefined));
        const enabled = await api.fetch(patchEndpoint, { ...request, body: { enabled: true, frequency: 'every 30s' } });
        expect(enabled.res.status).toBe(200);
        expect(enabled.json).toMatchObject({ state: 'enabled', frequency: 'every 30s' });
        expect(schedule).toHaveBeenLastCalledWith([
            expect.objectContaining({ instance: expect.objectContaining({ id: seeded.instance.id, enabled: true, frequency: 'every 30s' }) })
        ]);
        const changed = await api.fetch(patchEndpoint, { ...request, body: { frequency: 'every 2 hours' } });
        expect(changed.res.status).toBe(200);
        expect(changed.json).toMatchObject({ state: 'enabled', frequency: 'every 2 hours' });
        expect(schedule).toHaveBeenLastCalledWith([
            expect.objectContaining({ instance: expect.objectContaining({ enabled: true, frequency: 'every 2 hours' }) })
        ]);
        const reset = await api.fetch(patchEndpoint, { ...request, body: { frequency: null } });
        expect(reset.res.status).toBe(200);
        expect(reset.json).toMatchObject({ state: 'enabled', frequency: 'every hour' });
        expect(schedule).toHaveBeenLastCalledWith([
            expect.objectContaining({ instance: expect.objectContaining({ frequency: null }), frequencyFallback: 'every hour' })
        ]);
        const disabled = await api.fetch(patchEndpoint, { ...request, body: { enabled: false } });
        expect(disabled.res.status).toBe(200);
        expect(disabled.json).toMatchObject({ state: 'disabled', frequency: 'every hour' });
        expect(unschedule).toHaveBeenCalledWith({ environmentId: seeded.env.id, instanceIds: [seeded.instance.id] });
        expect((await functionInstanceService.search(db.knex, { instanceIds: [seeded.instance.id] })).unwrap()[0]).toMatchObject({
            enabled: false,
            frequency: null
        });
    });

    it('rejects frequencies that are too short', async () => {
        const seeded = await seedVariant();
        const request = {
            method: 'PATCH' as const,
            token: seeded.apiKey.secret,
            params: {
                connectionId: seeded.connection.connection_id,
                functionUuid: seeded.func.config.uuid,
                variant: seeded.instance.variant
            }
        };

        const schedule = vi.spyOn(Orchestrator.prototype, 'scheduleFunctions').mockResolvedValue(Ok(undefined));
        const unschedule = vi.spyOn(Orchestrator.prototype, 'deleteFunctionSchedules').mockResolvedValue(Ok(undefined));
        for (const frequency of ['1s', 'every 20s']) {
            const res = await api.fetch(patchEndpoint, { ...request, body: { frequency } });
            expect(res.res.status).toBe(400);
            expect(res.json).toMatchObject({ error: { code: 'invalid_frequency' } });
        }
        expect((await functionInstanceService.search(db.knex, { instanceIds: [seeded.instance.id] })).unwrap()[0]).toMatchObject({
            enabled: true,
            frequency: null
        });
        expect(schedule).not.toHaveBeenCalled();
        expect(unschedule).not.toHaveBeenCalled();
    });

    it('returns errors for missing and protected variants', async () => {
        const seeded = await seed();
        for (const [variant, status, code] of [
            ['missing', 404, 'function_variant_not_found'],
            ['base', 400, 'invalid_variant']
        ] as const) {
            const res = await api.fetch(patchEndpoint, {
                method: 'PATCH',
                token: seeded.apiKey.secret,
                params: { ...seeded.params, variant },
                body: { enabled: true }
            });
            expect(res.res.status).toBe(status);
            expect(res.json).toMatchObject({ error: { code } });
        }
    });

    it('returns 404 when the variant does not exist', async () => {
        const seeded = await seed();
        const res = await api.fetch(deleteEndpoint, { method: 'DELETE', token: seeded.apiKey.secret, params: { ...seeded.params, variant: 'missing' } });
        expect(res.res.status).toBe(404);
        expect(res.json).toMatchObject({ error: { code: 'function_variant_not_found' } });
    });
});
