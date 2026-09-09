import { Readable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import proxyService, { ProxyServiceError } from '../../../../services/proxy.service.js';
import { egressTelemetryRecorder } from '../../../../utils/egressTelemetry.js';
import { PublicMcpError } from '../../../mcp/utils.js';
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
    slack: { provider: 'slack', pinned: [], searchable: [] },
    // An API key provider, whose credential rides in x-api-key rather than authorization.
    autosana: { provider: 'autosana', pinned: [], searchable: [] }
};

const CONNECTIONS: AgentSessionResolvedConnections = {
    notion: { integrationId: 'notion', provider: 'notion', connectionId: 'notion-acme', internalConnectionId: 10, configId: 20 },
    autosana: { integrationId: 'autosana', provider: 'autosana', connectionId: 'autosana-acme', internalConnectionId: 11, configId: 21 }
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

function codeOf(result: Result<unknown>): string | undefined {
    const error = errorOf(result);
    return error instanceof PublicMcpError ? error.code : undefined;
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

    it('stamps the session as the actor of the proxy call', async () => {
        const request = vi.spyOn(proxyService, 'request').mockResolvedValue({ result: Ok(jsonResponse({ ok: true })) });

        await callProxy({ integration: 'notion', method: 'GET', path: '/v1/pages/1' });

        expect(request).toHaveBeenCalledWith(expect.objectContaining({ actor: { kind: 'session', id: 'session-1' } }));
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

        expect(errorOf(result).message).toBe("Integration 'github' is not one of this session's integrations. Use one this session has.");
        expect(codeOf(result)).toBe('unknown_integration');
        expect(request).not.toHaveBeenCalled();
    });

    it('rejects an integration the session resolved no connection for', async () => {
        const request = vi.spyOn(proxyService, 'request');

        const result = await callProxy({ integration: 'slack', method: 'GET', path: '/api/auth.test' });

        expect(errorOf(result).message).toBe(
            "Integration 'slack' has no connection in this session, so no request to it can be authenticated. Tell the user it is not connected."
        );
        expect(codeOf(result)).toBe('integration_not_connected');
        expect(request).not.toHaveBeenCalled();
    });

    it('surfaces a proxy failure to the agent', async () => {
        vi.spyOn(proxyService, 'request').mockResolvedValue({
            result: Err(new ProxyServiceError({ code: 'connection_not_found', message: 'Connection not found', status: 404 }))
        });

        const result = await callProxy({ integration: 'notion', method: 'GET', path: '/v1/pages/1' });

        expect(errorOf(result).message).toBe(
            "Connection not found. No request to 'notion' can be authenticated until then, so tell the user it needs to be reconnected."
        );
        expect(codeOf(result)).toBe('integration_not_connected');
    });

    it('tells the agent to wait when the provider itself refused the credential refresh', async () => {
        vi.spyOn(proxyService, 'request').mockResolvedValue({
            result: Err(
                new ProxyServiceError({
                    code: 'credentials_refresh_failed',
                    message:
                        "Failed to get connection credentials: 'The external API returned an error when trying to refresh the access token. Please try again later.'",
                    status: 400,
                    cause: new NangoError('refresh_token_external_error')
                })
            )
        });

        const result = await callProxy({ integration: 'notion', method: 'GET', path: '/v1/pages/1' });

        expect(codeOf(result)).toBe('temporarily_unavailable');
        expect(errorOf(result).message).toContain('Try the call again in a moment');
        expect(errorOf(result).message).not.toContain('reconnected');
    });

    it.each([
        { label: 'a path that is not rooted', method: 'GET', path: 'v1/pages', expected: 'must start with "/"' },
        { label: 'a path carrying a URL fragment', method: 'GET', path: '/v1/pages#frag', expected: 'URL fragments are not supported in proxy paths.' },
        { label: 'a method the proxy does not take', method: 'TRACE', path: '/v1/pages', expected: 'method' },
        { label: 'a connection the agent tried to choose', method: 'GET', path: '/v1/pages', expected: 'connection_id', extra: { connection_id: 'other' } }
    ])('rejects $label before reaching the proxy', async ({ method, path, expected, extra }) => {
        const request = vi.spyOn(proxyService, 'request');

        const result = await callProxy({ integration: 'notion', method, path, ...extra });

        expect(errorOf(result).message).toContain(expected);
        expect(codeOf(result)).toBe('invalid_input');
        expect(request).not.toHaveBeenCalled();
    });

    it.each(['authorization', 'Authorization', 'cookie', 'proxy-authorization'])('refuses to forward the %s credential header', async (header) => {
        const request = vi.spyOn(proxyService, 'request');

        const result = await callProxy({ integration: 'notion', method: 'GET', path: '/v1/pages/1', headers: { [header]: 'attacker' } });

        expect(errorOf(result).message).toContain(`cannot be passed: ${header}`);
        expect(codeOf(result)).toBe('invalid_input');
        expect(request).not.toHaveBeenCalled();
    });

    it('still forwards ordinary headers', async () => {
        const request = vi.spyOn(proxyService, 'request').mockResolvedValue({ result: Ok(jsonResponse({ ok: true })) });

        await callProxy({ integration: 'notion', method: 'GET', path: '/v1/pages/1', headers: { 'notion-version': '2022-06-28' } });

        expect(request).toHaveBeenCalledWith(expect.objectContaining({ headers: { 'notion-version': '2022-06-28' } }));
    });

    it("rejects the provider's own credential header, which is not always authorization", async () => {
        const request = vi.spyOn(proxyService, 'request');

        const result = await callProxy({ integration: 'autosana', method: 'GET', path: '/runs', headers: { 'X-Api-Key': 'attacker' } });

        expect(errorOf(result).message).toContain('cannot be passed: X-Api-Key');
        expect(request).not.toHaveBeenCalled();
    });

    it('forwards hop-by-hop headers, which every proxy entrypoint still does', async () => {
        const request = vi.spyOn(proxyService, 'request').mockResolvedValue({ result: Ok(jsonResponse({ ok: true })) });

        await callProxy({ integration: 'notion', method: 'GET', path: '/v1/pages/1', headers: { 'transfer-encoding': 'chunked' } });

        expect(request).toHaveBeenCalledWith(expect.objectContaining({ headers: { 'transfer-encoding': 'chunked' } }));
    });

    it('allows a provider header that is a constant rather than a credential', async () => {
        const request = vi.spyOn(proxyService, 'request').mockResolvedValue({ result: Ok(jsonResponse({ ok: true })) });

        // notion templates notion-version, but as a fixed value, so it carries no credential.
        await callProxy({ integration: 'notion', method: 'GET', path: '/v1/pages/1', headers: { 'notion-version': '2022-02-22' } });

        expect(request).toHaveBeenCalledWith(expect.objectContaining({ headers: { 'notion-version': '2022-02-22' } }));
    });

    it("does not reject another provider's credential header", async () => {
        const request = vi.spyOn(proxyService, 'request').mockResolvedValue({ result: Ok(jsonResponse({ ok: true })) });

        // x-api-key is autosana's credential, not notion's, so notion has no reason to refuse it.
        await callProxy({ integration: 'notion', method: 'GET', path: '/v1/pages/1', headers: { 'x-api-key': 'fine-here' } });

        expect(request).toHaveBeenCalledWith(expect.objectContaining({ headers: { 'x-api-key': 'fine-here' } }));
    });

    it('rejects an integration id that is not a provider config key', async () => {
        const request = vi.spyOn(proxyService, 'request');

        const result = await callProxy({ integration: 'not/a/key', method: 'GET', path: '/v1/pages/1' });

        expect(errorOf(result).message).toContain('integration');
        expect(request).not.toHaveBeenCalled();
    });

    it('is enabled only when the session turned the meta tool on', () => {
        expect(proxyTool.isEnabled({ nangoToolSearch: true, nangoExecute: true, nangoProxy: true })).toBe(true);
        expect(proxyTool.isEnabled({ nangoToolSearch: true, nangoExecute: true, nangoProxy: false })).toBe(false);
    });
});
