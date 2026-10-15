import { createServer } from 'node:http';

import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { advertisingConsentAPI } from './routes.advertising-consent.js';

const state = vi.hoisted(() => ({ enabled: true, read: vi.fn(), record: vi.fn() }));
vi.mock('@nangohq/shared', () => ({
    consentOwnerHash: (token: string) => `hash-${token}`,
    readAdvertisingConsent: state.read,
    recordAdvertisingConsent: state.record
}));
vi.mock('@nangohq/utils', () => ({ isLocal: false }));
vi.mock('./middleware/ratelimit.middleware.js', () => ({ rateLimiterMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('./services/advertisingConsent.service.js', () => ({
    advertisingConsentCookie: '__Host-nango_ad_consent',
    advertisingConsentConfig: () => (state.enabled ? { origins: ['https://nango.dev'], lifetimeMs: 60000 } : null),
    readConsentOwner: () => undefined
}));

const app = express();
app.use(advertisingConsentAPI);
const server = createServer((req, res) => {
    void app(req, res);
});
let url: string;
const body = {
    expectedRevision: null,
    choice: {
        preferences: false,
        statistics: false,
        marketing: false,
        method: 'explicit',
        globalPrivacyControl: false,
        regulations: { gdprApplies: true, lgpdApplies: false, ccpaApplies: false }
    }
};
beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test address');
    url = `http://127.0.0.1:${address.port}/api/v1/advertising-consent`;
});
afterAll(async () => {
    if (!server.listening) return;
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});
beforeEach(() => {
    state.enabled = true;
    vi.clearAllMocks();
    state.record.mockResolvedValue({ revision: 1 });
});

describe('advertising consent API boundaries', () => {
    it('is off unless configured and rejects absent or untrusted origins', async () => {
        expect((await fetch(url)).status).toBe(403);
        expect((await fetch(url, { headers: { Origin: 'https://nango.dev.attacker.test' } })).status).toBe(403);
        state.enabled = false;
        expect((await fetch(url, { headers: { Origin: 'https://nango.dev' } })).status).toBe(404);
        expect(state.read).not.toHaveBeenCalled();
    });
    it('accepts only preflighted JSON writes', async () => {
        expect(
            (await fetch(url, { method: 'POST', headers: { Origin: 'https://nango.dev', 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })).status
        ).toBe(415);
        const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://nango.dev' } });
        expect(preflight.status).toBe(204);
        expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://nango.dev');
        expect(preflight.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });
    it('does not accept forged record identifiers or unbounded click IDs', async () => {
        for (const extra of [{ id: 'forged' }, { clickIds: { gclid: 'a'.repeat(513) } }, { clickIds: { email: 'private@example.com' } }]) {
            const response = await fetch(url, {
                method: 'POST',
                headers: { Origin: 'https://nango.dev', 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...body, ...extra })
            });
            expect(response.status).toBe(400);
        }
        expect(state.record).not.toHaveBeenCalled();
    });
    it('sets a host-only secure HttpOnly cookie and returns only the revision', async () => {
        const response = await fetch(url, {
            method: 'POST',
            headers: { Origin: 'https://nango.dev', 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        expect(response.status).toBe(200);
        const cookie = response.headers.get('Set-Cookie');
        if (!cookie) throw new Error('Missing owner cookie');
        expect(cookie).toContain('__Host-nango_ad_consent=');
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('Secure');
        expect(cookie).toContain('SameSite=Lax');
        expect(cookie).not.toContain('Domain=');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(await response.json()).toEqual({ data: { revision: 1 } });
    });
    it('overrides an allowed body when the HTTP request carries GPC', async () => {
        const response = await fetch(url, {
            method: 'POST',
            headers: { Origin: 'https://nango.dev', 'Content-Type': 'application/json', 'Sec-GPC': '1' },
            body: JSON.stringify({
                ...body,
                choice: { ...body.choice, method: 'implied', marketing: true, regulations: { gdprApplies: false, lgpdApplies: false, ccpaApplies: true } },
                clickIds: { gclid: 'blocked' }
            })
        });
        expect(response.status).toBe(200);
        expect(state.record.mock.calls[0]?.[0]).toMatchObject({ choice: { globalPrivacyControl: true, method: 'implied' } });
    });

    it('requires known typed regional and GPC fields instead of accepting a client permission flag', async () => {
        for (const choice of [
            { ...body.choice, regulations: undefined },
            { ...body.choice, globalPrivacyControl: undefined },
            { ...body.choice, allowed: true }
        ]) {
            const response = await fetch(url, {
                method: 'POST',
                headers: { Origin: 'https://nango.dev', 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...body, choice })
            });
            expect(response.status).toBe(400);
        }
        expect(state.record).not.toHaveBeenCalled();
    });

    it('returns conflict for stale grants and unavailable for failed storage', async () => {
        state.record.mockResolvedValueOnce(null);
        const options = { method: 'POST', headers: { Origin: 'https://nango.dev', 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
        expect((await fetch(url, options)).status).toBe(409);
        state.record.mockRejectedValueOnce(new Error('offline'));
        expect((await fetch(url, options)).status).toBe(503);
    });
});
