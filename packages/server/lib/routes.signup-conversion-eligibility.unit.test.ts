import { createServer } from 'node:http';

import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { signupConversionEligibilityAPI } from './routes.signup-conversion-eligibility.js';

import type * as Utils from '@nangohq/utils';

const state = vi.hoisted(() => ({
    lookup: vi.fn(),
    error: vi.fn(),
    envs: {
        NANGO_CLOUD: true,
        NODE_ENV: 'production',
        ADVERTISING_CONSENT_ENABLED: true,
        SIGNUP_AD_ELIGIBILITY_ENABLED: true,
        SIGNUP_AD_ELIGIBILITY_TOKEN: 'a'.repeat(64),
        SIGNUP_AD_ELIGIBILITY_START_AT: '2026-10-16T00:00:00Z'
    }
}));
vi.mock('./env.js', () => ({ envs: state.envs }));
vi.mock('@nangohq/utils', async (importOriginal) => ({
    ...(await importOriginal<typeof Utils>()),
    getLogger: () => ({ error: state.error })
}));
vi.mock('./services/signupConversions/eligibility.js', () => ({ getConversionEligibility: state.lookup }));
vi.mock('./middleware/ratelimit.middleware.js', () => ({ rateLimiterMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));

const app = express();
app.use(signupConversionEligibilityAPI);
const server = createServer((req, res) => void app(req, res));
let url: string;
const body = { accountId: 42, creatorId: 7, platform: 'meta' };
const headers = { Authorization: `Bearer ${'a'.repeat(64)}`, 'Content-Type': 'application/json' };
const post = (value: unknown = body, requestHeaders = headers) => fetch(url, { method: 'POST', headers: requestHeaders, body: JSON.stringify(value) });

beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test address');
    url = `http://127.0.0.1:${address.port}/internal/signup-conversion-eligibility`;
});
afterAll(async () => {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});
beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(state.envs, {
        NANGO_CLOUD: true,
        NODE_ENV: 'production',
        ADVERTISING_CONSENT_ENABLED: true,
        SIGNUP_AD_ELIGIBILITY_ENABLED: true,
        SIGNUP_AD_ELIGIBILITY_TOKEN: 'a'.repeat(64),
        SIGNUP_AD_ELIGIBILITY_START_AT: '2026-10-16T00:00:00Z'
    });
    state.lookup.mockResolvedValue({ eligible: false });
});

describe('conversion eligibility endpoint', () => {
    it.each([
        { SIGNUP_AD_ELIGIBILITY_ENABLED: false },
        { SIGNUP_AD_ELIGIBILITY_TOKEN: '' },
        { SIGNUP_AD_ELIGIBILITY_TOKEN: 'short' },
        { SIGNUP_AD_ELIGIBILITY_START_AT: '' },
        { SIGNUP_AD_ELIGIBILITY_START_AT: 'invalid' },
        { NANGO_CLOUD: false },
        { NODE_ENV: 'development' },
        { ADVERTISING_CONSENT_ENABLED: false }
    ])('does not expose data when disabled or incompletely configured: %j', async (config) => {
        Object.assign(state.envs, config);
        expect((await post()).status).toBe(404);
        expect(state.lookup).not.toHaveBeenCalled();
    });

    it('rejects missing, wrong and general internal credentials before reading the database', async () => {
        for (const authorization of ['', 'Bearer wrong', 'Bearer general-internal-key', `Basic ${'a'.repeat(64)}`]) {
            expect((await post(body, { ...headers, Authorization: authorization })).status).toBe(401);
        }
        expect(state.lookup).not.toHaveBeenCalled();
    });

    it('rejects client-provided consent, click IDs, timestamps, unsupported platforms and unbounded input', async () => {
        for (const value of [
            { ...body, eligible: true },
            { ...body, clickId: 'forged' },
            { ...body, signupAt: '2026-10-16T00:00:00Z' },
            { ...body, platform: 'google' },
            { ...body, accountId: '42' },
            { ...body, creatorId: -1 }
        ]) {
            expect((await post(value)).status).toBe(400);
        }
        expect((await post({ ...body, padding: 'x'.repeat(2048) })).status).toBe(413);
        expect((await post(body, { ...headers, 'Content-Type': 'text/plain' })).status).toBe(415);
        expect(state.lookup).not.toHaveBeenCalled();
    });

    it('reads again for every request and never caches a previous eligible result', async () => {
        state.lookup.mockResolvedValueOnce({ eligible: true, eventId: 'nango:account_create:42' }).mockResolvedValueOnce({ eligible: false });
        const first = await post();
        expect(first.status).toBe(200);
        expect(first.headers.get('Cache-Control')).toBe('no-store');
        expect(first.headers.get('Access-Control-Allow-Origin')).toBeNull();
        expect(await first.json()).toMatchObject({ eligible: true });
        expect(await (await post()).json()).toEqual({ eligible: false });
        expect(state.lookup).toHaveBeenCalledTimes(2);
        expect(state.lookup).toHaveBeenCalledWith(body, new Date(state.envs.SIGNUP_AD_ELIGIBILITY_START_AT));
    });

    it.each(['ECONNRESET', 'private-code'])('fails closed with redacted diagnostics for %s', async (code) => {
        state.lookup.mockRejectedValue(Object.assign(new Error('private database details'), { code }));
        const response = await post();
        expect(response.status).toBe(503);
        expect(await response.text()).not.toContain('private database details');
        expect(state.error).toHaveBeenCalledWith('Signup conversion eligibility lookup failed', {
            stage: 'eligibility',
            errorCode: code === 'ECONNRESET' ? code : 'unknown'
        });
        expect(JSON.stringify(state.error.mock.calls)).not.toMatch(/private|accountId|creatorId|Bearer/);
    });
});
