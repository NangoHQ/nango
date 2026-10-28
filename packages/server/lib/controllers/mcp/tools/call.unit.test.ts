import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configService, NangoError, toolService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import * as actionService from '../../../services/action.service.js';
import { ActionExecutionError } from '../../../services/action.service.js';
import { InternalMcpError, PublicMcpError } from '../utils.js';
import { callToolsTool } from './call.js';

import type { ManagementMcpContext } from '../managementTool.js';
import type * as NangoShared from '@nangohq/shared';
import type { Config, functionConfigService, FunctionInvokeError } from '@nangohq/shared';
import type { DBSyncConfig, FunctionInvocationErrorCode } from '@nangohq/types';

const mocks = vi.hoisted(() => ({ invokeFunction: vi.fn() }));

vi.mock('@nangohq/shared', async (importOriginal) => {
    const actual = await importOriginal<typeof NangoShared>();
    return { ...actual, invokeFunction: mocks.invokeFunction };
});
vi.mock('../../../utils/utils.js', () => ({ getOrchestrator: () => orchestrator }));

describe('callToolsTool', () => {
    beforeEach(() => {
        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(integration);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        mocks.invokeFunction.mockReset();
    });

    it('invokes a tool function and returns its result', async () => {
        vi.spyOn(toolService, 'resolveTool').mockResolvedValue(Ok({ kind: 'function', fn: functionFixture }));
        mocks.invokeFunction.mockResolvedValue(Ok({ data: { title: 'MCP support' } }));
        const executeSpy = vi.spyOn(actionService, 'executeAction');

        const result = await callToolsTool.handler(validArguments, context);

        expect(toolService.resolveTool).toHaveBeenCalledWith({ accountUuid, environmentId: 42, integration, name: 'fetchIssue' });
        expect(mocks.invokeFunction).toHaveBeenCalledWith({
            account: context.account,
            environment: context.environment,
            connectionId: 'connection-id',
            functionUuid: functionFixture.config.uuid,
            input: { id: '1' },
            request: { method: 'POST', path: '/mcp', headers: {}, query: {} },
            invocationType: 'wait',
            orchestrator
        });
        expect(executeSpy).not.toHaveBeenCalled();
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({ data: { title: 'MCP support' } });
        }
    });

    it('returns an internal error when the function invocation is asynchronous', async () => {
        vi.spyOn(toolService, 'resolveTool').mockResolvedValue(Ok({ kind: 'function', fn: functionFixture }));
        mocks.invokeFunction.mockResolvedValue(Ok({ id: 'invocation-id', statusUrl: '/status' }));

        const result = await callToolsTool.handler(validArguments, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(InternalMcpError);
        }
    });

    it.each<{ code: FunctionInvocationErrorCode; cause?: unknown; expected: typeof PublicMcpError | typeof InternalMcpError }>([
        { code: 'connection_not_found', expected: PublicMcpError },
        { code: 'function_not_found', expected: PublicMcpError },
        { code: 'function_disabled', expected: PublicMcpError },
        { code: 'invalid_invocation', expected: PublicMcpError },
        { code: 'validation_error', expected: PublicMcpError },
        { code: 'function_failed', cause: new NangoError('function_execution_failure'), expected: PublicMcpError },
        { code: 'function_failed', cause: new NangoError('function_failure'), expected: PublicMcpError },
        { code: 'function_failed', cause: new Error('boom'), expected: PublicMcpError },
        { code: 'server_error', expected: InternalMcpError }
    ])('maps function invocation error $code to $expected.name', async ({ code, cause, expected }) => {
        vi.spyOn(toolService, 'resolveTool').mockResolvedValue(Ok({ kind: 'function', fn: functionFixture }));
        mocks.invokeFunction.mockResolvedValue(Err(functionInvokeError(code, cause)));

        const result = await callToolsTool.handler(validArguments, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(expected);
        }
    });

    it('includes validation errors in the public error message', async () => {
        vi.spyOn(toolService, 'resolveTool').mockResolvedValue(Ok({ kind: 'function', fn: functionFixture }));
        mocks.invokeFunction.mockResolvedValue(Err(functionInvokeError('validation_error', undefined, [{ path: '/id', message: 'must be string' }])));

        const result = await callToolsTool.handler(validArguments, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('validation_error: [{"path":"/id","message":"must be string"}]');
        }
    });

    it('falls back to executing the action', async () => {
        vi.spyOn(toolService, 'resolveTool').mockResolvedValue(Ok({ kind: 'deployed', config: actionFixture }));
        const executeSpy = vi.spyOn(actionService, 'executeAction').mockResolvedValue({ logCtx: undefined, result: Ok({ data: 'created' }) });

        const result = await callToolsTool.handler(validArguments, context);

        expect(mocks.invokeFunction).not.toHaveBeenCalled();
        expect(executeSpy.mock.calls[0]?.[0]).toMatchObject({
            account: context.account,
            environment: context.environment,
            connectionId: 'connection-id',
            providerConfigKey: 'github',
            actionName: 'fetchIssue',
            input: { id: '1' },
            isAsync: false,
            retryMax: 0
        });
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({ data: 'created' });
        }
    });

    it('returns action execution errors', async () => {
        vi.spyOn(toolService, 'resolveTool').mockResolvedValue(Ok({ kind: 'deployed', config: actionFixture }));
        vi.spyOn(actionService, 'executeAction').mockResolvedValue({
            logCtx: undefined,
            result: Err(new ActionExecutionError({ code: 'action_failed', message: 'Action failed' }))
        });

        const result = await callToolsTool.handler(validArguments, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toBe('Action failed');
        }
    });

    it('returns an internal error when the action response is not a JSON value', async () => {
        vi.spyOn(toolService, 'resolveTool').mockResolvedValue(Ok({ kind: 'deployed', config: actionFixture }));
        vi.spyOn(actionService, 'executeAction').mockResolvedValue({ logCtx: undefined, result: Ok({ data: undefined }) });

        const result = await callToolsTool.handler(validArguments, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(InternalMcpError);
        }
    });

    it('returns an error when the tool does not exist', async () => {
        vi.spyOn(toolService, 'resolveTool').mockResolvedValue(Ok({ kind: 'missing' }));

        const result = await callToolsTool.handler(validArguments, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toBe("Tool 'fetchIssue' for integration 'github' was not found");
        }
        expect(mocks.invokeFunction).not.toHaveBeenCalled();
    });

    it('returns an error when the integration does not exist', async () => {
        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(null);
        const resolve = vi.spyOn(toolService, 'resolveTool');

        const result = await callToolsTool.handler(validArguments, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toBe("Tool 'fetchIssue' for integration 'github' was not found");
        }
        expect(resolve).not.toHaveBeenCalled();
    });

    it('returns an internal error when the tool cannot be resolved', async () => {
        vi.spyOn(toolService, 'resolveTool').mockResolvedValue(Err(new Error('failed_to_resolve_tool')));

        const result = await callToolsTool.handler(validArguments, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(InternalMcpError);
        }
    });

    it.each([
        { name: 'missing name', args: { integration_id: 'github', connection_id: 'connection-id' } },
        { name: 'missing integration ID', args: { name: 'fetchIssue', connection_id: 'connection-id' } },
        { name: 'missing connection ID', args: { integration_id: 'github', name: 'fetchIssue' } },
        { name: 'unknown argument', args: { ...validArguments, unexpected: true } },
        { name: 'invalid name', args: { ...validArguments, name: 'not a name' } },
        { name: 'invalid integration ID', args: { ...validArguments, integration_id: 'github#' } }
    ])('rejects $name', async ({ args }) => {
        const resolve = vi.spyOn(toolService, 'resolveTool');

        const result = await callToolsTool.handler(args, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Invalid tools_call arguments:');
        }
        expect(resolve).not.toHaveBeenCalled();
    });
});

function functionInvokeError(code: FunctionInvocationErrorCode, cause?: unknown, errors: unknown[] = []): FunctionInvokeError {
    return Object.assign(new Error(code, { cause }), { code, errors }) as unknown as FunctionInvokeError;
}

const orchestrator = { name: 'orchestrator' };

const accountUuid = '8d49e079-aa61-44ae-b0cf-823662523527';

const integration = { id: 1, unique_key: 'github', provider: 'github' } as Config;

const validArguments = { integration_id: 'github', connection_id: 'connection-id', name: 'fetchIssue', input: { id: '1' } };

const context = {
    account: { id: 1, uuid: accountUuid },
    environment: { id: 42 },
    plan: null,
    grantedScopes: ['environment:functions:invocations', 'environment:actions:execute']
} as ManagementMcpContext;

const actionFixture = { sync_name: 'fetchIssue', enabled: true } as DBSyncConfig;

const functionFixture = {
    config: { uuid: '11111111-1111-4111-8111-111111111111', name: 'fetchIssue', enabled: true },
    integration: { id: 1, unique_key: 'github', provider: 'github' }
} as functionConfigService.CurrentFunctionConfig;
