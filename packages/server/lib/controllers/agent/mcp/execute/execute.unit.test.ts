import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { ActionExecutionError } from '../../../../services/action.service.js';
import { InternalMcpError, PublicMcpError } from '../../../mcp/utils.js';
import { buildSessionTools } from '../sessionServer.js';
import { executeInputSchema } from './schema.js';

import type * as actionService from '../../../../services/action.service.js';
import type { AgentSessionMcpContext } from '../sessionTool.js';
import type { AgentSession, AgentSessionCompiledToolset, AgentSessionResolvedConnections, DBEnvironment, DBTeam } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const executeAction = vi.fn();
vi.mock('../../../../services/action.service.js', async (importOriginal) => ({
    ...(await importOriginal<typeof actionService>()),
    executeAction: (...args: unknown[]) => executeAction(...args)
}));

const { executeSessionTool, executeTool } = await import('./execute.js');

const TOOLSET: AgentSessionCompiledToolset = {
    notion: {
        provider: 'notion',
        pinned: [{ name: 'read_doc', description: 'read a doc' }],
        searchable: [{ name: 'upsert_doc', description: 'upsert a doc' }]
    }
};

const CONNECTIONS: AgentSessionResolvedConnections = {
    notion: { integrationId: 'notion', provider: 'notion', connectionId: 'notion-acme', internalConnectionId: 10, configId: 20 }
};

function context({
    compiledToolset = TOOLSET,
    resolvedConnections = CONNECTIONS
}: {
    compiledToolset?: AgentSessionCompiledToolset;
    resolvedConnections?: AgentSessionResolvedConnections;
} = {}): AgentSessionMcpContext {
    const session: AgentSession = {
        id: 'session-1',
        environmentId: 1,
        accountId: 1,
        resolvedConnections,
        compiledToolset,
        metaTools: { nangoToolSearch: true, nangoExecute: true },
        expiresAt: new Date(),
        endedAt: null,
        endedReason: null,
        createdAt: new Date(),
        updatedAt: new Date()
    };

    return { account: { id: 1 } as DBTeam, environment: { id: 1 } as DBEnvironment, session, callable: buildSessionTools(session).callable };
}

async function execute(toolName: string, args: Partial<Parameters<typeof executeSessionTool>[0]> = {}) {
    return await executeSessionTool({ integrationId: 'notion', toolName, context: context(), ...args });
}

function errorOf(result: Result<unknown>): Error {
    if (result.isOk()) {
        expect.fail(`Expected an error, got ${JSON.stringify(result.value)}`);
    }
    return result.error;
}

