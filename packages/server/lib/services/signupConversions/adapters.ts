import { z } from 'zod';

import { conversionEventId } from './worker.js';

import type { ConversionAdapter, DeliveryResult } from './worker.js';
import type { SignupAdvertisingPermission } from '@nangohq/types';

const common = { startAt: z.iso.datetime().transform((s) => new Date(s)) };
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const secret = z.string().min(1).max(8192);
const configSchema = z
    .array(
        z.discriminatedUnion('platform', [
            z.object({ ...common, platform: z.literal('meta'), pixelId: id, version: z.string().regex(/^v\d+\.0$/), token: secret }).strict(),
            z.object({ ...common, platform: z.literal('chatgpt'), pixelId: id, token: secret }).strict(),
            z.object({ ...common, platform: z.literal('reddit'), pixelId: id, token: secret }).strict(),
            z
                .object({
                    ...common,
                    platform: z.literal('google'),
                    accountId: id,
                    loginAccountId: id,
                    conversionId: id,
                    clientId: secret,
                    clientSecret: secret,
                    refreshToken: secret
                })
                .strict()
        ])
    )
    .min(1)
    .max(4)
    .refine((items) => new Set(items.map((item) => item.platform)).size === items.length);

const object = z.record(z.string(), z.unknown());
const opaqueId = (value: unknown): value is string => typeof value === 'string' && value.length <= 512 && /^[\x21-\x7e]+$/.test(value);
const clickId = (value: unknown): value is string => typeof value === 'string' && value.length <= 512 && /^[A-Za-z0-9_.~-]+$/.test(value);
const receiptId = z.string().regex(/^[\x21-\x7e]{1,512}$/);

function validTouch(touch: { observedAt: string; source: string } | undefined, permission: SignupAdvertisingPermission): boolean {
    if (!touch || touch.source !== 'landing_query') return false;
    const observedAt = Date.parse(touch.observedAt);
    return Number.isFinite(observedAt) && observedAt > 0 && observedAt <= permission.signupAt.getTime();
}

async function request(url: string, token: string, body?: unknown): Promise<{ response: Response; data: Record<string, unknown> }> {
    const response = await fetch(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10_000),
        redirect: 'error'
    });
    let data: Record<string, unknown> = {};
    try {
        data = object.parse(await response.json());
    } catch {
        /* A malformed acknowledgement is not confirmed. */
    }
    return { response, data };
}

function httpFailure(response: Response): DeliveryResult | null {
    if (response.ok) return null;
    if (response.status === 429) return { status: 'retry', reason: 'rate_limit' };
    if (response.status >= 500 || response.status === 408) return { status: 'retry', reason: 'server_error' };
    return { status: 'failed', reason: response.status === 401 || response.status === 403 ? 'configuration' : 'rejected' };
}

