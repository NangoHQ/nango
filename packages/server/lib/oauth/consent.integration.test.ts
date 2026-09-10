import { createHash, randomBytes } from 'node:crypto';
import { request as httpRequest } from 'node:http';

import jwt from 'jsonwebtoken';
import * as OTPAuth from 'otpauth';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { getFlags } from '@nangohq/feature-flags';
import { OAuthProviderErrors } from '@nangohq/oauth-server';
import { seeders } from '@nangohq/shared';

import { deleteUserSessions } from '../clients/auth.client.js';
import { runServer } from '../utils/tests.js';
import { resetPasswordSecret } from '../utils/utils.js';
import { cleanOAuthConsent, GRANT_RESOURCES, PRODUCT_GRANTS, revokeUserOAuthGrants } from './grants.js';
import { oauthConsent, oauthServer } from './server.js';

import type * as ConfigModule from './config.js';
import type { GetOAuthInteraction } from '@nangohq/types';

const fixtures = await vi.hoisted(async () => {
    const { generateKeyPairSync } = await import('node:crypto');
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env['FLAG_AUTH_ENABLED'] = 'true';
    process.env['FLAG_MANAGED_AUTH_ENABLED'] = 'true';
    process.env['WORKOS_API_KEY'] = 'sk_test_fixture';
    process.env['WORKOS_CLIENT_ID'] = 'client_fixture';
    process.env['NANGO_SERVER_URL'] = 'https://api.nango.test';
    process.env['NANGO_DASHBOARD_API_URL'] = 'https://api.nango.test';
    process.env['NANGO_PUBLIC_SERVER_URL'] = 'https://app.nango.test';
    process.env['NANGO_MANAGEMENT_MCP_OAUTH_ENABLED'] = 'true';
    process.env['NANGO_OAUTH_SERVER_BASE_URL'] = 'https://api.nango.test';
    process.env['NANGO_OAUTH_SERVER_COOKIE_KEYS'] = JSON.stringify(['a'.repeat(32), 'b'.repeat(32)]);
    process.env['NANGO_OAUTH_SERVER_JWKS'] = JSON.stringify({ keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'test', use: 'sig', alg: 'RS256' }] });
    return {
        clientId: 'https://example.com/nango-client.json',
        callback: 'https://example.com/callback',
        secondResource: 'https://agent.nango.test/mcp',
        authenticateWithCode: vi.fn(),
        authenticateWithEmailVerification: vi.fn()
    };
});

vi.mock('../clients/workos.client.js', () => ({
    getWorkOSClient: () => ({
        userManagement: { authenticateWithCode: fixtures.authenticateWithCode, authenticateWithEmailVerification: fixtures.authenticateWithEmailVerification }
    })
}));

