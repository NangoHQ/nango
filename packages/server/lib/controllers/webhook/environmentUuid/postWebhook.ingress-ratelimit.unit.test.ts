import { randomUUID } from 'node:crypto';

import express from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';

import { accountService, configService, connectionService, externalWebhookService, seeders } from '@nangohq/shared';

import { envs } from '../../../env.js';
import { publicAPI } from '../../../routes.public.js';

import type { Server } from 'node:http';

/**
 * Security spec for public webhook ingress. These tests fail while the limiter
 * fail-opens and while unknown environment ids can each drive an account lookup.
 *
 * Unknown environment ids (any id the account store has not already confirmed)
 * share one lookup budget per window. That budget is far below the per-integration
 * allowance so a scan of fresh UUIDs cannot fan out into the account store.
 * A known environment keeps the higher per-integration allowance, including across
 * provider config keys. Crossing either budget returns 429 and does not look the
 * account up or continue into signature checks and webhook dispatch.
 */
const MAX_UNKNOWN_ENVIRONMENT_LOOKUPS = 20;

const SIGNED_ENV = '11111111-1111-4111-8111-111111111111';
const OPEN_ENV = '22222222-2222-4222-8222-222222222222';
const MULTI_ENV = '33333333-3333-4333-8333-333333333333';
const FLOOD_ENV = '44444444-4444-4444-8444-444444444444';

const SIGNED_KEY = 'signed-integration';
const OPEN_KEY = 'open-integration';
const FLOOD_KEY = 'open-flood';

const PLACEHOLDER_OAUTH_CLIENT_ID = 'placeholder-oauth-client-id';
const PLACEHOLDER_OAUTH_CLIENT_SECRET = Buffer.from('placeholder-oauth-client-secret', 'ascii').toString('base64');
const PLACEHOLDER_APP_LINK = 'https://example.com/apps/placeholder';

const body = { action: 'opened', installation: { id: 42 } };

const team = seeders.getTestTeam();
const environmentFor = (uuid: string) => seeders.getTestEnvironment({ id: 1, uuid, account_id: team.id });

function integration(providerConfigKey: string, allowUnverified: boolean): NonNullable<Awaited<ReturnType<typeof configService.getProviderConfig>>> {
    return seeders.getTestConfig({
        id: 42,
        unique_key: providerConfigKey,
        provider: 'github-app',
        environment_id: 1,
        oauth_client_id: PLACEHOLDER_OAUTH_CLIENT_ID,
        oauth_client_secret: PLACEHOLDER_OAUTH_CLIENT_SECRET,
        app_link: PLACEHOLDER_APP_LINK,
        allow_unverified_webhooks: allowUnverified,
        forward_webhooks: false
    }) as NonNullable<Awaited<ReturnType<typeof configService.getProviderConfig>>>;
}

const signedIntegration = integration(SIGNED_KEY, false);

function nonV4Uuid(n: number): string {
    // Version nibble is 1 and the variant nibble is 8, so zod's uuid() accepts it
    // and the ingress middleware's version-4 check does not.
    return `11111111-1111-1111-8111-${n.toString(16).padStart(12, '0')}`;
}