describe('executeSessionTool', () => {
    beforeEach(() => {
        executeAction.mockReset().mockResolvedValue({ logCtx: undefined, result: Ok({ data: { ok: true } }) });
    });

    it('runs a pinned tool on the connection the session resolved', async () => {
        const result = await execute('read_doc', { input: { id: '1' } });

        expect(result.unwrap()).toStrictEqual({ ok: true });
        expect(executeAction).toHaveBeenCalledWith(
            expect.objectContaining({
                connectionId: 'notion-acme',
                providerConfigKey: 'notion',
                actionName: 'read_doc',
                input: { id: '1' },
                isAsync: false
            })
        );
    });

    it('runs a searchable tool, which is callable without being listed', async () => {
        const result = await execute('upsert_doc');

        expect(result.isOk()).toBe(true);
        expect(executeAction).toHaveBeenCalledWith(expect.objectContaining({ actionName: 'upsert_doc' }));
    });

    // A tool's input is validated against its own deployed schema, and 34 template actions have a
    // non-object root: anrok's transaction actions take an array, others a oneOf or a bare null.
    it.each([[[{ id: '1' }]], ['a string'], [null], [42], [false], [0], ['']])('passes a non-object input through as %j', async (input) => {
        const parsed = executeInputSchema.safeParse({ tool: 'notion__read_doc', input });

        expect(parsed.success).toBe(true);

        await execute('read_doc', { input });
        expect(executeAction).toHaveBeenCalledWith(expect.objectContaining({ input }));
    });

    it('sends no input when the caller omits it', async () => {
        await execute('read_doc');

        expect(executeAction).toHaveBeenCalledWith(expect.objectContaining({ input: undefined }));
    });

    it('refuses a tool that is not in the session toolset', async () => {
        const result = await execute('delete_doc');

        expect(result.isErr()).toBe(true);
        expect(errorOf(result)).toBeInstanceOf(PublicMcpError);
        expect(errorOf(result).message).toBe("Tool 'delete_doc' is not in this session's toolset for integration 'notion'.");
        expect(executeAction).not.toHaveBeenCalled();
    });

    it('refuses an integration the session does not have', async () => {
        const result = await execute('read_doc', { integrationId: 'slack' });

        expect(errorOf(result).message).toBe("Integration 'slack' is not one of this session's integrations.");
        expect(executeAction).not.toHaveBeenCalled();
    });

    it.each(['constructor', 'toString', '__proto__'])('refuses %s as an integration id', async (integrationId) => {
        const result = await execute('read_doc', { integrationId });

        expect(errorOf(result)).toBeInstanceOf(PublicMcpError);
        expect(errorOf(result).message).toBe(`Integration '${integrationId}' is not one of this session's integrations.`);
        expect(executeAction).not.toHaveBeenCalled();
    });

    it('never runs on a connection the caller chose', async () => {
        await execute('read_doc', { input: { connection_id: 'someone-elses' } });

        expect(executeAction).toHaveBeenCalledWith(expect.objectContaining({ connectionId: 'notion-acme' }));
    });

    it('refuses a tool on an integration the tenant has no connection for', async () => {
        const result = await execute('read_doc', { context: context({ resolvedConnections: {} }) });

        expect(errorOf(result)).toBeInstanceOf(PublicMcpError);
        expect(errorOf(result).message).toBe("Integration 'notion' has no connection in this session.");
        expect(executeAction).not.toHaveBeenCalled();
    });

    it('tells the agent which tool failed and why', async () => {
        executeAction.mockResolvedValue({
            logCtx: undefined,
            result: Err(new ActionExecutionError({ code: 'unknown_action', message: 'Action not found' }))
        });

        const result = await execute('read_doc');

        expect(errorOf(result)).toBeInstanceOf(PublicMcpError);
        expect(errorOf(result).message).toBe("Tool 'read_doc' is no longer deployed on integration 'notion'.");
    });

    it("passes the action's own failure back to the agent", async () => {
        executeAction.mockResolvedValue({
            logCtx: undefined,
            result: Err(new ActionExecutionError({ code: 'action_failed', message: 'wrapped', nangoError: { message: 'the doc is locked' } as never }))
        });

        const result = await execute('read_doc');

        expect(errorOf(result).message).toBe('the doc is locked');
    });

    it('hides an internal failure from the agent', async () => {
        executeAction.mockResolvedValue({
            logCtx: undefined,
            result: Err(new ActionExecutionError({ code: 'internal_error', message: 'Failed to run action' }))
        });

        const result = await execute('read_doc');

        expect(errorOf(result)).toBeInstanceOf(InternalMcpError);
        expect(errorOf(result).message).toBe('Internal error');
    });
});

describe('nango_execute', () => {
    beforeEach(() => {
        executeAction.mockReset().mockResolvedValue({ logCtx: undefined, result: Ok({ data: { ok: true } }) });
    });

    it('addresses a tool by the one name, and never by integration plus action', async () => {
        const result = await executeTool.handler({ tool: 'notion__read_doc', input: { id: '1' } }, context());

        expect(result.isOk()).toBe(true);
        expect(executeAction).toHaveBeenCalledWith(expect.objectContaining({ providerConfigKey: 'notion', actionName: 'read_doc', input: { id: '1' } }));
    });

    it('reaches a searchable tool, which no listing ever named', async () => {
        const result = await executeTool.handler({ tool: 'notion__upsert_doc' }, context());

        expect(result.isOk()).toBe(true);
        expect(executeAction).toHaveBeenCalledWith(expect.objectContaining({ actionName: 'upsert_doc' }));
    });

    it('rejects the old integration plus tool shape rather than silently ignoring it', async () => {
        const result = await executeTool.handler({ integration: 'notion', tool: 'read_doc' }, context());

        expect(errorOf(result).message).toContain('Invalid nango_execute arguments');
        expect(executeAction).not.toHaveBeenCalled();
    });

    // A name carries no integration to fall back on, so the message has to point somewhere.
    it('points an unknown name at tool search when the session has it', async () => {
        const result = await executeTool.handler({ tool: 'notion__delete_doc' }, context());

        expect(errorOf(result)).toBeInstanceOf(PublicMcpError);
        expect(errorOf(result).message).toBe(
            "Tool 'notion__delete_doc' is not one of this session's tools. Use nango_tool_search to find one, or call a tool by the name it is listed under."
        );
        expect(executeAction).not.toHaveBeenCalled();
    });

    it('does not point at tool search when the session turned it off', async () => {
        const withoutSearch = { ...context(), session: { ...context().session, metaTools: { nangoToolSearch: false, nangoExecute: true } } };

        const result = await executeTool.handler({ tool: 'notion__delete_doc' }, withoutSearch);

        expect(errorOf(result).message).toBe("Tool 'notion__delete_doc' is not one of this session's tools. Call a tool by the name it is listed under.");
    });
});
