import crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as GithubAppWebhookRouting from './github-app-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

const APP_ID = '12345';
const PRIVATE_KEY_RAW = 'test-private-key';
const PRIVATE_KEY_B64 = Buffer.from(PRIVATE_KEY_RAW).toString('base64');
const APP_LINK = 'https://github.com/apps/test-app';

function makeSignature(rawBody: string): string {
    const hash = `${APP_ID}${PRIVATE_KEY_RAW}${APP_LINK}`;
    const secret = crypto.createHash('sha256').update(hash).digest('hex');
    const sig = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
    return `sha256=${sig}`;
}

function getIntegration() {
    return getTestConfig({
        provider: 'github-app',
        oauth_client_id: APP_ID,
        oauth_client_secret: PRIVATE_KEY_B64,
        app_link: APP_LINK,
        custom: { app_id: APP_ID, private_key: PRIVATE_KEY_B64 }
    } as any);
}

describe('Github App webhook routing', () => {
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

        const body = { action: 'opened', installation: { id: 1 } };
        const rawBody = JSON.stringify(body);
        const headers = { 'x-hub-signature-256': makeSignature(rawBody), 'x-github-event': 'issues' };

        const result = await GithubAppWebhookRouting.default(nangoMock as unknown as InternalNango, headers as any, body, rawBody);

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

        const body = { action: 'opened' };
        const rawBody = JSON.stringify(body);

        const result = await GithubAppWebhookRouting.default(nangoMock as unknown as InternalNango, {} as any, body, rawBody);

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

        const body = { action: 'opened' };
        const rawBody = JSON.stringify(body);
        const headers = { 'x-hub-signature-256': 'sha256=invalid' };

        const result = await GithubAppWebhookRouting.default(nangoMock as unknown as InternalNango, headers as any, body, rawBody);

        expect(result.isErr()).toBe(true);
        expect(result.isErr() && (result.error as any).type).toBe('webhook_invalid_signature');
        expect(mock).not.toHaveBeenCalled();
    });

    it('does not throw on length-mismatch signature', async () => {
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

        const body = { action: 'opened' };
        const rawBody = JSON.stringify(body);
        const headers = { 'x-hub-signature-256': 'short' };

        const result = await GithubAppWebhookRouting.default(nangoMock as unknown as InternalNango, headers as any, body, rawBody);

        expect(result.isErr()).toBe(true);
        expect(mock).not.toHaveBeenCalled();
    });
});
