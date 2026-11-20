import { beforeEach, describe, expect, it, vi } from 'vitest';

import { INLINE_FUNCTION_UUID, TaskFunction } from '@nangohq/nango-orchestrator';
import * as shared from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { slackService } from '../clients.js';
import { handleFunctionSuccess, startFunction } from './function.js';

import type { startScript as startScriptFn } from './operations/start.js';
import type { setTaskSuccess as setTaskSuccessFn } from './operations/state.js';
import type * as logs from '@nangohq/logs';
import type { Config, ResolvedFunction } from '@nangohq/shared';
import type { DBAPISecret, NangoProps, TelemetryBag } from '@nangohq/types';

const { startScript, setTaskSuccess, publish, logCtx } = vi.hoisted(() => ({
    startScript: vi.fn<typeof startScriptFn>(),
    setTaskSuccess: vi.fn<typeof setTaskSuccessFn>(),
    publish: vi.fn<(event: { type: string }) => void>(),
    logCtx: { id: 'log-1', attachSpan: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), failed: vi.fn(), success: vi.fn(), enrichOperation: vi.fn() }
}));

vi.mock('../clients.js', () => ({ bigQueryClient: { insert: vi.fn() }, slackService: { reportFailure: vi.fn(), removeFailingConnection: vi.fn() } }));
vi.mock('../env.js', () => ({ envs: { NANGO_LOG_FUNCTION_INPUT: false } }));
vi.mock('../utils/capping.js', () => ({ capping: { getStatus: vi.fn().mockResolvedValue({ isCapped: false }) } }));
vi.mock('../utils/flags.js', () => ({ getRunnerFlags: () => ({}) }));
vi.mock('../utils/pubsub.js', () => ({ pubsub: { publisher: { publish } } }));
vi.mock('./operations/start.js', () => ({ startScript }));
vi.mock('./operations/state.js', () => ({ setTaskSuccess, setTaskFailed: vi.fn() }));
vi.mock('@nangohq/logs', async (importOriginal) => ({
    ...(await importOriginal<typeof logs>()),
    logContextGetter: { get: () => logCtx },
    getFormattedOperation: () => ({}),
    OtlpSpan: class {}
}));

function catalogFunction(): Extract<ResolvedFunction, { kind: 'catalog' }> {
    const definition = shared.getCatalogFunctionByUuid(shared.generateCatalogFunctionUuid({ provider: 'replicate', name: 'get-model' }));
    if (!definition) throw new Error('Missing catalog fixture');
    return { kind: 'catalog', uuid: definition.uuid, name: definition.name, enabled: true, definition };
}

function deployedFunction(): Extract<ResolvedFunction, { kind: 'deployed' }> {
    const now = new Date('2026-01-01');
    return {
        kind: 'deployed',
        uuid: '22222222-2222-4222-8222-222222222222',
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
            input_schema_ref: null,
            output_schema_ref: null,
            model_schema_refs: [],
            metadata_schema_ref: null,
            checkpoint_schema_ref: null,
            json_schema: {},
            created_at: now,
            updated_at: now,
            deleted_at: null
        }
    };
}

function task(functionUuid = deployedFunction().uuid, input: Record<string, string | number> = { issueNumber: 1 }): TaskFunction {
    return TaskFunction({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'function-task',
        groupKey: 'function-group',
        groupMaxConcurrency: 1,
        state: 'STARTED',
        attempt: 1,
        attemptMax: 1,
        ownerKey: 'environment:2',
        retryKey: null,
        heartbeatTimeoutSecs: 60,
        activityLogId: 'log-1',
        functionUuid,
        connection: { id: 3, connection_id: 'connection-1', provider_config_key: 'custom-github', environment_id: 2 },
        trigger: {
            kind: 'http',
            input,
            request: { method: 'POST', path: '/test', headers: {}, query: {}, body: input },
            connection: { connectionId: 'connection-1', integrationId: 'custom-github' }
        },
        async: false
    });
}

function inlineTask(code: string): TaskFunction {
    return TaskFunction({ ...task(INLINE_FUNCTION_UUID), source: { kind: 'inline', code, description: 'Names of the open issues' } });
}

beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.spyOn(shared.accountService, 'getAccountContext').mockResolvedValue({
        account: { id: 1, name: 'test' },
        environment: { id: 2, name: 'dev' },
        plan: null
    } as Awaited<ReturnType<typeof shared.accountService.getAccountContext>>);
});

describe('startFunction', () => {
    beforeEach(() => {
        vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue({
            id: 9,
            unique_key: 'custom-github',
            provider: 'github',
            environment_id: 2
        } as Config);
        vi.spyOn(shared.functionLookupService, 'resolveFunctionByUuid').mockResolvedValue(Ok(deployedFunction()));
        vi.spyOn(shared, 'getEndUserByConnectionId').mockResolvedValue(Err(new shared.EndUserError({ code: 'not_found', message: 'no end user' })));
        vi.spyOn(shared.environmentService, 'getSdkLogger').mockResolvedValue({ level: 'off' });
        vi.spyOn(shared.secretService, 'getDefaultSecretForEnv').mockResolvedValue(Ok({ secret: 'secret' } as DBAPISecret));
        startScript.mockResolvedValue(Ok(undefined));
        setTaskSuccess.mockResolvedValue(Ok(task()));
    });

    it.skip('starts a catalog function', async () => {
        const fn = catalogFunction();
        vi.mocked(shared.functionLookupService.resolveFunctionByUuid).mockResolvedValue(Ok(fn));
        vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue({
            id: 9,
            unique_key: 'custom-github',
            provider: fn.definition.provider,
            environment_id: 2
        } as Config);
        const execution = task(fn.uuid, { modelId: 'owner/model' });
        const definition = fn.definition;

        expect((await startFunction(execution)).isOk()).toBe(true);
        expect(shared.functionLookupService.resolveFunctionByUuid).toHaveBeenCalledWith({ environmentId: 2, functionUuid: execution.functionUuid });
        const args = startScript.mock.calls[0]?.[0];
        if (!args) throw new Error('Missing script invocation');
        expect(args.arg).toEqual(execution.trigger);
        expect(args.nangoProps.scriptType).toBe('function');
        expect(args.nangoProps.syncConfig).toMatchObject({
            id: 0,
            nango_config_id: 9,
            source: 'catalog',
            version: definition.version,
            enabled: true,
            sdk_version: definition.sdkVersion,
            input: definition.input_schema_ref,
            file_location: definition.location.js
        });
    });

    it('preserves deployed configuration', async () => {
        const fn = deployedFunction();
        const now = fn.definition.created_at;
        vi.mocked(shared.functionLookupService.resolveFunctionByUuid).mockResolvedValue(Ok(fn));

        expect((await startFunction(task(fn.uuid))).isOk()).toBe(true);
        expect(startScript.mock.calls[0]?.[0].nangoProps.syncConfig).toMatchObject({
            id: 42,
            nango_config_id: 9,
            source: 'repo',
            file_location: fn.definition.file_location,
            sdk_version: null,
            created_at: now,
            updated_at: now
        });
    });

    it.skip('rejects a provider mismatch', async () => {
        const fn = catalogFunction();
        if (fn.kind !== 'catalog') throw new Error('Expected catalog function');
        fn.definition = { ...fn.definition, provider: 'gitlab' };
        vi.mocked(shared.functionLookupService.resolveFunctionByUuid).mockResolvedValue(Ok(fn));

        expect((await startFunction(task(fn.uuid))).isErr()).toBe(true);
        expect(startScript).not.toHaveBeenCalled();
    });

    it('rejects an integration mismatch', async () => {
        const fn = deployedFunction();
        fn.integration = { id: 10, unique_key: 'other-github', provider: 'github' };
        vi.mocked(shared.functionLookupService.resolveFunctionByUuid).mockResolvedValue(Ok(fn));

        expect((await startFunction(task(fn.uuid))).isErr()).toBe(true);
        expect(startScript).not.toHaveBeenCalled();
    });

    it('rejects a disabled function', async () => {
        vi.mocked(shared.functionLookupService.resolveFunctionByUuid).mockResolvedValue(Ok({ ...deployedFunction(), enabled: false }));

        expect((await startFunction(task())).isErr()).toBe(true);
        expect(startScript).not.toHaveBeenCalled();
    });

    it('returns function not found', async () => {
        vi.mocked(shared.functionLookupService.resolveFunctionByUuid).mockResolvedValue(Ok(undefined));

        expect((await startFunction(task())).isErr()).toBe(true);
        expect(startScript).not.toHaveBeenCalled();
    });

    it('starts an inline function without looking up a deployed one', async () => {
        const code = 'return record.issueNumber;';

        expect((await startFunction(inlineTask(code))).isOk()).toBe(true);
        expect(shared.functionLookupService.resolveFunctionByUuid).not.toHaveBeenCalled();
        const args = startScript.mock.calls[0]?.[0];
        if (!args) throw new Error('Missing script invocation');
        expect(args.code).toContain(code);
        expect(args.nangoProps.scriptType).toBe('function');
        expect(args.nangoProps.syncConfig).toMatchObject({ id: 0, sync_name: 'inline', nango_config_id: 9, file_location: '', source: 'standalone' });
        expect(logCtx.info).toHaveBeenCalledWith(
            "Starting function 'inline'",
            expect.objectContaining({ function: 'inline', source: 'inline', description: 'Names of the open issues' })
        );
    });

    it('rejects an inline source that does not parse', async () => {
        expect((await startFunction(inlineTask('return record.'))).isErr()).toBe(true);
        expect(startScript).not.toHaveBeenCalled();
    });

    it('reports the usage of a failed inline function without alerting on Slack', async () => {
        await startFunction(inlineTask('return record.'));

        expect(slackService.reportFailure).not.toHaveBeenCalled();
        expect(publish.mock.calls[0]?.[0].type).toBe('usage.function_executions');
    });

    it('alerts on Slack when a deployed function fails', async () => {
        vi.mocked(shared.functionLookupService.resolveFunctionByUuid).mockResolvedValue(Ok(undefined));

        await startFunction(task());

        expect(slackService.reportFailure).toHaveBeenCalledOnce();
    });

    it('returns a script error', async () => {
        startScript.mockResolvedValue(Err(new Error('script failed')));

        expect((await startFunction(task())).isErr()).toBe(true);
    });
});