// Only external CIMD transport is replaced. Provider protocol, cookies, sessions, migrations,
// authentication and grant persistence all run through their production implementations.
vi.mock('@nangohq/egress', async (importOriginal) => ({ ...(await importOriginal<object>()), assertSafeOutboundUrl: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./config.js', async (importOriginal) => {
    const original = await importOriginal<typeof ConfigModule>();
    return {
        ...original,
        getOAuthServerConfig: () => {
            const config = original.getOAuthServerConfig();
            return config && { ...config, resources: [...config.resources, { resource: fixtures.secondResource, scopes: ['agent-session:*'] }] };
        }
    };
});

let api: Awaited<ReturnType<typeof runServer>>;
let seeded: Awaited<ReturnType<typeof seeders.seedAccountEnvAndUser>>;
let enabled = true;
const dashboardOrigin = 'https://app.nango.test';
const issuer = 'https://api.nango.test';
const management = 'https://mcp-test.nango.dev/mcp';

class Browser {
    private cookies = new Map<string, string>();
    async request(url: string, init: RequestInit = {}) {
        const target = new URL(url);
        const key = `${target.host}:`;
        const cookie = [...this.cookies]
            .filter(([name]) => name.startsWith(key))
            .map(([, value]) => value)
            .join('; ');
        const headers: Record<string, string> = { host: target.host, 'X-Forwarded-Proto': target.protocol.slice(0, -1), Cookie: cookie };
        new Headers(init.headers).forEach((value, key) => {
            headers[key] = value;
        });
        // Node fetch drops custom Host headers. Send through HTTP just like a TLS-terminating
        // ingress so the production issuer-host check is exercised, not bypassed.
        const response = await new Promise<Response>((resolve, reject) => {
            const request = httpRequest(
                `${api.url}${target.pathname}${target.search}`,
                {
                    method: init.method ?? 'GET',
                    headers
                },
                (incoming) => {
                    const chunks: Buffer[] = [];
                    incoming.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                    incoming.on('end', () => {
                        const headers = new Headers();
                        for (let index = 0; index < incoming.rawHeaders.length; index += 2)
                            headers.append(incoming.rawHeaders[index]!, incoming.rawHeaders[index + 1]!);
                        resolve(new Response(incoming.statusCode === 204 ? null : Buffer.concat(chunks), { status: incoming.statusCode!, headers }));
                    });
                }
            );
            request.on('error', reject);
            request.end(typeof init.body === 'string' ? init.body : undefined);
        });
        for (const value of response.headers.getSetCookie()) {
            const pair = value.split(';')[0]!;
            this.cookies.set(`${key}${pair.split('=')[0]}`, pair);
            expect(value.toLowerCase()).not.toContain('domain=');
            expect(pair).not.toMatch(/^nango_oauth_(login|bridge)=/);
        }
        return response;
    }
    clearCookie(name: string) {
        this.cookies.delete(`api.nango.test:${name}`);
    }
    async json(url: string, body?: unknown, origin = dashboardOrigin) {
        return await this.request(url, {
            method: body ? 'POST' : 'GET',
            headers: { Origin: origin, 'Content-Type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {})
        });
    }
}

async function signIn(browser: Browser) {
    const response = await browser.json('https://api.nango.test/api/v1/account/signin', { email: seeded.user.email, password: 'Password123!' });
    expect(response.status).toBe(200);
    return await response.json();
}

async function begin(browser: Browser, multi = false) {
    const verifier = randomBytes(32).toString('base64url');
    const url = new URL('/oauth/authorize', issuer);
    url.search = new URLSearchParams({
        client_id: fixtures.clientId,
        redirect_uri: fixtures.callback,
        response_type: 'code',
        scope: multi ? 'environment:* agent-session:*' : 'environment:*',
        resource: management,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
        state: 'client-state'
    }).toString();
    if (multi) url.searchParams.append('resource', fixtures.secondResource);
    const auth = await browser.request(url.href);
    expect(auth.status).toBe(303);
    const entryUrl = new URL(auth.headers.get('location')!, issuer).href;
    const uid = new URL(entryUrl).pathname.split('/').at(-1)!;
    return { entryUrl, continuation: `/oauth/continue/${uid}`, uid, verifier };
}

async function beginSignedOut(browser: Browser) {
    const flow = await begin(browser);
    const entry = await browser.request(flow.entryUrl);
    expect(entry.status).toBe(303);
    expect(entry.headers.get('location')).toBe(`${dashboardOrigin}/signin?next=${encodeURIComponent(flow.continuation)}`);
    return flow;
}

async function reachConsent(browser: Browser, entryUrl: string) {
    let response = await browser.request(entryUrl);
    expect(response.status).toBe(303);
    for (let count = 0; count < 6; count++) {
        const location = new URL(response.headers.get('location')!, issuer);
        if (location.origin === dashboardOrigin) {
            expect(location.pathname).toMatch(/^\/oauth\/consent\//);
            return location.pathname.split('/').at(-1)!;
        }
        response = await browser.request(location.href);
        expect(response.status).toBe(303);
    }
    throw new Error('Consent was not reached');
}

async function consent(multi = false) {
    const browser = new Browser();
    await signIn(browser);
    const { entryUrl, verifier } = await begin(browser, multi);
    const uid = await reachConsent(browser, entryUrl);
    const response = await browser.json(`${issuer}/oauth/interaction/${uid}/details`);
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as GetOAuthInteraction['Success'];
    return { browser, uid, data, verifier };
}

async function approve(flow: Awaited<ReturnType<typeof consent>>) {
    const response = await flow.browser.json(`${issuer}/oauth/interaction/${flow.uid}/approve`, { csrfToken: flow.data.csrfToken });
    expect(response.status).toBe(200);
    const { data } = await response.json();
    const resume = await flow.browser.request(data.redirectUrl);
    expect(resume.status).toBe(303);
    const callback = new URL(resume.headers.get('location')!);
    expect(callback.origin).toBe(new URL(fixtures.callback).origin);
    expect(callback.searchParams.get('code')).toBeTruthy();
    const tokens = await flow.browser.request(`${issuer}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: fixtures.clientId,
            redirect_uri: fixtures.callback,
            code: callback.searchParams.get('code')!,
            code_verifier: flow.verifier,
            resource: management
        }).toString()
    });
    expect(tokens.status).toBe(200);
    return { grantId: data.grantId as string, tokens: await tokens.json() };
}

describe('Nango OAuth login and consent', () => {
    beforeAll(async () => {
        const nativeFetch = globalThis.fetch;
        vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
            if ((typeof url === 'string' ? url : url instanceof URL ? url.href : url.url) === fixtures.clientId)
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            client_id: fixtures.clientId,
                            client_name: 'Example client',
                            redirect_uris: [fixtures.callback],
                            grant_types: ['authorization_code', 'refresh_token'],
                            response_types: ['code'],
                            token_endpoint_auth_method: 'none',
                            scope: 'environment:* agent-session:*'
                        }),
                        { headers: { 'Content-Type': 'application/json' } }
                    )
                );
            return nativeFetch(url, init);
        });
        vi.spyOn(getFlags(), 'isOAuthConsentEnabled').mockImplementation(() => Promise.resolve(enabled));
        api = await runServer();
    });
    beforeEach(async () => {
        enabled = true;
        seeded = await seeders.seedAccountEnvAndUser();
        await db.knex('_nango_accounts').where({ id: seeded.account.id }).update({ found_us: 'tests' });
    });
    afterAll(() => {
        api?.server.close();
        vi.restoreAllMocks();
    });

    it('reuses the dashboard session and issues tokens for a multi-resource product grant without a bridge', async () => {
        const flow = await consent(true);
        expect(flow.data).toMatchObject({
            clientName: 'Example client',
            clientHostname: 'example.com',
            callbackHostname: 'example.com',
            resources: [
                { resource: management, scopes: ['environment:*'] },
                { resource: fixtures.secondResource, scopes: ['agent-session:*'] }
            ]
        });
        expect(JSON.stringify(flow.data)).not.toContain(fixtures.clientId);
        const { grantId, tokens } = await approve(flow);
        expect(tokens).toMatchObject({ token_type: 'Bearer', scope: 'environment:*' });
        expect(tokens.refresh_token).toBeTruthy();
        const grant = await db.knex(PRODUCT_GRANTS).where({ id: grantId }).first();
        expect(grant).toMatchObject({ status: 'active', user_id: seeded.user.id, account_id: seeded.account.id, client_id: fixtures.clientId });
        expect(await db.knex(GRANT_RESOURCES).where({ grant_id: grantId })).toHaveLength(2);
        const refresh = await flow.browser.request(`${issuer}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: fixtures.clientId,
                refresh_token: tokens.refresh_token,
                resource: fixtures.secondResource
            }).toString()
        });
        expect(refresh.status).toBe(200);
        expect(await refresh.json()).toMatchObject({ scope: 'agent-session:*', token_type: 'Bearer' });
    });

    it('resumes the exact interaction after signed-out password login', async () => {
        const browser = new Browser();
        const { entryUrl, continuation } = await beginSignedOut(browser);
        expect(await signIn(browser)).toMatchObject({ url: continuation });
        expect(await reachConsent(browser, entryUrl)).toBeTruthy();
        // The one-time login destination is not carried into the authenticated session.
        expect(await signIn(browser)).toMatchObject({ url: '/' });
    });

    it('preserves continuation through password login and MFA session regeneration', async () => {
        const enrolled = new Browser();
        await signIn(enrolled);
        const enrollment = await enrolled.json('https://api.nango.test/api/v1/account/mfa/enroll', {});
        expect(enrollment.status).toBe(200);
        const totp = OTPAuth.URI.parse((await enrollment.json()).data.otpauthUri) as OTPAuth.TOTP;
        const activation = await enrolled.json('https://api.nango.test/api/v1/account/mfa/activate', { code: totp.generate() });
        expect(activation.status).toBe(200);
        const recoveryCode = (await activation.json()).data.recoveryCodes[0];
        const browser = new Browser();
        const { entryUrl, continuation, uid } = await beginSignedOut(browser);
        expect(await signIn(browser)).toMatchObject({ data: { mfaRequired: true } });
        expect((await browser.json(`${issuer}/oauth/interaction/${uid}/details`)).status).toBe(401);
        const verified = await browser.json('https://api.nango.test/api/v1/account/mfa/login/verify', { type: 'recoveryCode', recoveryCode });
        expect(verified.status).toBe(200);
        expect(await verified.json()).toMatchObject({ data: { url: continuation } });
        expect(await reachConsent(browser, entryUrl)).toBeTruthy();
    });

    it.each([false, true])('resumes managed login (email verification: %s)', async (verifyEmail) => {
        const browser = new Browser();
        const { entryUrl, continuation } = await beginSignedOut(browser);
        const identity = { user: { email: seeded.user.email, firstName: 'Test', lastName: 'User' } };
        if (verifyEmail)
            fixtures.authenticateWithCode.mockRejectedValueOnce({
                rawData: {
                    code: 'email_verification_required',
                    pending_authentication_token: 'fixture-pending',
                    email: seeded.user.email,
                    email_verification_id: 'fixture-id'
                }
            });
        else fixtures.authenticateWithCode.mockResolvedValueOnce(identity);
        const callback = await browser.request('https://api.nango.test/api/v1/login/callback?code=fixture-code');
        expect(callback.status).toBe(302);
        if (verifyEmail) {
            expect(callback.headers.get('location')).toBe(`${dashboardOrigin}/signin/verify`);
            fixtures.authenticateWithEmailVerification.mockResolvedValueOnce(identity);
            const result = await browser.json('https://api.nango.test/api/v1/account/managed/verification', { code: '123456' });
            expect(result.status).toBe(200);
            expect(await result.json()).toMatchObject({ data: { url: `${dashboardOrigin}${continuation}` } });
        } else expect(callback.headers.get('location')).toBe(`${dashboardOrigin}${continuation}`);
        expect(await reachConsent(browser, entryUrl)).toBeTruthy();
    });

    it('carries onboarding destinations with only the opaque continuation', async () => {
        const browser = new Browser();
        await signIn(browser);
        const { entryUrl, continuation } = await begin(browser);
        await db.knex('_nango_users').where({ id: seeded.user.id }).update({ account_discovery_pending: true });
        expect((await browser.request(entryUrl)).headers.get('location')).toBe(
            `${dashboardOrigin}/onboarding/account-discovery?next=${encodeURIComponent(continuation)}`
        );
        const discovery = await browser.json('https://api.nango.test/api/v1/account/onboarding/account-discovery');
        expect(discovery.status).toBe(200);
        await db.knex('_nango_accounts').where({ id: seeded.account.id }).update({ found_us: null });
        expect((await browser.request(entryUrl)).headers.get('location')).toBe(
            `${dashboardOrigin}/onboarding/hear-about-us?next=${encodeURIComponent(continuation)}`
        );
        const submitted = await browser.json('https://api.nango.test/api/v1/account/onboarding/hear-about-us', { source: 'skipped' });
        expect(submitted.status).toBe(200);
        expect(await reachConsent(browser, entryUrl)).toBeTruthy();
    });

    it('denies through the provider and does not create a product grant', async () => {
        const flow = await consent();
        const response = await flow.browser.json(`${issuer}/oauth/interaction/${flow.uid}/deny`, { csrfToken: flow.data.csrfToken });
        expect(response.status).toBe(200);
        const resume = await flow.browser.request((await response.json()).data.redirectUrl);
        const callback = new URL(resume.headers.get('location')!);
        expect(callback.searchParams.get('error')).toBe('access_denied');
        expect(callback.searchParams.get('state')).toBe('client-state');
        expect(await db.knex(PRODUCT_GRANTS).where({ user_id: seeded.user.id })).toHaveLength(0);
    });

    it('fails closed on cookie, CSRF, Origin, feature-flag and replay errors', async () => {
        const flow = await consent();
        const endpoint = `${issuer}/oauth/interaction/${flow.uid}`;
        expect((await new Browser().json(`${endpoint}/details`)).status).toBe(401);
        expect((await flow.browser.json(`${endpoint}/approve`, { csrfToken: 'x'.repeat(43) })).status).toBe(403);
        expect((await flow.browser.json(`${endpoint}/approve`, { csrfToken: flow.data.csrfToken }, 'https://evil.example')).status).toBe(403);
        enabled = false;
        expect((await flow.browser.json(`${endpoint}/details`)).status).toBe(403);
        expect((await flow.browser.json(`${endpoint}/approve`, { csrfToken: flow.data.csrfToken })).status).toBe(403);
        expect((await flow.browser.json(`${endpoint}/deny`, { csrfToken: flow.data.csrfToken })).status).toBe(403);
        expect((await flow.browser.request(`${issuer}/.well-known/oauth-authorization-server`)).status).toBe(200);
        enabled = true;
        const responses = await Promise.all([
            flow.browser.json(`${endpoint}/approve`, { csrfToken: flow.data.csrfToken }),
            flow.browser.json(`${endpoint}/approve`, { csrfToken: flow.data.csrfToken })
        ]);
        expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
        expect(await db.knex(PRODUCT_GRANTS).where({ user_id: seeded.user.id, status: 'active' })).toHaveLength(1);
    });

    it('only exposes the provider on the configured issuer host and exact credentialed CORS origin', async () => {
        const browser = new Browser();
        expect((await browser.request('https://id.nango.test/.well-known/oauth-authorization-server')).status).toBe(404);
        expect((await browser.request(`${issuer}/oauth/authorize`, { headers: { 'X-Forwarded-Host': 'evil.example' } })).status).toBe(404);
        const response = await browser.request(`${issuer}/oauth/interaction/${'a'.repeat(32)}/details`, {
            method: 'OPTIONS',
            headers: { Origin: dashboardOrigin, 'Access-Control-Request-Method': 'GET' }
        });
        expect(response.headers.get('access-control-allow-origin')).toBe(dashboardOrigin);
        expect(response.headers.get('access-control-allow-credentials')).toBe('true');
        expect(
            (await browser.json(`${issuer}/oauth/interaction/${'a'.repeat(32)}/details`, undefined, 'https://evil.example')).headers.get(
                'access-control-allow-origin'
            )
        ).not.toBe('https://evil.example');
    });

    it('requires both the dashboard session and the bound provider interaction cookie', async () => {
        const flow = await consent();
        const endpoint = `${issuer}/oauth/interaction/${flow.uid}`;
        flow.browser.clearCookie('nango_oauth_interaction');
        expect((await flow.browser.json(`${endpoint}/details`)).status).toBe(410);
        expect((await flow.browser.json(`${endpoint}/approve`, { csrfToken: flow.data.csrfToken })).status).toBe(410);
        expect(await db.knex(PRODUCT_GRANTS).where({ user_id: seeded.user.id })).toHaveLength(0);
    });

    it('requires a fresh login after logout even with provider cookies, but preserves existing grants', async () => {
        const flow = await consent();
        const { grantId, tokens } = await approve(flow);
        await flow.browser.json(`${issuer}/api/v1/account/logout`, {});
        await beginSignedOut(flow.browser);
        expect(await db.knex(PRODUCT_GRANTS).where({ id: grantId }).first()).toMatchObject({ status: 'active' });
        const refreshed = await flow.browser.request(`${issuer}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: fixtures.clientId,
                refresh_token: tokens.refresh_token,
                resource: management
            }).toString()
        });
        expect(refreshed.status).toBe(200);
    });

    it('rechecks the flag for a new authorization even when the provider remembers an earlier grant', async () => {
        const flow = await consent();
        await approve(flow);
        enabled = false;
        const { entryUrl } = await begin(flow.browser);
        expect((await flow.browser.request(entryUrl)).status).toBe(403);
        expect(await db.knex(PRODUCT_GRANTS).where({ user_id: seeded.user.id })).toHaveLength(1);
    });

    it('binds approval CSRF to the dashboard session, including same-user session rotation', async () => {
        const flow = await consent();
        await signIn(flow.browser);
        const endpoint = `${issuer}/oauth/interaction/${flow.uid}`;
        expect((await flow.browser.json(`${endpoint}/approve`, { csrfToken: flow.data.csrfToken })).status).toBe(403);
        const details = await flow.browser.json(`${endpoint}/details`);
        expect(details.status).toBe(200);
        flow.data = (await details.json()).data;
        await approve(flow);
    });

    it('rejects a different signed-in user on an already-bound interaction', async () => {
        const flow = await consent();
        const originalUser = seeded.user;
        seeded = await seeders.seedAccountEnvAndUser();
        await signIn(flow.browser);
        expect((await flow.browser.json(`${issuer}/oauth/interaction/${flow.uid}/details`)).status).toBe(400);
        expect(await db.knex(PRODUCT_GRANTS).where({ user_id: originalUser.id })).toHaveLength(0);
    });

    it('cannot resurrect a dashboard session while a password reset revokes it', async () => {
        const flow = await consent();
        const blocker = await db.knex.transaction();
        try {
            await blocker('_nango_users').where({ id: seeded.user.id }).forUpdate().first();
            const result = flow.browser.json(`${issuer}/oauth/interaction/${flow.uid}/approve`, { csrfToken: flow.data.csrfToken });
            // Observe approval waiting on the same user lock as password revocation.
            await vi.waitFor(async () => {
                const waiting = await db.knex('pg_stat_activity').where({ wait_event_type: 'Lock' }).where('query', 'like', '%_nango_users%').first();
                expect(waiting).toBeDefined();
            });
            await deleteUserSessions(seeded.user.id, { trx: blocker });
            await revokeUserOAuthGrants(seeded.user.id, blocker);
            await blocker.commit();
            expect((await result).status).toBe(401);
            const resurrected = await db.knex('_nango_sessions').whereRaw(`sess->'passport'->'user'->>'id' = ?`, [String(seeded.user.id)]);
            expect(resurrected).toHaveLength(0);
        } finally {
            if (!blocker.isCompleted()) await blocker.rollback();
        }
    });

    it('rejects browser-supplied identity fields and malformed JSON without echoing credentials', async () => {
        const flow = await consent();
        const endpoint = `${issuer}/oauth/interaction/${flow.uid}/approve`;
        expect((await flow.browser.json(endpoint, { csrfToken: flow.data.csrfToken, accountId: seeded.account.id })).status).toBe(400);
        const response = await flow.browser.request(endpoint, {
            method: 'POST',
            headers: { Origin: dashboardOrigin, 'Content-Type': 'application/json' },
            body: '{"secret":"test-secret"'
        });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: { code: 'invalid_body' } });
    });

    it('revalidates configured resources and scope ceilings immediately before approval', async () => {
        const flow = await consent(true);
        const original = oauthConsent!.options.resources;
        try {
            oauthConsent!.options.resources = original.filter((resource) => resource.resource !== fixtures.secondResource);
            expect((await flow.browser.json(`${issuer}/oauth/interaction/${flow.uid}/approve`, { csrfToken: flow.data.csrfToken })).status).toBe(400);
            oauthConsent!.options.resources = original.map((resource) => ({ ...resource, scopes: [] }));
            expect((await flow.browser.json(`${issuer}/oauth/interaction/${flow.uid}/approve`, { csrfToken: flow.data.csrfToken })).status).toBe(400);
        } finally {
            oauthConsent!.options.resources = original;
        }
        expect(await db.knex(PRODUCT_GRANTS).where({ user_id: seeded.user.id })).toHaveLength(0);
    });

    it('revalidates suspension and account membership at approval', async () => {
        const flow = await consent();
        await db.knex('_nango_users').where({ id: seeded.user.id }).update({ suspended: true });
        expect((await flow.browser.json(`${issuer}/oauth/interaction/${flow.uid}/approve`, { csrfToken: flow.data.csrfToken })).status).toBe(401);
        const other = await seeders.seedAccountEnvAndUser();
        await db.knex('_nango_users').where({ id: seeded.user.id }).update({ suspended: false, account_id: other.account.id });
        expect((await flow.browser.json(`${issuer}/oauth/interaction/${flow.uid}/approve`, { csrfToken: flow.data.csrfToken })).status).toBe(401);
    });

    it('rolls back product and provider persistence when interaction completion fails', async () => {
        const flow = await consent();
        const before = await db.knex('oauth_server_artifacts').where({ model: 'Grant' }).count();
        const failure = vi.spyOn(oauthServer!, 'interactionResult').mockRejectedValueOnce(new Error('fixture secret must not leak'));
        const response = await flow.browser.json(`${issuer}/oauth/interaction/${flow.uid}/approve`, { csrfToken: flow.data.csrfToken });
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: { code: 'server_error' } });
        expect(await db.knex(PRODUCT_GRANTS).where({ user_id: seeded.user.id })).toHaveLength(0);
        expect(await db.knex('oauth_server_artifacts').where({ model: 'Grant' }).count()).toEqual(before);
        failure.mockRestore();
        await approve(flow);
    });

    it('rolls back the provider grant if product activation fails', async () => {
        const flow = await consent();
        const before = await db.knex('oauth_server_artifacts').where({ model: 'Grant' }).count();
        await db.knex.raw(
            `CREATE FUNCTION oauth_test_activation_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture activation failure'; END $$`
        );
        await db.knex.raw(
            `CREATE TRIGGER oauth_test_activation_failure BEFORE UPDATE ON oauth_product_grants FOR EACH ROW WHEN (NEW.status = 'active') EXECUTE FUNCTION oauth_test_activation_failure()`
        );
        try {
            expect((await flow.browser.json(`${issuer}/oauth/interaction/${flow.uid}/approve`, { csrfToken: flow.data.csrfToken })).status).toBe(500);
            expect(await db.knex(PRODUCT_GRANTS).where({ user_id: seeded.user.id })).toHaveLength(0);
            expect(await db.knex('oauth_server_artifacts').where({ model: 'Grant' }).count()).toEqual(before);
        } finally {
            await db.knex.raw('DROP TRIGGER oauth_test_activation_failure ON oauth_product_grants');
            await db.knex.raw('DROP FUNCTION oauth_test_activation_failure()');
        }
        await approve(flow);
    });

    it('never activates a product binding if the provider grant cannot be saved', async () => {
        const flow = await consent();
        const failure = vi.spyOn(oauthServer!.Grant.prototype, 'save').mockRejectedValueOnce(new Error('fixture persistence failure'));
        try {
            expect((await flow.browser.json(`${issuer}/oauth/interaction/${flow.uid}/approve`, { csrfToken: flow.data.csrfToken })).status).toBe(500);
            expect(await db.knex(PRODUCT_GRANTS).where({ user_id: seeded.user.id })).toHaveLength(0);
        } finally {
            failure.mockRestore();
        }
        await approve(flow);
    });

    it('rejects an expired provider interaction with a typed 410', async () => {
        const flow = await consent();
        const interaction = await oauthServer!.Interaction.find(flow.uid);
        await interaction!.save(-1);
        const response = await flow.browser.json(`${issuer}/oauth/interaction/${flow.uid}/details`);
        expect(response.status).toBe(410);
        expect(await response.json()).toEqual({ error: { code: 'interaction_expired' } });
    });

    it('also returns a typed 410 if the interaction expires during approval persistence', async () => {
        const flow = await consent();
        const expired = vi.spyOn(oauthServer!, 'interactionResult').mockRejectedValueOnce(new OAuthProviderErrors.SessionNotFound('fixture'));
        try {
            const response = await flow.browser.json(`${issuer}/oauth/interaction/${flow.uid}/approve`, { csrfToken: flow.data.csrfToken });
            expect(response.status).toBe(410);
            expect(await response.json()).toEqual({ error: { code: 'interaction_expired' } });
            expect(await db.knex(PRODUCT_GRANTS).where({ user_id: seeded.user.id })).toHaveLength(0);
        } finally {
            expired.mockRestore();
        }
    });

    it('revokes all resources and artifacts on password change, but not logout', async () => {
        const flow = await consent(true);
        const { grantId, tokens } = await approve(flow);
        await flow.browser.json('https://api.nango.test/api/v1/account/logout', {});
        expect(await db.knex(PRODUCT_GRANTS).where({ id: grantId }).first()).toMatchObject({ status: 'active' });
        await signIn(flow.browser);
        const changed = await flow.browser.request('https://api.nango.test/api/v1/user/password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPassword: 'Password123!', newPassword: 'NewPassword123!' })
        });
        expect(changed.status).toBe(200);
        expect(await db.knex(PRODUCT_GRANTS).where({ id: grantId }).first()).toMatchObject({ status: 'revoked' });
        expect(await oauthServer!.AccessToken.find(tokens.access_token)).toBeUndefined();
        expect(await oauthServer!.RefreshToken.find(tokens.refresh_token)).toBeUndefined();
        // Password change intentionally reissues the caller's dashboard session. It may
        // authenticate again, but the old decision stays completed and its grant is revoked.
        expect((await flow.browser.json(`${issuer}/oauth/interaction/${flow.uid}/details`)).status).toBe(409);
    });

    it('revokes the product binding when the client revokes any token', async () => {
        const flow = await consent(true);
        const { grantId, tokens } = await approve(flow);
        const response = await flow.browser.request(`${issuer}/oauth/revoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: fixtures.clientId, token: tokens.access_token }).toString()
        });
        expect(response.status).toBe(200);
        expect(await db.knex(PRODUCT_GRANTS).where({ id: grantId }).first()).toMatchObject({ status: 'revoked' });
        expect(await oauthServer!.RefreshToken.find(tokens.refresh_token)).toBeUndefined();
    });

    it('revokes product grants, provider tokens and the dashboard session on password reset', async () => {
        const flow = await consent(true);
        const { grantId, tokens } = await approve(flow);
        const token = jwt.sign({ userId: seeded.user.id }, resetPasswordSecret(), { expiresIn: '5m' });
        await db.knex('_nango_users').where({ id: seeded.user.id }).update({ reset_password_token: token });
        const response = await flow.browser.request('https://api.nango.test/api/v1/account/reset-password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, password: 'ResetPassword123!' })
        });
        expect(response.status).toBe(200);
        expect(await db.knex(PRODUCT_GRANTS).where({ id: grantId }).first()).toMatchObject({ status: 'revoked' });
        expect(await oauthServer!.RefreshToken.find(tokens.refresh_token)).toBeUndefined();
        expect((await flow.browser.json(`${issuer}/oauth/interaction/${flow.uid}/details`)).status).toBe(401);
    });

    it('compensates stale pending rows in a bounded cleanup batch', async () => {
        const flow = await consent();
        const { grantId } = await approve(flow);
        await db
            .knex(PRODUCT_GRANTS)
            .where({ id: grantId })
            .update({ status: 'pending', created_at: new Date(0) });
        await cleanOAuthConsent(1);
        expect(await db.knex(PRODUCT_GRANTS).where({ id: grantId }).first()).toMatchObject({ status: 'revoked' });
        await db.knex.transaction((trx) => revokeUserOAuthGrants(seeded.user.id, trx));
        expect(oauthConsent).toBeTruthy();
    });
});
