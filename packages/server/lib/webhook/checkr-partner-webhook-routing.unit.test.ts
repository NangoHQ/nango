import crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as CheckrPartnerWebhookRouting from './checkr-partner-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

const SECRET = 'test-checkr-webhook-secret';

function makeSignature(rawBody: string): string {
    return crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
}

function getIntegration(secret: string | null = SECRET) {
    return getTestConfig({
        provider: 'checkr',
        custom: secret ? { webhookSecret: secret } : {}
    });
}

describe('Checkr partner webhook routing', () => {
    it('routes a webhook with valid signature', async () => {
        const integration = getIntegration();
        const mock = vi.fn().mockResolvedValue({ connectionIds: ['conn-1'], connectionMetadata: {} });
        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock as any;

        const body = {
            id: '1',
            object: 'candidate',
            type: 'candidate.created',
            created_at: '2024-01-01',
            webhook_url: 'https://example.com',
            data: {},
            createdAt: '2024-01-01'
        };
        const rawBody = JSON.stringify(body);
        const headers = { 'x-checkr-signature': makeSignature(rawBody) };

        const result = await CheckrPartnerWebhookRouting.default(nangoMock as unknown as InternalNango, headers as any, body as any, rawBody);

        expect(result.isOk()).toBe(true);
        expect(mock).toHaveBeenCalledOnce();
    });

    it('rejects webhook with missing signature', async () => {
        const integration = getIntegration();
        const mock = vi.fn();
        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock as any;

        const body = {
            id: '1',
            object: 'candidate',
            type: 'candidate.created',
            created_at: '2024-01-01',
            webhook_url: 'https://example.com',
            data: {},
            createdAt: '2024-01-01'
        };
        const rawBody = JSON.stringify(body);

        const result = await CheckrPartnerWebhookRouting.default(nangoMock as unknown as InternalNango, {} as any, body as any, rawBody);

        expect(result.isErr()).toBe(true);
        expect(result.isErr() && (result.error as any).type).toBe('webhook_missing_signature');
        expect(mock).not.toHaveBeenCalled();
    });

    it('rejects webhook with invalid signature', async () => {
        const integration = getIntegration();
        const mock = vi.fn();
        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock as any;

        const body = {
            id: '1',
            object: 'candidate',
            type: 'candidate.created',
            created_at: '2024-01-01',
            webhook_url: 'https://example.com',
            data: {},
            createdAt: '2024-01-01'
        };
        const rawBody = JSON.stringify(body);
        const headers = { 'x-checkr-signature': 'invalid-signature' };

        const result = await CheckrPartnerWebhookRouting.default(nangoMock as unknown as InternalNango, headers as any, body as any, rawBody);

        expect(result.isErr()).toBe(true);
        expect(result.isErr() && (result.error as any).type).toBe('webhook_invalid_signature');
        expect(mock).not.toHaveBeenCalled();
    });

    it('rejects webhook with tampered body (signature mismatch)', async () => {
        const integration = getIntegration();
        const mock = vi.fn();
        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock as any;

        const body = {
            id: '1',
            object: 'candidate',
            type: 'candidate.created',
            created_at: '2024-01-01',
            webhook_url: 'https://example.com',
            data: {},
            createdAt: '2024-01-01'
        };
        const rawBody = JSON.stringify(body);
        const headers = { 'x-checkr-signature': makeSignature(rawBody) };

        // Tamper rawBody after signature was computed
        const result = await CheckrPartnerWebhookRouting.default(nangoMock as unknown as InternalNango, headers as any, body as any, rawBody + ' ');

        expect(result.isErr()).toBe(true);
        expect(mock).not.toHaveBeenCalled();
    });

    it('rejects when integration has no webhookSecret configured', async () => {
        const integration = getIntegration(null);
        const mock = vi.fn();
        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock as any;

        const body = {
            id: '1',
            object: 'candidate',
            type: 'candidate.created',
            created_at: '2024-01-01',
            webhook_url: 'https://example.com',
            data: {},
            createdAt: '2024-01-01'
        };
        const rawBody = JSON.stringify(body);
        const headers = { 'x-checkr-signature': makeSignature(rawBody) };

        const result = await CheckrPartnerWebhookRouting.default(nangoMock as unknown as InternalNango, headers as any, body as any, rawBody);

        expect(result.isErr()).toBe(true);
        expect(mock).not.toHaveBeenCalled();
    });

    it('does not throw on length-mismatch signature (timingSafeEqual guard)', async () => {
        const integration = getIntegration();
        const mock = vi.fn();
        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock as any;

        const body = {
            id: '1',
            object: 'candidate',
            type: 'candidate.created',
            created_at: '2024-01-01',
            webhook_url: 'https://example.com',
            data: {},
            createdAt: '2024-01-01'
        };
        const rawBody = JSON.stringify(body);
        const headers = { 'x-checkr-signature': 'short' };

        const result = await CheckrPartnerWebhookRouting.default(nangoMock as unknown as InternalNango, headers as any, body as any, rawBody);

        expect(result.isErr()).toBe(true);
        expect(mock).not.toHaveBeenCalled();
    });
});
