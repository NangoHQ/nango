import { Readable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import proxyService, { ProxyServiceError } from '../../../../services/proxy.service.js';
import { egressTelemetryRecorder } from '../../../../utils/egressTelemetry.js';
import { buildSessionTools } from '../sessionServer.js';
import { proxyTool } from './proxy.js';

import type { ProxyServiceResponse } from '../../../../services/proxy.service.js';
import type { AgentSessionMcpContext } from '../sessionTool.js';
import type { AgentSession, AgentSessionCompiledToolset, AgentSessionResolvedConnections, DBEnvironment, DBTeam } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const TOOLSET: AgentSessionCompiledToolset = {
    notion: {
        provider: 'notion',
        pinned: [{ name: 'read_doc', description: 'read a doc' }],
        searchable: []
    },
    // In the toolset but with no connection resolved for it.
    slack: { provider: 'slack', pinned: [], searchable: [] }
};

const CONNECTIONS: AgentSessionResolvedConnections = {
    notion: { integrationId: 'notion', provider: 'notion', connectionId: 'notion-acme', internalConnectionId: 10, configId: 20 }
};

function context(): AgentSessionMcpContext {
    const session: AgentSession = {
        id: 'session-1',
        environmentId: 1,
        accountId: 1,
        resolvedConnections: CONNECTIONS,
        compiledToolset: TOOLSET,
        metaTools: { nangoToolSearch: true, nangoExecute: true, nangoProxy: true },
        expiresAt: new Date(),
        endedAt: null,
        endedReason: null,
        createdAt: new Date(),
        updatedAt: new Date()
    };

    return {
        account: { id: 1 } as DBTeam,
        environment: { id: 42, name: 'dev' } as DBEnvironment,
        plan: null,
        session,
        callable: buildSessionTools(session).callable
    };
}

function jsonResponse(body: unknown, status = 200): ProxyServiceResponse {
    return {
        outcome: 'success',
        status,
        headers: { 'content-type': 'application/json' },
        body: Readable.from([Buffer.from(JSON.stringify(body))]),
        complete: vi.fn().mockResolvedValue(undefined)
    } as unknown as ProxyServiceResponse;
}

async function callProxy(args: Record<string, unknown>) {
    return await proxyTool.handler(args, context());
}

function errorOf(result: Result<unknown>): Error {
    if (result.isOk()) {
        expect.fail(`Expected an error, got ${JSON.stringify(result.value)}`);
    }
    return result.error;
}

describe('proxyTool', () => {
    beforeEach(() => {
        vi.spyOn(egressTelemetryRecorder, 'record').mockImplementation(vi.fn());
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('proxies on the connection the session resolved, which the agent never passes', async () => {
        const request = vi.spyOn(proxyService, 'request').mockResolvedValue({ result: Ok(jsonResponse({ ok: true })) });

        const result = await callProxy({ integration: 'notion', method: 'GET', path: '/v1/pages/1' });

        expect(result.unwrap()).toStrictEqual({ status: 200, headers: { 'content-type': 'application/json' }, body: { ok: true } });
        expect(request).toHaveBeenCalledWith(
            expect.objectContaining({
                integrationId: 'notion',
                connectionId: 'notion-acme',
                method: 'GET',
                endpoint: '/v1/pages/1'
            })
        );
    });

    it('appends query parameters and sends a JSON body', async () => {
        const request = vi.spyOn(proxyService, 'request').mockResolvedValue({ result: Ok(jsonResponse({ ok: true })) });

        await callProxy({
            integration: 'notion',
            method: 'POST',
            path: '/v1/search',
            query_params: { page: 2, filter: ['a', 'b'] },
            body: { query: 'roadmap' }
        });

        expect(request).toHaveBeenCalledWith(
            expect.objectContaining({
                endpoint: '/v1/search?page=2&filter=a&filter=b',
                body: { query: 'roadmap' },
                headers: { 'content-type': 'application/json' }
            })
        );
    });

    it('rejects an integration the session does not have', async () => {
        const request = vi.spyOn(proxyService, 'request');

        const result = await callProxy({ integration: 'github', method: 'GET', path: '/user' });

        expect(errorOf(result).message).toBe("Integration 'github' is not one of this session's integrations.");
        expect(request).not.toHaveBeenCalled();
    });

    it('rejects an integration the session resolved no connection for', async () => {
        const request = vi.spyOn(proxyService, 'request');

        const result = await callProxy({ integration: 'slack', method: 'GET', path: '/api/auth.test' });

        expect(errorOf(result).message).toBe("Integration 'slack' has no connection in this session.");
        expect(request).not.toHaveBeenCalled();
    });

    it('surfaces a proxy failure to the agent', async () => {
        vi.spyOn(proxyService, 'request').mockResolvedValue({
            result: Err(new ProxyServiceError({ code: 'connection_not_found', message: 'Connection not found', status: 404 }))
        });

        expect(errorOf(await callProxy({ integration: 'notion', method: 'GET', path: '/v1/pages/1' })).message).toBe('Connection not found');
    });

    it('rejects a path that is not rooted, and one carrying a fragment', async () => {
        expect(errorOf(await callProxy({ integration: 'notion', method: 'GET', path: 'v1/pages' })).message).toContain('nango_proxy');
        expect(errorOf(await callProxy({ integration: 'notion', method: 'GET', path: '/v1/pages#frag' })).message).toContain('nango_proxy');
    });

    it('is enabled only when the session turned the meta tool on', () => {
        expect(proxyTool.isEnabled({ nangoToolSearch: true, nangoExecute: true, nangoProxy: true })).toBe(true);
        expect(proxyTool.isEnabled({ nangoToolSearch: true, nangoExecute: true, nangoProxy: false })).toBe(false);
    });
});
