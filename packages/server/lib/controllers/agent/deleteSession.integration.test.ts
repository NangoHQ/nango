import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import * as keystore from '@nangohq/keystore';
import { customerKeyService, seeders } from '@nangohq/shared';

import { createAgentSession, createAgentSessionToken, getAgentSessionByToken } from '../../services/agentSession.service.js';
import { isError, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

import type { AgentSession, DBEnvironment, DBTeam } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/sessions/:sessionId';

async function seedEnvironment(scopes: string[] = ['environment:agent_sessions:write']): Promise<{ account: DBTeam; env: DBEnvironment; token: string }> {
    const seed = await seeders.seedAccountEnvAndUser();
    const key = (
        await customerKeyService.createApiKey(db.knex, {
            accountId: seed.account.id,
            environmentId: seed.env.id,
            displayName: `test-${randomUUID()}`,
            scopes
        })
    ).unwrap();

    return { account: seed.account, env: seed.env, token: key.secret };
}

async function seedSession({ account, env }: { account: DBTeam; env: DBEnvironment }): Promise<AgentSession> {
    return (
        await createAgentSession(db.knex, {
            accountId: account.id,
            environmentId: env.id,
            resolvedConnections: {},
            compiledToolset: {},
            metaTools: { nangoToolSearch: true, nangoExecute: true },
            expiresAt: new Date(Date.now() + 60 * 60 * 1000)
        })
    ).unwrap();
}

describe(`DELETE ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
        await keystore.migrate(db.knex);
    });

    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, { method: 'DELETE', params: { sessionId: randomUUID() } });

        shouldBeProtected(res);
    });

    it('should reject a key without the agent_sessions:write scope', async () => {
        const { account, env } = await seedEnvironment();
        const session = await seedSession({ account, env });
        const { token } = await seedEnvironment(['environment:connect_sessions:write']);

        const res = await api.fetch(endpoint, { method: 'DELETE', token, params: { sessionId: session.id } });

        expect(res.res.status).toBe(403);
    });

    it('should reject a session id that is not a uuid', async () => {
        const { token } = await seedEnvironment();

        const res = await api.fetch(endpoint, { method: 'DELETE', token, params: { sessionId: 'not-a-uuid' } });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json.error.code).toBe('invalid_uri_params');
    });

    it('should return 404 for an unknown session', async () => {
        const { token } = await seedEnvironment();

        const res = await api.fetch(endpoint, { method: 'DELETE', token, params: { sessionId: randomUUID() } });

        isError(res.json);
        expect(res.res.status).toBe(404);
        expect(res.json.error.code).toBe('not_found');
    });

    it('should return 404 for a session that belongs to another environment', async () => {
        const other = await seedEnvironment();
        const session = await seedSession({ account: other.account, env: other.env });
        const { token } = await seedEnvironment();

        const res = await api.fetch(endpoint, { method: 'DELETE', token, params: { sessionId: session.id } });

        isError(res.json);
        expect(res.res.status).toBe(404);
    });

    it('terminates the session and revokes its token', async () => {
        const { account, env, token } = await seedEnvironment();
        const session = await seedSession({ account, env });
        const sessionToken = (await createAgentSessionToken(db.knex, session)).unwrap().token;

        const res = await api.fetch(endpoint, { method: 'DELETE', token, params: { sessionId: session.id } });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json.data.session_id).toBe(session.id);
        expect(res.json.data.reason).toBe('terminated');
        expect(new Date(res.json.data.ended_at).getTime()).toBeLessThanOrEqual(Date.now());

        const resolved = await getAgentSessionByToken(db.knex, sessionToken);
        expect(resolved.isErr()).toBe(true);
    });

    it('keeps the original ended_at when the session is terminated twice', async () => {
        const { account, env, token } = await seedEnvironment();
        const session = await seedSession({ account, env });

        const first = await api.fetch(endpoint, { method: 'DELETE', token, params: { sessionId: session.id } });
        isSuccess(first.json);

        const second = await api.fetch(endpoint, { method: 'DELETE', token, params: { sessionId: session.id } });
        isSuccess(second.json);
        expect(second.res.status).toBe(200);
        expect(second.json.data).toStrictEqual(first.json.data);
    });

    it('rejects the session token on the mcp endpoint once terminated', async () => {
        const { account, env, token } = await seedEnvironment();
        const session = await seedSession({ account, env });
        const sessionToken = (await createAgentSessionToken(db.knex, session)).unwrap().token;

        const terminated = await api.fetch(endpoint, { method: 'DELETE', token, params: { sessionId: session.id } });
        isSuccess(terminated.json);

        const mcp = await fetch(`${api.url}/session/${session.id}/mcp`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${sessionToken}`, 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
        });

        expect(mcp.status).toBe(401);
    });
});