describe('handleFunctionSuccess', () => {
    async function succeed(syncConfig: Partial<NangoProps['syncConfig']>) {
        const execution = task('22222222-2222-4222-8222-222222222222');
        setTaskSuccess.mockResolvedValue(Ok(execution));
        const nangoProps = {
            team: { id: 1, name: 'test' },
            environmentId: 2,
            environmentName: 'dev',
            provider: 'github',
            providerConfigKey: 'custom-github',
            nangoConnectionId: 3,
            connectionId: 'connection-1',
            activityLogId: 'log-1',
            startedAt: new Date(),
            syncConfig
        } as NangoProps;

        await handleFunctionSuccess({
            taskId: execution.id,
            nangoProps,
            output: { title: 'Issue' },
            telemetryBag: {} as TelemetryBag,
            functionRuntime: 'runner',
            checkpoints: { from: null, to: null }
        });
        return execution;
    }

    it('completes a function task', async () => {
        const execution = await succeed({ id: 42, sync_name: 'test', nango_config_id: 9, version: '1', source: 'repo' });

        expect(setTaskSuccess).toHaveBeenCalledWith({ taskId: execution.id, output: { title: 'Issue' } });
        expect(logCtx.success).toHaveBeenCalledOnce();
        expect(slackService.removeFailingConnection).toHaveBeenCalledOnce();
        expect(publish.mock.calls[0]?.[0].type).toBe('usage.function_executions');
    });

    it('leaves the Slack alert of the connection alone after an inline function', async () => {
        await succeed({ id: 0, sync_name: 'inline', nango_config_id: 9, version: '0.0.0', source: 'standalone', file_location: '' });

        expect(slackService.removeFailingConnection).not.toHaveBeenCalled();
    });
});
