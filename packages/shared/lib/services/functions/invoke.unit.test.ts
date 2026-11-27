import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { NangoError } from '../../utils/error.js';
import { getCatalogFunctionByUuid } from '../catalog/actions.js';
import { generateCatalogFunctionUuid } from '../catalog/uuid.js';
import configService from '../config.service.js';
import connectionService from '../connection.service.js';
import { invokeFunction, resolveFunctionConnection } from './invoke.js';
import { clearFunctionInputValidatorCache } from './models/validate.js';

import type { Orchestrator } from '../../clients/orchestrator.js';
import type { ResolvedFunction, ResolvedInlineFunction, resolveFunctionByUuid } from './lookup/service.js';
import type * as logs from '@nangohq/logs';
import type { DBConnection, DBConnectionDecrypted, DBEnvironment, DBTeam } from '@nangohq/types';

const { lookup, createLog, schedule, searchConnections, getConnection, logCtx } = vi.hoisted(() => ({
    lookup: vi.fn<typeof resolveFunctionByUuid>(),
    createLog: vi.fn<logs.LogContextGetter['create']>(),
    schedule: vi.fn<Orchestrator['invokeFunction']>(),
    searchConnections: vi.fn<typeof connectionService.search>(),
    getConnection: vi.fn<typeof connectionService.getConnection>(),
    logCtx: { id: 'log-1', operation: {}, attachSpan: vi.fn(), success: vi.fn(), failed: vi.fn(), error: vi.fn() }
}));

vi.mock('./lookup/index.js', () => ({ resolveFunctionByUuid: lookup }));
vi.mock('@nangohq/logs', async (importOriginal) => ({
    ...(await importOriginal<typeof logs>()),
    logContextGetter: { create: createLog },
    OtlpSpan: class {}
}));

const connection = {
    id: 3,
    connection_id: 'connection-1',
    config_id: 9,
    provider_config_key: 'custom-github',
    environment_id: 2
} as DBConnection;

function catalogFunction(): ResolvedFunction {
    const definition = getCatalogFunctionByUuid(generateCatalogFunctionUuid({ provider: 'replicate', name: 'get-model' }));
    if (!definition) throw new Error('Missing catalog fixture');
    return { kind: 'catalog', uuid: definition.uuid, name: definition.name, enabled: true, definition };
}

function inlineFunction(): ResolvedInlineFunction {
    const uuid = '1c0de000-1111-8111-8111-111111111111';
    return {
        kind: 'inline',
        uuid,
        name: 'inline',
        enabled: true,
        code: 'return 1;',
        description: null,
        definition: { uuid, version: '0.0.0', trigger: { kind: 'http' }, input_schema_ref: null, json_schema: {}, limits: {} }
    };
}

function deployedFunction(): ResolvedFunction {
    return {
        kind: 'deployed',
        uuid: '11111111-1111-4111-8111-111111111111',
        name: 'test_function',
        enabled: true,
        integration: { id: 9, unique_key: 'custom-github', provider: 'github' },
        definition: {
            id: 42,
            function_config_id: 8,
            description: 'Test function',
            version: '1',
            tags: {},
            source: 'repo',
            file_location: 'functions/test_function.cjs',
            trigger: { kind: 'http' },
            requires: { connection: true, outbound: true },
            capabilities: { usesRecords: false, usesOutbound: true, usesCheckpoints: false, usesMetadata: false, usesInvoke: false },
            limits: { concurrency: { perConnection: 'max' } },
            input_schema_ref: '#/definitions/Input',
            output_schema_ref: null,
            model_schema_refs: [],
            metadata_schema_ref: null,
            checkpoint_schema_ref: null,
            json_schema: {
                definitions: {
                    Input: {
                        type: 'object',
                        properties: { modelId: { type: 'string' } },
                        required: ['modelId'],
                        additionalProperties: false
                    }
                }
            },
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null
        }
    };
}

function invoke(
    fn: ResolvedFunction | ResolvedInlineFunction = deployedFunction(),
    invocationType: 'wait' | 'no_wait' = 'wait',
    input: unknown = { modelId: 'owner/model' },
    integrationId?: string
) {
    return invokeFunction({
        account: { id: 1 } as DBTeam,
        environment: { id: 2, name: 'dev' } as DBEnvironment,
        connectionId: connection.connection_id,
        integrationId,
        functionUuid: fn.uuid,
        input,
        request: { method: 'POST', path: '/test', headers: {}, query: {} },
        invocationType,
        orchestrator: { invokeFunction: schedule } as unknown as Orchestrator
    });
}

beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    clearFunctionInputValidatorCache();
    lookup.mockResolvedValue(Ok(deployedFunction()));
    createLog.mockResolvedValue(logCtx as unknown as logs.LogContextOrigin);
    schedule.mockResolvedValue(Ok({ data: { title: 'Issue' } }));
    searchConnections.mockResolvedValue(Ok([connection]));
    getConnection.mockResolvedValue({ success: true, error: null, response: connection as DBConnectionDecrypted });
    vi.spyOn(connectionService, 'search').mockImplementation(searchConnections);
    vi.spyOn(connectionService, 'getConnection').mockImplementation(getConnection);
});

