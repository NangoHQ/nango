import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { getFlags } from '@nangohq/feature-flags';
import { connectionService, functionConfigService, listCatalogTools, NangoError, Orchestrator, seeders } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { isError, runServer, shouldBeProtected } from '../../../../utils/tests.js';

import type { DBFunctionConfigVersion, DBSyncConfig } from '@nangohq/types';

const route = '/connections/:connectionId/tools/:name/calls';
const name = 'calendar_delete_event';
const input = { eventId: 'event123' };
let api: Awaited<ReturnType<typeof runServer>>;

const version = {
    description: 'Delete a calendar event',
    tags: {},
    file_location: 'github/functions/calendar_delete_event.js',
    version: 'test-version',
    source: 'repo',
    trigger: { kind: 'http' },
    requires: { connection: true, outbound: false, invoke: false },
    capabilities: { usesRecords: false, usesOutbound: false, usesCheckpoints: false, usesMetadata: false, usesInvoke: false },
    limits: { concurrency: { perConnection: 'max' } },
    input_schema_ref: '#/definitions/Input',
    output_schema_ref: null,
    model_schema_refs: [],
    metadata_schema_ref: null,
    checkpoint_schema_ref: null,
    json_schema: {
        definitions: { Input: { type: 'object', properties: { eventId: { type: 'string' } }, required: ['eventId'], additionalProperties: false } }
    }
} satisfies Omit<DBFunctionConfigVersion, 'id' | 'function_config_id' | 'created_at' | 'updated_at' | 'deleted_at'>;

async function seedTool(toolName = name) {
    const seed = await seeders.seedAccountEnvAndUser();
    await db
        .knex('customer_keys')
        .where({ id: seed.apiKey.id })
        .update({ scopes: ['environment:functions:invocations', 'environment:actions:execute'] });
    const integration = await seeders.createConfigSeed(seed.env, 'github', 'github');
    const connection = await seeders.createConnectionSeed({ env: seed.env, provider: integration.unique_key, connectionId: randomUUID() });
    const [fn] = (
        await functionConfigService.upsert(db.knex, [{ environmentId: seed.env.id, integrationId: integration.unique_key, name: toolName, version }])
    ).unwrap();
    return { ...seed, integration, connection, fn: fn!, params: { connectionId: connection.connection_id, name: toolName } };
}

async function seedAction(seed: Awaited<ReturnType<typeof seedTool>>) {
    await db.knex.from<DBSyncConfig>('_nango_sync_configs').insert({
        environment_id: seed.env.id,
        nango_config_id: seed.integration.id!,
        sync_name: name,
        type: 'action',
        file_location: 'file_location',
        version: '0.0.1',
        source: 'repo',
        runs: null,
        track_deletes: false,
        auto_start: false,
        webhook_subscriptions: [],
        models: [],
        input: null,
        metadata: {},
        active: true,
        enabled: true,
        deleted: false,
        deleted_at: null
    });
}

async function seedOtherTool(seed: Awaited<ReturnType<typeof seedTool>>, connectionId = seed.connection.connection_id) {
    await seeders.createConfigSeed(seed.env, 'other-github', 'github');
    const connection = await seeders.createConnectionSeed({ env: seed.env, provider: 'other-github', connectionId });
    const [fn] = (await functionConfigService.upsert(db.knex, [{ environmentId: seed.env.id, integrationId: 'other-github', name, version }])).unwrap();
    if (!fn) {
        throw new Error('Failed to seed function');
    }
    return { connection, fn };
}