describe('public webhook ingress rate limit', () => {
    let server: Server;
    let url: string;
    const lookups: string[] = [];
    let accountLookup: ReturnType<typeof vi.spyOn>;
    let providerConfigLookup: ReturnType<typeof vi.spyOn>;
    let connectionLookups = 0;
    let connectionLookup: ReturnType<typeof vi.spyOn>;
    let webhookSettingsLookup: ReturnType<typeof vi.spyOn>;

    beforeAll(async () => {
        const app = express();
        app.use(publicAPI);
        await new Promise<void>((resolve) => {
            server = app.listen(0, '127.0.0.1', () => resolve());
        });
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        url = `http://127.0.0.1:${port}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
        });
    });

    beforeEach(() => {
        lookups.length = 0;
        connectionLookups = 0;
        accountLookup = vi.spyOn(accountService, 'getAccountContext').mockImplementation((opts) => {
            if (!('environmentUuid' in opts)) {
                return null;
            }
            lookups.push(opts.environmentUuid);
            if (
                opts.environmentUuid === SIGNED_ENV ||
                opts.environmentUuid === OPEN_ENV ||
                opts.environmentUuid === MULTI_ENV ||
                opts.environmentUuid === FLOOD_ENV
            ) {
                return {
                    account: team,
                    environment: environmentFor(opts.environmentUuid),
                    plan: null,
                    secret: { secret: 'placeholder-not-a-credential' }
                } as NonNullable<Awaited<ReturnType<typeof accountService.getAccountContext>>>;
            }
            return null;
        });
        providerConfigLookup = vi.spyOn(configService, 'getProviderConfig').mockImplementation((providerConfigKey: string) => {
            if (providerConfigKey === SIGNED_KEY) {
                return signedIntegration;
            }
            if (providerConfigKey === OPEN_KEY || providerConfigKey === FLOOD_KEY || providerConfigKey.startsWith('key-')) {
                return integration(providerConfigKey, true);
            }
            return null;
        });
        connectionLookup = vi.spyOn(connectionService, 'findConnectionsByConnectionConfigValue').mockImplementation(() => {
            connectionLookups += 1;
            return Promise.resolve(null);
        });
        webhookSettingsLookup = vi.spyOn(externalWebhookService, 'get').mockResolvedValue(null);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    async function post(environmentUuid: string, providerConfigKey: string, headers?: Record<string, string>) {
        const res = await fetch(`${url}/webhook/${environmentUuid}/${providerConfigKey}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...headers },
            body: JSON.stringify(body)
        });
        const text = await res.text();
        let json: unknown = null;
        if (text) {
            json = JSON.parse(text) as unknown;
        }
        return { status: res.status, json, headers: res.headers };
    }

    it('runs signature checks and accepted webhook work under the cap', async () => {
        expect(envs.NANGO_WEBHOOK_INGRESS_RATE_LIMIT_PER_MIN).toBeGreaterThan(MAX_UNKNOWN_ENVIRONMENT_LOOKUPS);

        const rejected = await post(SIGNED_ENV, SIGNED_KEY, { 'x-hub-signature-256': 'sha256=deadbeef' });
        expect(rejected.status).toBe(401);
        expect(rejected.json).toEqual({ error: 'Invalid webhook signature' });
        expect(accountLookup).toHaveBeenCalledWith({ environmentUuid: SIGNED_ENV });
        expect(providerConfigLookup).toHaveBeenCalledWith(SIGNED_KEY, environmentFor(SIGNED_ENV).id);
        expect(connectionLookup).not.toHaveBeenCalled();

        const accepted = await post(OPEN_ENV, OPEN_KEY);
        expect(accepted.status).toBe(200);
        expect(accepted.json).toEqual({ status: 'success' });
        expect(accountLookup).toHaveBeenCalledWith({ environmentUuid: OPEN_ENV });
        expect(connectionLookup).toHaveBeenCalledOnce();
        expect(webhookSettingsLookup).toHaveBeenCalledOnce();
    });

    it('lets one known environment use more provider keys than the unknown-environment lookup cap', async () => {
        for (let i = 0; i < MAX_UNKNOWN_ENVIRONMENT_LOOKUPS + 1; i++) {
            const res = await post(MULTI_ENV, `key-${i}`);
            expect(res.status, JSON.stringify(res.json)).not.toBe(429);
            expect(res.status).toBe(200);
        }
        expect(lookups.filter((uuid) => uuid === MULTI_ENV).length).toBe(MAX_UNKNOWN_ENVIRONMENT_LOOKUPS + 1);
    });

    it('stops account lookup and webhook dispatch once the per-integration cap is exceeded', async () => {
        const limit = envs.NANGO_WEBHOOK_INGRESS_RATE_LIMIT_PER_MIN;
        expect(limit).toBeGreaterThan(MAX_UNKNOWN_ENVIRONMENT_LOOKUPS);

        let lastAllowed: Awaited<ReturnType<typeof post>> | undefined;
        for (let i = 0; i < limit; i++) {
            lastAllowed = await post(FLOOD_ENV, FLOOD_KEY);
            expect(lastAllowed.status, `request ${i + 1}: ${JSON.stringify(lastAllowed.json)}`).toBe(200);
        }
        expect(lastAllowed?.headers.get('x-ratelimit-remaining')).toBe('0');

        const lookupsBeforeBreach = lookups.length;
        const connectionsBeforeBreach = connectionLookups;
        const breached = await post(FLOOD_ENV, FLOOD_KEY);
        const breachHeaders = {
            limit: breached.headers.get('x-ratelimit-limit'),
            remaining: breached.headers.get('x-ratelimit-remaining'),
            retryAfter: breached.headers.get('retry-after')
        };

        expect(breached.status, JSON.stringify(breachHeaders)).toBe(429);
        expect(breached.json).toEqual({ error: { code: 'too_many_request' } });
        expect(Number(breachHeaders.retryAfter)).toBeGreaterThanOrEqual(1);
        expect(lookupsBeforeBreach).toBeGreaterThanOrEqual(limit);
        expect(lookups.length).toBe(lookupsBeforeBreach);
        expect(connectionLookups).toBe(connectionsBeforeBreach);
        expect(lookups.every((uuid) => uuid === FLOOD_ENV)).toBe(true);
    }, 180_000);

    it('does not give every unknown environment id its own account-lookup budget', async () => {
        const sample = nonV4Uuid(1);
        expect(z.string().uuid().safeParse(sample).success).toBe(true);

        const burst = [
            ...Array.from({ length: MAX_UNKNOWN_ENVIRONMENT_LOOKUPS + 1 }, () => randomUUID()),
            ...Array.from({ length: MAX_UNKNOWN_ENVIRONMENT_LOOKUPS + 1 }, (_, i) => nonV4Uuid(i + 1))
        ];

        const responses = [];
        for (const environmentUuid of burst) {
            responses.push({ environmentUuid, ...(await post(environmentUuid, 'unknown-integration')) });
        }

        const lookedUp = new Set(lookups);
        expect(lookups.length).toBeLessThanOrEqual(MAX_UNKNOWN_ENVIRONMENT_LOOKUPS);
        for (const response of responses) {
            if (response.status === 429) {
                expect(lookedUp.has(response.environmentUuid)).toBe(false);
                expect(response.json).toEqual({ error: { code: 'too_many_request' } });
            }
        }
        const last = responses.at(-1);
        expect(last).toBeDefined();
        if (!last) {
            return;
        }
        expect(last.status).toBe(429);
        expect(lookedUp.has(last.environmentUuid)).toBe(false);
    });
});
