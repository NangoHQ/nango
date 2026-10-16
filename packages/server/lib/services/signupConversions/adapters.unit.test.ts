import { afterEach, describe, expect, it, vi } from 'vitest';

import { createConversionAdapters } from './adapters.js';
import { isProductionSignup } from './worker.js';

import type { SignupAdvertisingPermission } from '@nangohq/types';

vi.mock('@nangohq/shared', () => ({ getSignupAdvertisingPermission: vi.fn() }));
const timestamp = new Date('2026-10-16T09:00:00Z');
const permission: SignupAdvertisingPermission = {
    signupAt: timestamp,
    context: {
        browser: { sourceUrl: 'https://app.nango.dev/signup', userAgent: 'Original browser' },
        meta: { fbclid: 'actual-click', observedAt: '2026-10-16T08:00:00Z', source: 'landing_query' },
        google: { ids: { gclid: 'google-click' }, observedAt: '2026-10-16T08:00:00Z', source: 'landing_query' },
        chatgpt: { oppref: 'opaque+/=', observedAt: '2026-10-16T08:00:00Z', source: 'landing_query' },
        reddit: { rdt_cid: 'reddit+/=', observedAt: '2026-10-16T08:00:00Z', source: 'landing_query' }
    },
    consent: {
        choice: {
            method: 'explicit',
            preferences: false,
            statistics: true,
            marketing: true,
            globalPrivacyControl: false,
            regulations: { gdprApplies: true, lgpdApplies: false, ccpaApplies: false }
        },
        revision: 1,
        observedAt: timestamp,
        source: 'cookiebot',
        mappingVersion: 'cookiebot-regional-marketing-v2',
        basis: 'explicit',
        adStorage: 'granted',
        adUserData: 'granted',
        adPersonalization: 'granted'
    }
};
const common = { startAt: '2026-10-16T00:00:00Z', token: 'local-test-secret', pixelId: 'test-pixel' };
const googleConfig = {
    platform: 'google',
    startAt: common.startAt,
    accountId: '123',
    loginAccountId: '456',
    conversionId: '789',
    clientId: 'test-client',
    clientSecret: 'test-secret',
    refreshToken: 'test-refresh'
};
function required<T>(value: T | undefined): T {
    if (value === undefined) throw new Error('Missing test fixture');
    return value;
}
const adapter = (platform: 'meta' | 'chatgpt' | 'reddit') =>
    required(createConversionAdapters(JSON.stringify([{ ...common, platform, ...(platform === 'meta' ? { version: 'v25.0' } : {}) }]))[0]);
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => {
    vi.unstubAllGlobals();
});

