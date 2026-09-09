import { afterEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import * as actionService from '../../../services/action.service.js';
import { ActionExecutionError } from '../../../services/action.service.js';
import { InternalMcpError, PublicMcpError } from '../utils.js';
import { triggerActionTool } from './trigger.js';

import type { ManagementMcpContext } from '../managementTool.js';

describe('triggerActionTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns the synchronous action response exactly', async () => {
        const response = { issue_id: 'issue-123', created: true };
        const executeSpy = vi.spyOn(actionService, 'executeAction').mockResolvedValue({ logCtx: undefined, result: Ok({ data: response }) });

        const result = await triggerActionTool.handler(
            {
                action_name: 'create-issue',
                input: { title: 'MCP support' },
                integration_id: 'github',
                connection_id: 'connection-id'
            },
            context
        );

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({ data: response });
        }
        expect(executeSpy).toHaveBeenCalledOnce();
        expect(executeSpy.mock.calls[0]?.[0]).toMatchObject({
            account: context.account,
            environment: context.environment,
            connectionId: 'connection-id',
            providerConfigKey: 'github',
            actionName: 'create-issue',
            input: { title: 'MCP support' },
            isAsync: false,
            retryMax: 0
        });
        expect(executeSpy.mock.calls[0]?.[0].span).toBeDefined();
    });

    it('wraps a string action response in the data field', async () => {
        vi.spyOn(actionService, 'executeAction').mockResolvedValue({ logCtx: undefined, result: Ok({ data: 'created' }) });

        const result = await triggerActionTool.handler(validArguments, context);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({ data: 'created' });
        }
    });

    it('allows actions to be triggered without input', async () => {
        const executeSpy = vi.spyOn(actionService, 'executeAction').mockResolvedValue({ logCtx: undefined, result: Ok({ data: null }) });

        const result = await triggerActionTool.handler(
            {
                action_name: 'refresh-cache',
                integration_id: 'github',
                connection_id: 'connection-id'
            },
            context
        );

        expect(result.isOk()).toBe(true);
        expect(executeSpy.mock.calls[0]?.[0]).toMatchObject({ input: undefined });
    });

    it('rejects action responses that are not JSON values', async () => {
        vi.spyOn(actionService, 'executeAction').mockResolvedValue({ logCtx: undefined, result: Ok({ data: undefined }) });

        const result = await triggerActionTool.handler(validArguments, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(InternalMcpError);
        }
    });

    it.each([
        { name: 'missing action name', args: { input: {}, integration_id: 'github', connection_id: 'connection-id' } },
        { name: 'missing integration ID', args: { action_name: 'create-issue', input: {}, connection_id: 'connection-id' } },
        { name: 'missing connection ID', args: { action_name: 'create-issue', input: {}, integration_id: 'github' } },
        {
            name: 'asynchronous execution',
            args: { action_name: 'create-issue', input: {}, integration_id: 'github', connection_id: 'connection-id', async: true }
        },
        {
            name: 'maximum retries',
            args: { action_name: 'create-issue', input: {}, integration_id: 'github', connection_id: 'connection-id', max_retries: 1 }
        }
    ])('rejects $name before executing the action', async ({ args }) => {
        const executeSpy = vi.spyOn(actionService, 'executeAction');

        const result = await triggerActionTool.handler(args, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Invalid actions_trigger arguments:');
        }
        expect(executeSpy).not.toHaveBeenCalled();
    });

    it('returns expected action execution errors as public MCP errors', async () => {
        vi.spyOn(actionService, 'executeAction').mockResolvedValue({
            logCtx: undefined,
            result: Err(new ActionExecutionError({ code: 'unknown_action', message: 'Action not found' }))
        });

        const result = await triggerActionTool.handler(validArguments, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toBe('Action not found');
        }
    });

    it('maps internal action execution failures to internal MCP errors', async () => {
        vi.spyOn(actionService, 'executeAction').mockResolvedValue({
            logCtx: undefined,
            result: Err(new ActionExecutionError({ code: 'internal_error', message: 'sensitive action failure' }))
        });

        const result = await triggerActionTool.handler(validArguments, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(InternalMcpError);
            expect(result.error.message).toBe('Internal error');
        }
    });
});

const validArguments = {
    action_name: 'create-issue',
    input: { title: 'MCP support' },
    integration_id: 'github',
    connection_id: 'connection-id'
};

const context = {
    account: { id: 1 },
    environment: { id: 42 },
    plan: null,
    grantedScopes: ['environment:actions:execute']
} as ManagementMcpContext;
