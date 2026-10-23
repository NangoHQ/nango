import OAuth from 'oauth-1.0a';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { deliverXSignup, parseXSignupEnvelope, xSignupPayload } from './xSignupConversion.js';

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
} as const;
const config = {
    pixelId: 'rh471',
    eventId: 'abc123',
    consumerKey: 'fake-key',
    consumerSecret: 'fake-secret',
    accessToken: 'fake-token',
    accessTokenSecret: 'fake-token-secret'
};
const start = '2026-10-23T00:00:00Z';
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('X completed account conversion', () => {
    afterEach(() => vi.restoreAllMocks());
    it('accepts external signup snapshot and keeps dedup/time stable across repeated attempts', () => {
        const valid = parseXSignupEnvelope(event, start, now);
        expect(valid).toEqual(event);
        expect(xSignupPayload(valid!, config.eventId)).toEqual({
            conversions: [
                { conversion_time: event.timestamp, event_id: 'abc123', identifiers: [{ twclid: 'testclick' }], conversion_id: 'nango:account_create:123' }
            ]
        });
        expect(xSignupPayload(valid!, config.eventId)).toEqual(xSignupPayload(valid!, config.eventId));
        expect(parseXSignupEnvelope({ ...event, consentMethod: 'implied' }, start, now)).toBeDefined();
        expect(parseXSignupEnvelope({ ...event, timestamp: '2026-10-23T07:00:00.000000+00:00' }, start, now)).toBeDefined();
    });
    it.each([
        { event: 'auth:user_create' },
        { event: 'auth:user_login' },
        { event: '$pageview' },
        { distinctId: 'user-123' },
        { companyId: '00123' },
        { companyId: '9007199254740992' },
        { surface: 'web' },
        { host: 'https://api-development.nango.dev' },
        { isSignupCreatorInternal: true },
        { isSignupCreatorInternal: undefined },
        { consentMethod: 'denied' },
        { consentTimestamp: undefined },
        { consentTimestamp: 'bad' },
        { consentTimestamp: '2026-10-23T07:00:01Z' },
        { consentTimestamp: '2026-10-22T07:00:00Z' },
        { clickTimestamp: '2026-10-23T07:00:01Z' },
        { clickTimestamp: '2026-10-22T07:00:00Z' },
        { clickId: undefined },
        { clickId: 'bad@email' },
        { clickId: 'a'.repeat(513) },
        { clickId: 'om_qa' },
        { clickId: 'synthetic_qa' },
        { utmCampaign: 'om_qa' },
        { isTestFixture: true },
        { email: 'PRIVATE_SENTINEL' },
        { timestamp: 'bad' }
    ])('rejects ineligible or injected data %j', (override) => expect(parseXSignupEnvelope({ ...event, ...override }, start, now)).toBeUndefined());
    it('requires fresh cutoff and bounded delivery age without backfill', () => {
        expect(parseXSignupEnvelope(event, 'bad', now)).toBeUndefined();
        expect(parseXSignupEnvelope(event, '2026-10-23T07:00:01Z', now)).toBeUndefined();
        expect(parseXSignupEnvelope(event, start, now - 2000)).toBeUndefined();
        expect(parseXSignupEnvelope(event, start, now + 86_400_000)).toBeUndefined();
    });
    it('uses maintained OAuth1 signer, known independent signature fixture and fixed JSON endpoint', async () => {
        vi.spyOn(OAuth.prototype, 'getNonce').mockReturnValue('fixed-nonce');
        vi.spyOn(OAuth.prototype, 'getTimeStamp').mockReturnValue(1792738800);
        const request = vi.fn<typeof fetch>().mockResolvedValue(response({ data: { conversions_processed: 1 } }));
        expect(await deliverXSignup(event, config, request)).toEqual({ outcome: 'accepted', reason: 'receipt' });
        expect(request).toHaveBeenCalledTimes(1);
        const [url, options] = request.mock.calls[0]!;
        expect(url).toBe('https://ads-api.x.com/12/measurement/conversions/rh471');
        expect(options?.redirect).toBe('error');
        expect(options?.signal).toBeInstanceOf(AbortSignal);
        const headers = options?.headers as Record<string, string>;
        // Fixture independently calculated with Python hmac/urllib using the OAuth1 signature base string.
        expect(headers['Authorization']).toContain('oauth_signature="BSwqVh0guI8lIanchP%2BRPSor5tE%3D"');
        expect(headers['Authorization']).toContain('oauth_signature_method="HMAC-SHA1"');
        expect(JSON.parse(options?.body as string)).toEqual(xSignupPayload(event, config.eventId));
        expect(options?.body).not.toContain('fake-secret');
    });
    it.each([400, 401, 403, 404, 408, 429, 503])('maps HTTP %s without leaking raw errors or making its own retry', async (status) => {
        const request = vi.fn<typeof fetch>().mockResolvedValue(response({ error: 'PRIVATE_SENTINEL' }, status));
        const result = await deliverXSignup(event, config, request);
        expect(result).toEqual({ outcome: status === 408 || status === 429 || status >= 500 ? 'retry' : 'rejected', reason: 'http_status' });
        expect(request).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(result)).not.toContain('PRIVATE_SENTINEL');
    });
    it.each([
        { data: { conversions_processed: 0 } },
        { data: { conversions_processed: 2 } },
        { data: { conversions_processed: '1' } },
        { data: { conversions_processed: 1 }, errors: [{ message: 'PRIVATE_SENTINEL' }] },
        { error: 'PRIVATE_SENTINEL' }
    ])('rejects incomplete or malformed receipts %j', async (body) => {
        expect(await deliverXSignup(event, config, vi.fn<typeof fetch>().mockResolvedValue(response(body)))).toEqual({
            outcome: 'retry',
            reason: 'invalid_receipt'
        });
    });
    it('bounds response bytes and sanitizes malformed bodies/timeouts/network exceptions', async () => {
        for (const body of ['{PRIVATE_SENTINEL']) {
            const result = await deliverXSignup(event, config, vi.fn<typeof fetch>().mockResolvedValue(new Response(body)));
            expect(result.outcome).toBe('retry');
            expect(JSON.stringify(result)).not.toContain('PRIVATE_SENTINEL');
        }
        const padded = JSON.stringify({ data: { conversions_processed: 1 }, padding: 'x'.repeat(8192) });
        expect(await deliverXSignup(event, config, vi.fn<typeof fetch>().mockResolvedValue(new Response(padded)))).toEqual({
            outcome: 'retry',
            reason: 'invalid_receipt'
        });
        const request = vi.fn<typeof fetch>().mockRejectedValue(new Error('PRIVATE_SENTINEL fake-secret'));
        expect(await deliverXSignup(event, config, request)).toEqual({ outcome: 'retry', reason: 'transport_or_response' });
        expect(request).toHaveBeenCalledTimes(1);
    });
    it.each(['ol288', 'tw-rh471-abc123'])(
        'preserves configured X event identifier %s without imposing an undocumented alphanumeric-only restriction',
        async (eventId) => {
            const request = vi.fn<typeof fetch>().mockResolvedValue(response({ data: { conversions_processed: 1 } }));
            expect((await deliverXSignup(event, { ...config, eventId }, request)).outcome).toBe('accepted');
            expect(JSON.parse(request.mock.calls[0]![1]!.body as string).conversions[0].event_id).toBe(eventId);
        }
    );
    it('refuses malformed config before signing or HTTP', async () => {
        for (const override of [{ pixelId: '../elsewhere' }, { eventId: '' }, { consumerSecret: '' }]) {
            const request = vi.fn<typeof fetch>();
            expect(await deliverXSignup(event, { ...config, ...override }, request)).toEqual({ outcome: 'rejected', reason: 'configuration' });
            expect(request).not.toHaveBeenCalled();
        }
    });
});
