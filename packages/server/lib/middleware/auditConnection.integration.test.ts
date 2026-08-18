import { randomUUID } from 'node:crypto';

import simpleOauth2 from 'simple-oauth2';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import * as featureFlags from '@nangohq/feature-flags';
import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';

import { audit } from '../audit.js';
import oAuthSessionService from '../services/oauth-session.service.js';
import { isSuccess, runServer } from '../utils/tests.js';

import type { AuditAction, AuditResource } from '@nangohq/audit';
import type { MockInstance } from 'vitest';

// connection.created is emitted from the connectionCreated hook, so no route middleware can be probed for
// it: only a real request proves the hook runs and that the caller reaches it. Actor precedence, the
// creation gate and the event shape are covered off-stack in auditConnection.unit.test.ts.

let api: Awaited<ReturnType<typeof runServer>>;
let auditSpy: MockInstance<typeof audit.record>;

function auditEvent(resource: AuditResource, action: AuditAction) {
    return auditSpy.mock.calls.map((call) => call[0]).find((event) => event.resource === resource && event.action === action);
}

describe('connection.created — live-stack contract', () => {
    beforeAll(async () => {
        api = await runServer();
        auditSpy = vi.spyOn(audit, 'record');
        // getFlags() returns the stable noop facade in tests; force the audit trail on.
        vi.spyOn(featureFlags.getFlags(), 'isAuditTrailEnabled').mockResolvedValue(true);
    });

    afterAll(() => {
        api.server.close();
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        auditSpy.mockClear();
    });

    it('records a connection import with the server-generated connection_id when none is supplied', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch('/connections', {
            method: 'POST',
            token: apiKey.secret,
            body: { provider_config_key: 'github', credentials: { type: 'OAUTH2', access_token: '123' } }
        });

        expect(res.res.status).toBe(201);
        isSuccess(res.json);
        const generatedId = res.json.connection_id;
        expect(generatedId).toBeTruthy();

        await vi.waitFor(() => {
            expect(auditEvent('connection', 'created')).toBeDefined();
        });
        expect(auditEvent('connection', 'created')).toMatchObject({
            resource: 'connection',
            action: 'created',
            outcome: 'success',
            targets: [{ type: 'connection', id: generatedId }],
            metadata: { providerConfigKey: 'github' }
        });
    });

    // The OAuth callback is the busiest creation path and the only one where nothing on the request
    // identifies anyone: the provider issues the redirect, so the end user has to be recovered from the
    // session row the authorize leg wrote.
    it('attributes an OAuth callback creation to the end user on its connect session', async () => {
        const { account, env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github', { oauth_client_id: 'a-client-id', oauth_client_secret: 'a-client-secret' });

        const session = await api.fetch('/connect/sessions', {
            method: 'POST',
            token: apiKey.secret,
            body: { end_user: { id: 'oauth-end-user', email: 'oauth@customer.com' } }
        });
        isSuccess(session.json);
        const [connectSession] = await db.knex
            .select<{ id: number }[]>('id')
            .from('connect_sessions')
            .where({ environment_id: env.id })
            .orderBy('id', 'desc')
            .limit(1);

        const logCtx = await logContextGetter.create({ operation: { type: 'auth', action: 'create_connection' } }, { account, environment: env });
        const state = randomUUID();
        await oAuthSessionService.create({
            id: state,
            providerConfigKey: 'github',
            provider: 'github',
            connectionId: 'oauth-callback-conn',
            callbackUrl: `${api.url}/oauth/callback`,
            authMode: 'OAUTH2',
            connectSessionId: connectSession!.id,
            connectionConfig: {},
            webhookUrlOverride: null,
            environmentId: env.id,
            webSocketClientId: undefined,
            activityLogId: logCtx.id,
            codeVerifier: 'code-verifier',
            requestTokenSecret: null,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // The provider is the only part of the flow we cannot run for real.
        vi.spyOn(simpleOauth2.AuthorizationCode.prototype, 'getToken').mockResolvedValue({
            token: { access_token: 'an-access-token', token_type: 'bearer', expires_in: 3600 }
        } as never);

        const res = await fetch(`${api.url}/oauth/callback?state=${state}&code=an-auth-code`, { headers: { 'user-agent': 'a-browser' } });
        expect(res.status, await res.text()).toBe(200);

        await vi.waitFor(() => {
            expect(auditEvent('connection', 'created')).toBeDefined();
        });
        expect(auditEvent('connection', 'created')).toMatchObject({
            resource: 'connection',
            action: 'created',
            outcome: 'success',
            actor: { type: 'connect_session', id: 'oauth-end-user', display: 'oauth@customer.com' },
            targets: [{ type: 'connection', id: 'oauth-callback-conn' }],
            // The provider issues this redirect, so the context is the end user's browser, not ours.
            context: { interface: 'api', ip: expect.any(String), userAgent: 'a-browser' }
        });
    });

    // The Connect flow: the actor is the end user named by the session, which only the hook can see —
    // the request itself authenticates a session, not a person.
    it('attributes a connection created through a connect session to its end user', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const config = await seeders.createConfigSeed(env, 'unauthenticated', 'unauthenticated');

        const session = await api.fetch('/connect/sessions', {
            method: 'POST',
            token: apiKey.secret,
            body: { end_user: { id: 'end-user-1', email: 'buyer@customer.com' } }
        });
        isSuccess(session.json);

        const res = await api.fetch('/auth/unauthenticated/:providerConfigKey', {
            method: 'POST',
            query: { connect_session_token: session.json.data.token },
            params: { providerConfigKey: config.unique_key }
        });
        isSuccess(res.json);

        await vi.waitFor(() => {
            expect(auditEvent('connection', 'created')).toBeDefined();
        });
        expect(auditEvent('connection', 'created')).toMatchObject({
            resource: 'connection',
            action: 'created',
            outcome: 'success',
            actor: { type: 'connect_session', id: 'end-user-1', display: 'buyer@customer.com' },
            targets: [{ type: 'connection', id: res.json.connectionId }]
        });
    });
});