describe(`POST ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    beforeEach(() => {
        vi.spyOn(connectionService, 'search');
        vi.spyOn(getFlags(), 'hasCatalogTools').mockResolvedValue(false);
        vi.spyOn(Orchestrator.prototype, 'invokeFunction').mockResolvedValue(Ok({ data: { deleted: true } }));
        vi.spyOn(Orchestrator.prototype, 'triggerAction').mockResolvedValue(Ok({ data: { deleted: true } }));
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });
    afterAll(() => {
        api.server.close();
    });

    it.each([['environment:functions:invocations'], ['environment:actions:execute'], ['environment:functions:read']])(
        'requires authentication and both scopes when the key only has %s',
        async (scope) => {
            const seed = await seedTool();
            shouldBeProtected(await api.fetch(route, { method: 'POST', params: seed.params, body: { input } }));
            await db
                .knex('customer_keys')
                .where({ id: seed.apiKey.id })
                .update({ scopes: [scope] });
            const response = await api.fetch(route, { method: 'POST', token: seed.apiKey.secret, params: seed.params, body: { input } });
            expect(response.res.status).toBe(403);
            expect(Orchestrator.prototype.invokeFunction).not.toHaveBeenCalled();
            expect(Orchestrator.prototype.triggerAction).not.toHaveBeenCalled();
        }
    );

    it('invokes a function and returns its output directly', async () => {
        const seed = await seedTool();
        const response = await api.fetch(route, { method: 'POST', token: seed.apiKey.secret, params: seed.params, body: { input } });
        expect(response.res.status).toBe(200);
        expect(response.json).toStrictEqual({ deleted: true });
        expect(Orchestrator.prototype.invokeFunction).toHaveBeenCalledWith(
            expect.objectContaining({
                functionUuid: seed.fn.config.uuid,
                connection: expect.objectContaining({ id: seed.connection.id }),
                async: false,
                trigger: expect.objectContaining({ kind: 'http', input, request: expect.objectContaining({ body: input }) })
            })
        );
        expect(Orchestrator.prototype.triggerAction).not.toHaveBeenCalled();
        expect(connectionService.search).toHaveBeenCalledOnce();
    });

    it('prefers a function over an action with the same name', async () => {
        const seed = await seedTool();
        await seedAction(seed);
        const response = await api.fetch(route, { method: 'POST', token: seed.apiKey.secret, params: seed.params, body: { input } });
        expect(response.res.status).toBe(200);
        expect(Orchestrator.prototype.invokeFunction).toHaveBeenCalledOnce();
        expect(Orchestrator.prototype.triggerAction).not.toHaveBeenCalled();
    });

    it('falls back to a catalog action', async () => {
        const seed = await seedTool();
        vi.mocked(getFlags().hasCatalogTools).mockResolvedValue(true);
        const tool = listCatalogTools('github')[0]!;
        expect(tool).toBeDefined();
        const response = await api.fetch(route, {
            method: 'POST',
            token: seed.apiKey.secret,
            params: { ...seed.params, name: tool.name },
            body: { input }
        });
        expect(response.res.status).toBe(200);
        expect(Orchestrator.prototype.triggerAction).toHaveBeenCalledWith(expect.objectContaining({ actionName: tool.name, input }));
    });

    it('returns function_not_found when neither a function nor an action matches', async () => {
        const seed = await seedTool();
        const response = await api.fetch(route, {
            method: 'POST',
            token: seed.apiKey.secret,
            params: { ...seed.params, name: 'unknown_tool' },
            body: { input }
        });
        expect(response.res.status).toBe(404);
        isError(response.json);
        expect(response.json.error.code).toBe('function_not_found');
        expect(Orchestrator.prototype.triggerAction).not.toHaveBeenCalled();
    });

    it('returns function_failed when the fallback action fails', async () => {
        const seed = await seedTool();
        await seedAction(seed);
        await db.knex('function_configs').where({ id: seed.fn.config.id }).update({ deleted_at: new Date() });
        vi.mocked(Orchestrator.prototype.triggerAction).mockResolvedValue(
            Err(new NangoError('action_script_failure', { error: 'boom', payload: { reason: 'invalid' } }))
        );
        const response = await api.fetch(route, { method: 'POST', token: seed.apiKey.secret, params: seed.params, body: { input } });
        expect(response.res.status).toBe(500);
        isError(response.json);
        expect(response.json.error.code).toBe('function_failed');
        expect(response.json.error.payload).toStrictEqual({ error: 'boom', payload: { reason: 'invalid' } });
    });

    it.each(['deployed', 'catalog'] as const)('rejects a disabled function instead of falling back to a %s action', async (actionType) => {
        const toolName = actionType === 'catalog' ? listCatalogTools('github')[0]!.name : name;
        const seed = await seedTool(toolName);
        if (actionType === 'catalog') {
            vi.mocked(getFlags().hasCatalogTools).mockResolvedValue(true);
        } else {
            await seedAction(seed);
        }
        await db.knex('function_configs').where({ id: seed.fn.config.id }).update({ enabled: false });
        const response = await api.fetch(route, { method: 'POST', token: seed.apiKey.secret, params: seed.params, body: { input } });
        expect(response.res.status).toBe(404);
        isError(response.json);
        expect(response.json.error.code).toBe('function_not_found');
        expect(Orchestrator.prototype.invokeFunction).not.toHaveBeenCalled();
        expect(Orchestrator.prototype.triggerAction).not.toHaveBeenCalled();
    });

    it('rejects a reused connection ID even when only one integration has a matching function', async () => {
        const seed = await seedTool();
        await seeders.createConfigSeed(seed.env, 'other-github', 'github');
        await seeders.createConnectionSeed({ env: seed.env, provider: 'other-github', connectionId: seed.connection.connection_id });
        const response = await api.fetch(route, { method: 'POST', token: seed.apiKey.secret, params: seed.params, body: { input } });
        expect(response.res.status).toBe(400);
        isError(response.json);
        expect(response.json.error.code).toBe('ambiguous_connection');
        expect(Orchestrator.prototype.invokeFunction).not.toHaveBeenCalled();
        expect(Orchestrator.prototype.triggerAction).not.toHaveBeenCalled();
        expect(connectionService.search).toHaveBeenCalledOnce();
    });

    it('falls back to the connection integration action when another integration has a same-named function', async () => {
        const seed = await seedTool();
        const integration = await seeders.createConfigSeed(seed.env, 'other-github', 'github');
        const connection = await seeders.createConnectionSeed({ env: seed.env, provider: integration.unique_key, connectionId: randomUUID() });
        await seedAction({ ...seed, integration });
        const response = await api.fetch(route, {
            method: 'POST',
            token: seed.apiKey.secret,
            params: { ...seed.params, connectionId: connection.connection_id },
            body: { input }
        });
        expect(response.res.status).toBe(200);
        expect(Orchestrator.prototype.invokeFunction).not.toHaveBeenCalled();
        expect(Orchestrator.prototype.triggerAction).toHaveBeenCalledWith(
            expect.objectContaining({ actionName: name, connection: expect.objectContaining({ id: connection.id }) })
        );
    });

    it('derives the integration from the connection when functions share a name', async () => {
        const seed = await seedTool();
        const other = await seedOtherTool(seed, randomUUID());
        const response = await api.fetch(route, {
            method: 'POST',
            token: seed.apiKey.secret,
            params: { ...seed.params, connectionId: other.connection.connection_id },
            body: { input }
        });
        expect(response.res.status).toBe(200);
        expect(Orchestrator.prototype.invokeFunction).toHaveBeenCalledWith(expect.objectContaining({ functionUuid: other.fn.config.uuid }));
        expect(connectionService.search).toHaveBeenCalledOnce();
    });

    it('rejects ambiguous connection IDs when the integration is unknown and lets the header select it', async () => {
        const seed = await seedTool();
        await seedOtherTool(seed);
        const ambiguous = await api.fetch(route, { method: 'POST', token: seed.apiKey.secret, params: seed.params, body: { input } });
        expect(ambiguous.res.status).toBe(400);
        isError(ambiguous.json);
        expect(ambiguous.json.error).toMatchObject({ code: 'ambiguous_connection', message: expect.stringContaining('provider-config-key') });
        expect(Orchestrator.prototype.invokeFunction).not.toHaveBeenCalled();
        expect(Orchestrator.prototype.triggerAction).not.toHaveBeenCalled();
        expect(connectionService.search).toHaveBeenCalledOnce();

        const selected = await api.fetch(route, {
            method: 'POST',
            token: seed.apiKey.secret,
            params: seed.params,
            body: { input },
            headers: { 'provider-config-key': seed.integration.unique_key }
        });
        expect(selected.res.status).toBe(200);
        expect(Orchestrator.prototype.invokeFunction).toHaveBeenCalledWith(
            expect.objectContaining({ connection: expect.objectContaining({ id: seed.connection.id }) })
        );
        expect(connectionService.search).toHaveBeenCalledTimes(2);

        const wrongIntegration = await api.fetch(route, {
            method: 'POST',
            token: seed.apiKey.secret,
            params: seed.params,
            body: { input },
            headers: { 'provider-config-key': 'unknown' }
        });
        expect(wrongIntegration.res.status).toBe(404);
        isError(wrongIntegration.json);
        expect(wrongIntegration.json.error.code).toBe('connection_not_found');
        expect(connectionService.search).toHaveBeenCalledTimes(3);
    });

    it('uses the integration header to select the connection for action fallback', async () => {
        const seed = await seedTool();
        await seedAction(seed);
        await db.knex('function_configs').where({ id: seed.fn.config.id }).update({ deleted_at: new Date() });
        await seeders.createConfigSeed(seed.env, 'other-github', 'github');
        await seeders.createConnectionSeed({ env: seed.env, provider: 'other-github', connectionId: seed.connection.connection_id });
        const response = await api.fetch(route, {
            method: 'POST',
            token: seed.apiKey.secret,
            params: seed.params,
            body: { input },
            headers: { 'provider-config-key': seed.integration.unique_key }
        });
        expect(response.res.status).toBe(200);
        expect(Orchestrator.prototype.triggerAction).toHaveBeenCalledWith(
            expect.objectContaining({ connection: expect.objectContaining({ id: seed.connection.id }) })
        );
        expect(connectionService.search).toHaveBeenCalledWith(expect.anything(), {
            environmentId: seed.env.id,
            filter: { connectionId: seed.connection.connection_id, integrationId: seed.integration.unique_key },
            limit: 2
        });
    });

    it('requires the integration header for action fallback when the connection ID is ambiguous', async () => {
        const seed = await seedTool();
        await seedAction(seed);
        await db.knex('function_configs').where({ id: seed.fn.config.id }).update({ deleted_at: new Date() });
        await seeders.createConfigSeed(seed.env, 'other-github', 'github');
        await seeders.createConnectionSeed({ env: seed.env, provider: 'other-github', connectionId: seed.connection.connection_id });
        const response = await api.fetch(route, { method: 'POST', token: seed.apiKey.secret, params: seed.params, body: { input } });
        expect(response.res.status).toBe(400);
        isError(response.json);
        expect(response.json.error.code).toBe('ambiguous_connection');
        expect(Orchestrator.prototype.triggerAction).not.toHaveBeenCalled();
        expect(connectionService.search).toHaveBeenCalledOnce();
    });

    it('returns 404 for an unknown tool', async () => {
        const seed = await seedTool();
        const response = await api.fetch(route, { method: 'POST', token: seed.apiKey.secret, params: { ...seed.params, name: 'unknown' }, body: { input } });
        expect(response.res.status).toBe(404);
        expect(Orchestrator.prototype.triggerAction).not.toHaveBeenCalled();
    });

    it('validates URI params, headers and body, and rejects query parameters', async () => {
        const seed = await seedTool();
        const invalidParams = await api.fetch(route, {
            method: 'POST',
            token: seed.apiKey.secret,
            params: { ...seed.params, name: 'invalid name' },
            body: { input }
        });
        const invalidHeaders = await api.fetch(route, {
            method: 'POST',
            token: seed.apiKey.secret,
            params: seed.params,
            body: { input },
            headers: { 'provider-config-key': '/' }
        });
        const invalidQuery = await api.fetch(route, {
            method: 'POST',
            token: seed.apiKey.secret,
            params: seed.params,
            body: { input },
            query: { extra: 'x' } as never
        });
        const invalidBody = await api.fetch(route, {
            method: 'POST',
            token: seed.apiKey.secret,
            params: seed.params,
            body: { eventId: 'event123' } as never
        });
        for (const [response, code] of [
            [invalidParams, 'invalid_uri_params'],
            [invalidHeaders, 'invalid_headers'],
            [invalidQuery, 'invalid_query_params'],
            [invalidBody, 'invalid_body']
        ] as const) {
            expect(response.res.status).toBe(400);
            isError(response.json);
            expect(response.json.error.code).toBe(code);
        }
    });
});
