import { createServer } from 'node:http';

import express from 'express';
import { RateLimiterRes } from 'rate-limiter-flexible';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createXSignupRouter } from './xSignup.js';

import type { XSignupAdapterConfig } from './xSignup.js';

vi.mock('../../env.js', () => ({ envs: { SIGNUP_X_DELIVERY_ENABLED: false } }));
const now = Date.parse('2026-10-23T07:00:01Z');
const event = {
    event: 'auth:account_create',
    timestamp: '2026-10-23T07:00:00Z',
    companyId: '123',
    distinctId: 'account-123',
    surface: 'server',
    host: 'https://api.nango.dev',
    isSignupCreatorInternal: false,
    consentMethod: 'explicit',
    consentTimestamp: '2026-10-23T06:59:00Z',
    clickId: 'testclick',
    clickTimestamp: '2026-10-23T06:00:00Z'
};
let config: XSignupAdapterConfig;
const limit = vi.fn(),
    lookup = vi.fn(),
    deliver = vi.fn();
const app = express();
app.use('/internal/analytics/x-signup', createXSignupRouter({ config: () => config, limit, lookup, deliver, now: () => now }));
let server: ReturnType<typeof createServer>, url: string;

describe('route-scoped X adapter', () => {
    beforeAll(async () => {
        server = createServer(app);
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test listener unavailable');
        url = `http://127.0.0.1:${address.port}/internal/analytics/x-signup`;
    });
    afterAll(async () => {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    beforeEach(() => {
        config = {
            enabled: true,
            routeSecret: 'fake_route_secret',
            startAt: '2026-10-23T00:00:00Z',
            consumerKey: 'fake',
            consumerSecret: 'fake',
            accessToken: 'fake',
            accessTokenSecret: 'fake',
            pixelId: 'rh471',
            eventId: 'abc123'
        };
        limit.mockReset().mockResolvedValue(undefined);
        lookup.mockReset().mockResolvedValue({ createdAt: Date.parse(event.timestamp) - 10, isFirstActiveUserInternal: false, isInternal: false });
        deliver.mockReset().mockResolvedValue({ outcome: 'accepted', reason: 'receipt' });
    });
    const send = (body: unknown = event, headers: Record<string, string> = {}, suffix = '') =>
        fetch(url + suffix, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake_route_secret', ...headers },
            body: typeof body === 'string' ? body : JSON.stringify(body)
        });
    it('disabled route returns before limiter, auth, parsing, DB and outbound work', async () => {
        config.enabled = false;
        const response = await send('{PRIVATE_SENTINEL', { Authorization: '' });
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ outcome: 'disabled' });
        expect(limit).not.toHaveBeenCalled();
        expect(lookup).not.toHaveBeenCalled();
        expect(deliver).not.toHaveBeenCalled();
    });
    it.each(['', 'Bearer wrong', 'Bearer ', 'Basic fake_route_secret'])('rejects bad auth %s without parsing private input', async (authorization) => {
        const response = await send('{PRIVATE_SENTINEL', { Authorization: authorization });
        expect(response.status).toBe(401);
        expect(await response.text()).not.toContain('PRIVATE_SENTINEL');
        expect(lookup).not.toHaveBeenCalled();
        expect(deliver).not.toHaveBeenCalled();
    });
    it('fails only this route when rate limiter is unavailable or exhausted', async () => {
        for (const [error, status] of [
            [new Error('PRIVATE_SENTINEL'), 503],
            [new RateLimiterRes(0, 1000, 1, false), 429]
        ] as const) {
            limit.mockRejectedValueOnce(error);
            const response = await send();
            expect(response.status).toBe(status);
            expect(await response.text()).not.toContain('PRIVATE_SENTINEL');
        }
        expect(lookup).not.toHaveBeenCalled();
        expect(deliver).not.toHaveBeenCalled();
    });
    it('bounds bytes and sanitizes JSON errors before shared error handlers', async () => {
        for (const body of ['{PRIVATE_SENTINEL', JSON.stringify({ private: 'PRIVATE_SENTINEL'.repeat(1000) })]) {
            const response = await send(body);
            expect(response.status).toBe(400);
            expect(await response.text()).not.toContain('PRIVATE_SENTINEL');
        }
        expect(lookup).not.toHaveBeenCalled();
        expect(deliver).not.toHaveBeenCalled();
    });
    it('rejects query overrides, extra identity/URL fields and failed eligibility before DB', async () => {
        expect((await send(event, {}, '?url=https://elsewhere.invalid')).status).toBe(400);
        for (const override of [
            { companyId: '456', distinctId: 'account-123' },
            { email: 'PRIVATE_SENTINEL' },
            { targetUrl: 'https://elsewhere.invalid' },
            { isSignupCreatorInternal: true },
            { consentMethod: 'denied' }
        ])
            expect((await send({ ...event, ...override })).status).toBe(400);
        expect(lookup).not.toHaveBeenCalled();
        expect(deliver).not.toHaveBeenCalled();
    });
    it('corroborates DB identity and rejects old accounts or conflicting internal users', async () => {
        for (const data of [
            { createdAt: now - 600_000 },
            { createdAt: now + 1 },
            { isFirstActiveUserInternal: true },
            { isInternal: true },
            { createdAt: NaN }
        ]) {
            lookup.mockResolvedValueOnce({ createdAt: now - 100, isFirstActiveUserInternal: false, isInternal: false, ...data });
            expect((await send()).status).toBe(400);
        }
        expect(deliver).not.toHaveBeenCalled();
    });
    it('retries missing/not-yet-committed accounts and sanitized DB exceptions', async () => {
        lookup.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('PRIVATE_SENTINEL'));
        for (let i = 0; i < 2; i++) {
            const response = await send();
            expect(response.status).toBe(503);
            expect(await response.text()).not.toContain('PRIVATE_SENTINEL');
        }
        expect(deliver).not.toHaveBeenCalled();
    });
    it('makes one attempt per request and lets PostHog own retryable outcomes', async () => {
        deliver.mockResolvedValueOnce({ outcome: 'retry', reason: 'transport_or_response' });
        expect((await send()).status).toBe(503);
        expect((await send()).status).toBe(200);
        expect(deliver).toHaveBeenCalledTimes(2);
        expect(deliver.mock.calls[0]).toEqual(deliver.mock.calls[1]);
        expect(lookup).toHaveBeenCalledWith(123);
    });
    it('returns accepted or terminal rejection using only fixed service outcomes', async () => {
        expect(await (await send()).json()).toEqual({ outcome: 'accepted', reason: 'receipt' });
        deliver.mockResolvedValueOnce({ outcome: 'rejected', reason: 'http_status' });
        const response = await send();
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ outcome: 'rejected', reason: 'http_status' });
    });
});