describe('conversion adapters', () => {
    it('builds Meta with original click observation, browser, outcome time and stable identity', () => {
        expect(adapter('meta').prepare(42, permission)).toEqual({
            data: [
                {
                    event_name: 'CompleteRegistration',
                    event_time: timestamp.getTime() / 1000,
                    event_id: 'nango:account_create:42',
                    action_source: 'website',
                    event_source_url: 'https://app.nango.dev/signup',
                    user_data: { client_user_agent: 'Original browser', fbc: `fb.1.${Date.parse('2026-10-16T08:00:00Z')}.actual-click` }
                }
            ]
        });
    });
    it('puts ChatGPT oppref at event level and Reddit conversion_id in metadata', () => {
        expect(adapter('chatgpt').prepare(42, permission)).toMatchObject({
            events: [
                {
                    oppref: 'opaque+/=',
                    id: 'nango:account_create:42',
                    timestamp_ms: timestamp.getTime(),
                    data: { type: 'customer_action' },
                    user: { user_agent: 'Original browser' }
                }
            ]
        });
        expect(adapter('reddit').prepare(42, permission)).toMatchObject({
            data: { events: [{ click_id: 'reddit+/=', type: { tracking_type: 'SIGN_UP' }, metadata: { conversion_id: 'nango:account_create:42' } }] }
        });
    });
    it('never manufactures IDs, accepts future observations or substitutes browser context', () => {
        for (const platform of ['meta', 'chatgpt', 'reddit'] as const) {
            const missing = structuredClone(permission);
            delete missing.context[platform];
            expect(adapter(platform).prepare(42, missing)).toBeNull();
            const future = structuredClone(permission);
            required(future.context[platform]).observedAt = '2026-10-17T09:00:00Z';
            expect(adapter(platform).prepare(42, future)).toBeNull();
            const browser = structuredClone(permission);
            delete browser.context.browser;
            expect(adapter(platform).prepare(42, browser)).toBeNull();
        }
    });
    it('fails closed for unsupported X, duplicate destinations and invalid secrets without echoing configuration', () => {
        expect(() => createConversionAdapters('[]')).toThrow('Invalid signup conversion configuration');
        expect(() => createConversionAdapters(JSON.stringify([{ ...common, platform: 'x' }]))).toThrow('Invalid signup conversion configuration');
        expect(() =>
            createConversionAdapters(
                JSON.stringify([
                    { ...common, platform: 'reddit' },
                    { ...common, platform: 'reddit' }
                ])
            )
        ).toThrow();
        expect(() => createConversionAdapters('local-test-secret')).toThrow('Invalid signup conversion configuration');
    });
    it('requires an exact production source URL and a recent original outcome', () => {
        expect(isProductionSignup(permission, timestamp)).toBe(true);
        expect(isProductionSignup(permission, new Date(timestamp.getTime() + 86_400_000))).toBe(false);
        expect(isProductionSignup(permission, new Date(timestamp.getTime() - 1))).toBe(false);
        for (const sourceUrl of [
            'https://app.nango.dev/signup?token=secret',
            'https://app.nango.dev.evil/signup',
            'https://api.nango.dev/signup',
            'https://app-development.nango.dev/signup'
        ]) {
            expect(isProductionSignup({ ...permission, context: { ...permission.context, browser: { sourceUrl, userAgent: 'Browser' } } }, timestamp)).toBe(
                false
            );
        }
    });
    it('requires a single Meta ingestion acknowledgement and bounds transport', async () => {
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockResolvedValueOnce(response({ events_received: 1, fbtrace_id: 'receipt' }))
            .mockResolvedValueOnce(response({ events_received: 0 }))
            .mockResolvedValueOnce(response({ error: { code: 190 } }, 401))
            .mockResolvedValueOnce(response({}, 429))
            .mockResolvedValueOnce(response({}, 500));
        vi.stubGlobal('fetch', fetch);
        const meta = adapter('meta');
        expect(await meta.send({})).toEqual({ status: 'accepted', receiptId: 'receipt' });
        expect(await meta.send({})).toEqual({ status: 'retry', reason: 'unconfirmed' });
        expect(await meta.send({})).toEqual({ status: 'failed', reason: 'configuration' });
        expect(await meta.send({})).toEqual({ status: 'retry', reason: 'rate_limit' });
        expect(await meta.send({})).toEqual({ status: 'retry', reason: 'server_error' });
        expect(fetch.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
        expect(fetch.mock.calls[0]?.[1]?.redirect).toBe('error');
        expect(fetch.mock.calls[0]?.[0]).not.toContain('local-test-secret');
    });
    it('uses Google OAuth before dispatch and distinguishes request acceptance from final processing', async () => {
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockResolvedValueOnce(response({ access_token: 'local-access', expires_in: 3600 }))
            .mockResolvedValueOnce(response({ requestId: 'request-1' }))
            .mockResolvedValueOnce(response({ requestStatusPerDestination: [{ requestStatus: 'PROCESSING' }] }))
            .mockResolvedValueOnce(response({ requestStatusPerDestination: [{ requestStatus: 'SUCCESS', eventsIngestionStatus: { recordCount: '1' } }] }))
            .mockResolvedValueOnce(
                response({ requestStatusPerDestination: [{ requestStatus: 'PARTIAL_SUCCESS', eventsIngestionStatus: { recordCount: '1' } }] })
            );
        vi.stubGlobal('fetch', fetch);
        const google = required(createConversionAdapters(JSON.stringify([googleConfig]))[0]);
        expect(await google.send({})).toEqual({ status: 'failed', reason: 'configuration' });
        await required(google.connect)();
        const payload = google.prepare(42, permission);
        expect(payload).toMatchObject({
            events: [{ adIdentifiers: { gclid: 'google-click' }, transactionId: 'nango:account_create:42', eventTimestamp: timestamp.toISOString() }]
        });
        expect(await google.send(payload)).toEqual({ status: 'submitted', receiptId: 'request-1' });
        expect(await required(google.checkReceipt)('request-1')).toEqual({ status: 'retry', reason: 'unconfirmed' });
        expect(await required(google.checkReceipt)('request-1')).toEqual({ status: 'accepted', receiptId: 'request-1' });
        expect(await required(google.checkReceipt)('request-1')).toEqual({ status: 'failed', reason: 'rejected' });
        await required(google.connect)();
        expect(fetch).toHaveBeenCalledTimes(5);
    });
    it('does not equate Google missing diagnostics or unexpected record counts with success', async () => {
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockResolvedValueOnce(response({ access_token: 'local-access', expires_in: 3600 }))
            .mockResolvedValueOnce(response({ requestStatusPerDestination: [{ requestStatus: 'SUCCESS', eventsIngestionStatus: { recordCount: 2 } }] }));
        vi.stubGlobal('fetch', fetch);
        const google = required(createConversionAdapters(JSON.stringify([googleConfig]))[0]);
        await required(google.connect)();
        expect(await required(google.checkReceipt)('request')).toEqual({ status: 'retry', reason: 'unconfirmed' });
    });
});

it('distinguishes transient Google processing failures from duplicate and permanent failures', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(response({ access_token: 'local-access', expires_in: 3600 }));
    const google = required(createConversionAdapters(JSON.stringify([googleConfig]))[0]);
    vi.stubGlobal('fetch', fetch);
    await required(google.connect)();
    for (const reason of [
        'PROCESSING_ERROR_REASON_TOO_RECENT_CLICK',
        'PROCESSING_ERROR_REASON_DESTINATION_TOO_RECENTLY_CREATED',
        'PROCESSING_ERROR_REASON_INTERNAL_ERROR'
    ]) {
        fetch.mockResolvedValueOnce(response({ requestStatusPerDestination: [{ requestStatus: 'FAILED', errorInfo: { errorCounts: [{ reason }] } }] }));
        expect(await required(google.checkReceipt)('request-1')).toEqual({ status: 'retry_ingestion', reason: 'processing_delay' });
    }
    fetch.mockResolvedValueOnce(
        response({
            requestStatusPerDestination: [
                { requestStatus: 'FAILED', errorInfo: { errorCounts: [{ reason: 'PROCESSING_ERROR_REASON_DUPLICATE_TRANSACTION_ID' }] } }
            ]
        })
    );
    expect(await required(google.checkReceipt)('request-1')).toEqual({ status: 'duplicate', receiptId: 'request-1' });
    fetch.mockResolvedValueOnce(
        response({
            requestStatusPerDestination: [
                {
                    requestStatus: 'FAILED',
                    errorInfo: {
                        errorCounts: [{ reason: 'PROCESSING_ERROR_REASON_INTERNAL_ERROR' }, { reason: 'PROCESSING_ERROR_REASON_INVALID_CONVERSION_ACTION' }]
                    }
                }
            ]
        })
    );
    expect(await required(google.checkReceipt)('request-1')).toEqual({ status: 'failed', reason: 'rejected' });
});