describe('invokeFunction', () => {
    it.skip('invokes a catalog function', async () => {
        const fn = catalogFunction();
        lookup.mockResolvedValue(Ok(fn));
        const result = await invoke(fn);

        expect(result.result.unwrap()).toEqual({ data: { title: 'Issue' } });
        expect(searchConnections).toHaveBeenCalledTimes(1);
        expect(searchConnections).toHaveBeenCalledWith(expect.anything(), {
            environmentId: 2,
            filter: { connectionId: 'connection-1', provider: 'replicate' },
            limit: 2
        });
        expect(getConnection).not.toHaveBeenCalled();
        const args = schedule.mock.calls[0]?.[0];
        if (!args) throw new Error('Missing invocation');
        expect(args.functionUuid).toBe(fn.uuid);
        expect(args.trigger).toEqual({
            kind: 'http',
            input: { modelId: 'owner/model' },
            request: { method: 'POST', path: '/test', headers: {}, query: {}, body: { modelId: 'owner/model' } },
            connection: { connectionId: 'connection-1', integrationId: 'custom-github' }
        });
        expect(createLog.mock.calls[0]?.[1].syncConfig).toEqual({ name: fn.name });
        expect(logCtx.success).toHaveBeenCalledOnce();
    });

    describe('catalog integration scope', () => {
        function scopedCatalogFunction(): ResolvedFunction {
            const uuid = generateCatalogFunctionUuid({ provider: 'github', name: 'test-tool' });
            return {
                kind: 'catalog',
                uuid,
                name: 'test-tool',
                enabled: true,
                definition: {
                    ...deployedFunction().definition,
                    uuid,
                    name: 'test-tool',
                    type: 'tool',
                    source: 'catalog',
                    provider: 'github',
                    sdkVersion: '0.0.0',
                    location: { js: 'test-tool.cjs', ts: 'test-tool.ts' }
                }
            };
        }

        it('uses the selected integration when connection IDs are reused', async () => {
            const fn = scopedCatalogFunction();
            lookup.mockResolvedValue(Ok(fn));
            const otherConnection = { ...connection, id: 4, config_id: 10, provider_config_key: 'other-github' };
            searchConnections.mockImplementation((_db, { filter }) =>
                Promise.resolve(
                    Ok([connection, otherConnection].filter((candidate) => !filter.integrationId || candidate.provider_config_key === filter.integrationId))
                )
            );

            const result = await invoke(fn, 'wait', { modelId: 'owner/model' }, connection.provider_config_key);

            expect(result.result.isOk()).toBe(true);
            expect(searchConnections).toHaveBeenCalledWith(expect.anything(), {
                environmentId: 2,
                filter: { connectionId: connection.connection_id, provider: 'github', integrationId: connection.provider_config_key },
                limit: 2
            });
            expect(schedule).toHaveBeenCalledWith(expect.objectContaining({ connection }));
        });

        it('does not use a connection from another integration', async () => {
            const fn = scopedCatalogFunction();
            lookup.mockResolvedValue(Ok(fn));
            searchConnections.mockImplementation((_db, { filter }) =>
                Promise.resolve(Ok([connection].filter((candidate) => !filter.integrationId || candidate.provider_config_key === filter.integrationId)))
            );

            const result = await invoke(fn, 'wait', { modelId: 'owner/model' }, 'other-github');

            if (result.result.isOk()) throw new Error('Expected an error');
            expect(result.result.error.code).toBe('connection_not_found');
            expect(schedule).not.toHaveBeenCalled();
            expect(createLog).not.toHaveBeenCalled();
        });
    });

    it('invokes a deployed function', async () => {
        const fn = deployedFunction();
        lookup.mockResolvedValue(Ok(fn));

        expect((await invoke(fn)).result.isOk()).toBe(true);
        expect(getConnection).toHaveBeenCalledWith('connection-1', 'custom-github', 2);
        expect(searchConnections).not.toHaveBeenCalled();
        expect(createLog.mock.calls[0]?.[1].syncConfig).toEqual({ id: 42, name: fn.name });
    });

    for (const kind of ['catalog', 'deployed'] as const) {
        it.skipIf(kind === 'catalog')(`schedules async invocation: ${kind}`, async () => {
            const fn = kind === 'catalog' ? catalogFunction() : deployedFunction();
            lookup.mockResolvedValue(Ok(fn));
            schedule.mockResolvedValue(Ok({ id: 'invocation-1', statusUrl: '/status' }));

            expect((await invoke(fn, 'no_wait')).result.unwrap()).toEqual({ id: 'invocation-1', statusUrl: '/status' });
            expect(schedule.mock.calls[0]?.[0].async).toBe(true);
            expect(logCtx.success).not.toHaveBeenCalled();
        });
    }

    it.skip('uses trigger rules for catalog functions', async () => {
        const fn = catalogFunction();
        fn.definition = { ...fn.definition, trigger: { kind: 'schedule', frequency: 'every hour' }, input_schema_ref: null };
        lookup.mockResolvedValue(Ok(fn));

        expect((await invoke(fn, 'wait')).result.isErr()).toBe(true);
        expect(
            (
                await invokeFunction({
                    account: { id: 1 } as DBTeam,
                    environment: { id: 2 } as DBEnvironment,
                    connectionId: 'connection-1',
                    functionUuid: fn.uuid,
                    request: { method: 'POST', path: '/test', headers: {}, query: {} },
                    invocationType: 'no_wait',
                    orchestrator: { invokeFunction: schedule } as unknown as Orchestrator
                })
            ).result.isOk()
        ).toBe(true);
        expect(schedule.mock.calls[0]?.[0].trigger.kind).toBe('schedule');
    });

    it('rejects invalid input', async () => {
        const result = await invoke(deployedFunction(), 'wait', { modelId: 42 });

        expect(result.result.isErr()).toBe(true);
        if (result.result.isErr()) expect(result.result.error.code).toBe('validation_error');
        expect(schedule).not.toHaveBeenCalled();
        expect(createLog).not.toHaveBeenCalled();
    });

    it('rejects a disabled function', async () => {
        const fn = { ...deployedFunction(), enabled: false };
        lookup.mockResolvedValue(Ok(fn));
        const result = await invoke(fn);

        if (result.result.isOk()) throw new Error('Expected an error');
        expect(result.result.error.code).toBe('function_disabled');
        expect(getConnection).not.toHaveBeenCalled();
        expect(schedule).not.toHaveBeenCalled();
    });

    it('returns function not found', async () => {
        lookup.mockResolvedValue(Ok(undefined));
        const result = await invoke();

        if (result.result.isOk()) throw new Error('Expected an error');
        expect(result.result.error.code).toBe('function_not_found');
    });

    it('returns a lookup error', async () => {
        lookup.mockResolvedValue(Err(new Error('lookup failed')));
        const result = await invoke();

        if (result.result.isOk()) throw new Error('Expected an error');
        expect(result.result.error.code).toBe('server_error');
    });

    it('returns an execution error', async () => {
        schedule.mockResolvedValue(Err(new NangoError('function_failure', { error: 'execution failed' })));
        const result = await invoke();

        if (result.result.isOk()) throw new Error('Expected an error');
        expect(result.result.error.code).toBe('function_failed');
        expect(logCtx.failed).toHaveBeenCalledOnce();
    });
});