/** Parses server-secret configuration only. Never expose parse errors containing configuration values. */
export function createConversionAdapters(raw: string): ConversionAdapter[] {
    let configs: z.infer<typeof configSchema>;
    try {
        configs = configSchema.parse(JSON.parse(raw));
    } catch {
        throw new Error('Invalid signup conversion configuration');
    }
    return configs.map((config): ConversionAdapter => {
        if (config.platform === 'google') {
            let accessToken: string | undefined;
            let tokenExpiresAt = 0;
            const destination = `${config.accountId}/${config.conversionId}`;
            return {
                platform: 'google',
                destination,
                startAt: config.startAt,
                async connect() {
                    if (accessToken && tokenExpiresAt > Date.now() + 60_000) return;
                    const response = await fetch('https://oauth2.googleapis.com/token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({
                            grant_type: 'refresh_token',
                            client_id: config.clientId,
                            client_secret: config.clientSecret,
                            refresh_token: config.refreshToken
                        }),
                        signal: AbortSignal.timeout(10_000),
                        redirect: 'error'
                    });
                    const parsed = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() }).safeParse(await response.json());
                    if (!response.ok || !parsed.success) throw new Error('Conversion authorization unavailable');
                    accessToken = parsed.data.access_token;
                    tokenExpiresAt = Date.now() + parsed.data.expires_in * 1000;
                },
                prepare(accountId, permission) {
                    const touch = permission.context.google;
                    if (!validTouch(touch, permission) || !touch) return null;
                    const ids = touch.ids;
                    if (!Object.values(ids).some(Boolean) || Object.values(ids).some((value) => !clickId(value))) return null;
                    return {
                        destinations: [
                            {
                                operatingAccount: { accountType: 'GOOGLE_ADS', accountId: config.accountId },
                                loginAccount: { accountType: 'GOOGLE_ADS', accountId: config.loginAccountId },
                                productDestinationId: config.conversionId
                            }
                        ],
                        consent: { adUserData: 'CONSENT_GRANTED', adPersonalization: 'CONSENT_GRANTED' },
                        events: [
                            {
                                adIdentifiers: ids,
                                eventTimestamp: permission.signupAt.toISOString(),
                                transactionId: conversionEventId(accountId),
                                eventSource: 'WEB'
                            }
                        ],
                        validateOnly: false
                    };
                },
                async send(payload) {
                    if (!accessToken) return { status: 'failed', reason: 'configuration' };
                    const { response, data } = await request('https://datamanager.googleapis.com/v1/events:ingest', accessToken, payload);
                    const failure = httpFailure(response);
                    if (failure) return failure;
                    const parsed = receiptId.safeParse(data['requestId']);
                    return parsed.success ? { status: 'submitted', receiptId: parsed.data } : { status: 'retry', reason: 'unconfirmed' };
                },
                async checkReceipt(requestId) {
                    if (!accessToken) return { status: 'failed', reason: 'configuration' };
                    const { response, data } = await request(
                        `https://datamanager.googleapis.com/v1/requestStatus:retrieve?requestId=${encodeURIComponent(requestId)}`,
                        accessToken
                    );
                    const failure = httpFailure(response);
                    if (failure) return failure;
                    const parsed = z
                        .array(
                            z.object({
                                requestStatus: z.string(),
                                errorInfo: z.object({ errorCounts: z.array(z.object({ reason: z.string() })) }).optional(),
                                eventsIngestionStatus: z.object({ recordCount: z.union([z.number(), z.string()]) }).optional()
                            })
                        )
                        .safeParse(data['requestStatusPerDestination']);
                    if (!parsed.success || parsed.data.length !== 1) return { status: 'retry', reason: 'unconfirmed' };
                    const result = parsed.data[0];
                    if (!result) return { status: 'retry', reason: 'unconfirmed' };
                    if (result.requestStatus === 'SUCCESS' && Number(result.eventsIngestionStatus?.recordCount) === 1)
                        return { status: 'accepted', receiptId: requestId };
                    if (result.requestStatus === 'FAILED' || result.requestStatus === 'PARTIAL_SUCCESS') {
                        const reasons = result.errorInfo?.errorCounts.map((error) => error.reason) ?? [];
                        if (reasons.length > 0 && reasons.every((reason) => reason === 'PROCESSING_ERROR_REASON_DUPLICATE_TRANSACTION_ID'))
                            return { status: 'duplicate', receiptId: requestId };
                        if (
                            reasons.length > 0 &&
                            reasons.every((reason) =>
                                [
                                    'PROCESSING_ERROR_REASON_TOO_RECENT_CLICK',
                                    'PROCESSING_ERROR_REASON_DESTINATION_TOO_RECENTLY_CREATED',
                                    'PROCESSING_ERROR_REASON_INTERNAL_ERROR'
                                ].includes(reason)
                            )
                        )
                            return { status: 'retry_ingestion', reason: 'processing_delay' };
                        return { status: 'failed', reason: 'rejected' };
                    }
                    return { status: 'retry', reason: 'unconfirmed' };
                }
            };
        }
        const { platform, pixelId, token } = config;
        return {
            platform,
            destination: pixelId,
            startAt: config.startAt,
            prepare(accountId, permission) {
                const { context, signupAt } = permission;
                const eventId = conversionEventId(accountId);
                const browser = context.browser;
                if (!browser?.sourceUrl || !browser.userAgent) return null;
                if (platform === 'meta') {
                    if (!validTouch(context.meta, permission) || !clickId(context.meta?.fbclid)) return null;
                    return {
                        data: [
                            {
                                event_name: 'CompleteRegistration',
                                event_time: Math.floor(signupAt.getTime() / 1000),
                                event_id: eventId,
                                action_source: 'website',
                                event_source_url: browser.sourceUrl,
                                user_data: { client_user_agent: browser.userAgent, fbc: `fb.1.${Date.parse(context.meta.observedAt)}.${context.meta.fbclid}` }
                            }
                        ]
                    };
                }
                if (platform === 'chatgpt') {
                    if (!validTouch(context.chatgpt, permission) || !opaqueId(context.chatgpt?.oppref)) return null;
                    return {
                        validate_only: false,
                        events: [
                            {
                                id: eventId,
                                type: 'registration_completed',
                                timestamp_ms: signupAt.getTime(),
                                oppref: context.chatgpt.oppref,
                                action_source: 'web',
                                source_url: browser.sourceUrl,
                                user: { user_agent: browser.userAgent },
                                data: { type: 'customer_action' }
                            }
                        ]
                    };
                }
                if (!validTouch(context.reddit, permission) || !opaqueId(context.reddit?.rdt_cid)) return null;
                return {
                    data: {
                        events: [
                            {
                                event_at: signupAt.getTime(),
                                action_source: 'WEBSITE',
                                type: { tracking_type: 'SIGN_UP' },
                                click_id: context.reddit.rdt_cid,
                                event_source_url: browser.sourceUrl,
                                user: { user_agent: browser.userAgent },
                                metadata: { conversion_id: eventId }
                            }
                        ]
                    }
                };
            },
            async send(payload) {
                const url =
                    platform === 'meta'
                        ? `https://graph.facebook.com/${config.platform === 'meta' ? config.version : ''}/${pixelId}/events`
                        : platform === 'chatgpt'
                          ? `https://bzr.openai.com/v1/events?pid=${encodeURIComponent(pixelId)}`
                          : `https://ads-api.reddit.com/api/v3/pixels/${pixelId}/conversion_events`;
                const { response, data } = await request(url, token, payload);
                if (platform === 'meta' && z.object({ is_transient: z.literal(true) }).safeParse(data['error']).success)
                    return { status: 'retry', reason: 'server_error' };
                const failure = httpFailure(response);
                if (failure) return failure;
                if (platform === 'meta') {
                    if (data['error']) return { status: 'failed', reason: 'rejected' };
                    if (data['events_received'] !== 1) return { status: 'retry', reason: 'unconfirmed' };
                    const parsed = receiptId.safeParse(data['fbtrace_id']);
                    return parsed.success ? { status: 'accepted', receiptId: parsed.data } : { status: 'accepted' };
                }
                // These APIs do not establish attribution in their synchronous response.
                // Record transport acceptance only; platform receipt/reporting is a rollout check.
                return { status: 'accepted' };
            }
        };
    });
}