describe('invokeFunction with an inline function', () => {
    beforeEach(() => {
        lookup.mockResolvedValue(Ok(inlineFunction()));
        vi.spyOn(configService, 'getIntegrationSummary').mockResolvedValue({ provider: 'github', display_name: null });
    });

    it('runs it on the connection of the given integration, with no input and no concurrency limit', async () => {
        const { result } = await invokeFunction({
            account: { id: 1 } as DBTeam,
            environment: { id: 2, name: 'dev' } as DBEnvironment,
            connectionId: connection.connection_id,
            integrationId: 'custom-github',
            functionUuid: inlineFunction().uuid,
            input: undefined,
            request: { method: 'POST', path: '/test', headers: {}, query: {} },
            invocationType: 'wait',
            orchestrator: { invokeFunction: schedule } as unknown as Orchestrator
        });

        expect(result.unwrap()).toEqual({ data: { title: 'Issue' } });
        expect(searchConnections).toHaveBeenCalledWith(expect.anything(), {
            environmentId: 2,
            filter: { connectionId: 'connection-1', integrationId: 'custom-github' },
            limit: 2
        });
        expect(schedule).toHaveBeenCalledWith(
            expect.objectContaining({
                functionUuid: inlineFunction().uuid,
                trigger: expect.objectContaining({ kind: 'http', input: null }),
                maxConcurrency: 0
            })
        );
    });

    it('rejects input', async () => {
        const { result } = await invoke(inlineFunction(), 'wait', { value: 1 }, 'custom-github');

        expect(result.isErr() && result.error.code).toBe('validation_error');
        expect(schedule).not.toHaveBeenCalled();
    });
});

describe('resolveFunctionConnection', () => {
    it.skip('returns connection not found', async () => {
        searchConnections.mockResolvedValue(Ok([]));
        const result = await resolveFunctionConnection({ fn: catalogFunction(), environmentId: 2, connectionId: 'connection-1' });

        if (result.isOk()) throw new Error('Expected an error');
        expect(result.error.code).toBe('connection_not_found');
    });

    it.skip('rejects an ambiguous connection', async () => {
        searchConnections.mockResolvedValue(Ok([connection, { ...connection, config_id: 10, provider_config_key: 'another-github' }]));
        const result = await resolveFunctionConnection({ fn: catalogFunction(), environmentId: 2, connectionId: 'connection-1' });

        if (result.isOk()) throw new Error('Expected an error');
        expect(result.error.code).toBe('invalid_invocation');
    });

    it.skip('returns a connection error', async () => {
        searchConnections.mockResolvedValue(Err(new Error('connection lookup failed')));
        const result = await resolveFunctionConnection({ fn: catalogFunction(), environmentId: 2, connectionId: 'connection-1' });

        if (result.isOk()) throw new Error('Expected an error');
        expect(result.error.code).toBe('server_error');
    });
});
