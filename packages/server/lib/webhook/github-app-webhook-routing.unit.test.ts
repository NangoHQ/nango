import crypto from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { connectionService, seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as GithubAppWebhookRouting from './github-app-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

import type { NangoError } from '@nangohq/shared';

const flagMocks = vi.hoisted(() => ({ allowUnauthorizedGithubAppWebhook: vi.fn(), isGithubAppConnectionCredentialsEnabled: vi.fn() }));

vi.mock('@nangohq/feature-flags', () => ({
    getFlags: () => ({
        allowUnauthorizedGithubAppWebhook: flagMocks.allowUnauthorizedGithubAppWebhook,
        isGithubAppConnectionCredentialsEnabled: flagMocks.isGithubAppConnectionCredentialsEnabled
    })
}));

const APP_ID = '123456';
const PRIVATE_KEY = 'private-key';
const APP_LINK = 'https://github.com/apps/nango';
const REMEDIATION = 'Set the Nango webhook secret on the GitHub App';

const body = { action: 'opened', installation: { id: 42 } };
const rawBody = JSON.stringify(body);

function makeNango({ allowUnverified = false, emptyIntegration = false }: { allowUnverified?: boolean; emptyIntegration?: boolean } = {}) {
    const integration = getTestConfig({
        provider: 'github-app',
        allow_unverified_webhooks: allowUnverified,
        ...(emptyIntegration
            ? {}
            : {
                  oauth_client_id: APP_ID,
                  oauth_client_secret: Buffer.from(PRIVATE_KEY, 'ascii').toString('base64'),
                  app_link: APP_LINK
              })
    });
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration,
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    const execute = vi.fn().mockResolvedValue({ connectionIds: ['conn-1'], connectionMetadata: {} });
    nango.executeScriptForWebhooks = execute;
    const markUnverified = vi.spyOn(nango, 'markUnverified').mockImplementation(() => undefined);

    return { nango, execute, markUnverified };
}

function sign(payload: string, privateKey = PRIVATE_KEY) {
    const secret = crypto.createHash('sha256').update(`${APP_ID}${privateKey}${APP_LINK}`).digest('hex');

    return `sha256=${crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex')}`;
}

function errType(result: unknown) {
    return (result as { error: NangoError }).error.type;
}

describe('github-app-webhook-routing', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        flagMocks.allowUnauthorizedGithubAppWebhook.mockReset();
        flagMocks.allowUnauthorizedGithubAppWebhook.mockResolvedValue(false);
        flagMocks.isGithubAppConnectionCredentialsEnabled.mockReset();
        flagMocks.isGithubAppConnectionCredentialsEnabled.mockResolvedValue(false);
    });

    it('routes a correctly signed webhook', async () => {
        const { nango, execute, markUnverified } = makeNango();

        const result = await GithubAppWebhookRouting.default(nango, { 'x-hub-signature-256': sign(rawBody) }, body as never, rawBody);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        expect(markUnverified).not.toHaveBeenCalled();
    });

    it('rejects a signature made with the wrong key before dispatch', async () => {
        const { nango, execute } = makeNango();

        const result = await GithubAppWebhookRouting.default(nango, { 'x-hub-signature-256': sign(rawBody, 'other-key') }, body as never, rawBody);

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a signature over a tampered body before dispatch', async () => {
        const { nango, execute } = makeNango();

        const result = await GithubAppWebhookRouting.default(nango, { 'x-hub-signature-256': sign(rawBody) }, body as never, `${rawBody} `);

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('counts and rejects a missing signature header', async () => {
        const { nango, execute, markUnverified } = makeNango();

        const result = await GithubAppWebhookRouting.default(nango, {}, body as never, rawBody);

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_missing_signature');
        expect(execute).not.toHaveBeenCalled();
        expect(markUnverified).toHaveBeenCalledWith({ reason: 'github_app_missing_signature', remediation: REMEDIATION }, 'rejected');
    });

    it('counts and processes a missing signature header when the account is opted out', async () => {
        flagMocks.allowUnauthorizedGithubAppWebhook.mockResolvedValue(true);
        const { nango, execute, markUnverified } = makeNango();

        const result = await GithubAppWebhookRouting.default(nango, {}, body as never, rawBody);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        expect(markUnverified).toHaveBeenCalledWith({ reason: 'github_app_missing_signature', remediation: REMEDIATION }, 'flag');
    });

    it('processes a missing signature header when the integration allows unverified webhooks', async () => {
        const { nango, execute, markUnverified } = makeNango({ allowUnverified: true });

        const result = await GithubAppWebhookRouting.default(nango, {}, body as never, rawBody);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        expect(markUnverified).toHaveBeenCalledWith({ reason: 'github_app_missing_signature', remediation: REMEDIATION }, 'setting');
    });

    it('rejects an invalid signature when the integration allows unverified webhooks', async () => {
        const { nango, execute } = makeNango({ allowUnverified: true });

        const result = await GithubAppWebhookRouting.default(nango, { 'x-hub-signature-256': sign(rawBody, 'other-key') }, body as never, rawBody);

        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    describe('connection-level app', () => {
        const WEBHOOK_SECRET = 'connection-webhook-secret';
        const APP_HEADER_ID = '777';
        const appHeaders = (signature: string) => ({ 'x-hub-signature-256': signature, 'x-github-hook-installation-target-id': APP_HEADER_ID });
        const signWith = (secret: string, payload = rawBody) => `sha256=${crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex')}`;

        function mockConnections(overrides: { appId?: string; secret?: string | undefined } = {}) {
            return vi.spyOn(connectionService, 'findConnectionsByConnectionConfigValue').mockResolvedValue([
                {
                    connection_config: { app_id: overrides.appId ?? APP_HEADER_ID, installation_id: '42' },
                    credentials: {
                        type: 'APP',
                        access_token: 'tok',
                        raw: {},
                        ...('secret' in overrides && overrides.secret === undefined
                            ? {}
                            : { config_override: { private_key: 'x', webhook_secret: overrides.secret ?? WEBHOOK_SECRET } })
                    }
                } as never
            ]);
        }

        it('routes a webhook signed with the connection webhook secret, matched on app and installation id', async () => {
            flagMocks.isGithubAppConnectionCredentialsEnabled.mockResolvedValue(true);
            const { nango, execute } = makeNango({ emptyIntegration: true });
            const find = mockConnections();

            const result = await GithubAppWebhookRouting.default(nango, appHeaders(signWith(WEBHOOK_SECRET)), body as never, rawBody);

            expect(result.isOk()).toBe(true);
            expect(find).toHaveBeenCalledWith('installation_id', '42', nango.environment.id, nango.integration.id);
            expect(execute).toHaveBeenCalledOnce();
        });

        it('rejects a wrong connection webhook secret', async () => {
            flagMocks.isGithubAppConnectionCredentialsEnabled.mockResolvedValue(true);
            const { nango, execute } = makeNango({ emptyIntegration: true });
            mockConnections();

            const result = await GithubAppWebhookRouting.default(nango, appHeaders(signWith('other')), body as never, rawBody);

            expect(errType(result)).toBe('webhook_invalid_signature');
            expect(execute).not.toHaveBeenCalled();
        });

        it('rejects when no connection matches the installation id', async () => {
            flagMocks.isGithubAppConnectionCredentialsEnabled.mockResolvedValue(true);
            const { nango, execute } = makeNango({ emptyIntegration: true });
            vi.spyOn(connectionService, 'findConnectionsByConnectionConfigValue').mockResolvedValue(null);

            const result = await GithubAppWebhookRouting.default(nango, appHeaders(signWith(WEBHOOK_SECRET)), body as never, rawBody);

            expect(errType(result)).toBe('webhook_invalid_signature');
            expect(execute).not.toHaveBeenCalled();
        });

        it('rejects a connection whose app id differs from the app id header', async () => {
            flagMocks.isGithubAppConnectionCredentialsEnabled.mockResolvedValue(true);
            const { nango, execute } = makeNango({ emptyIntegration: true });
            mockConnections({ appId: '999' });

            const result = await GithubAppWebhookRouting.default(nango, appHeaders(signWith(WEBHOOK_SECRET)), body as never, rawBody);

            expect(errType(result)).toBe('webhook_invalid_signature');
            expect(execute).not.toHaveBeenCalled();
        });

        it('rejects a connection without override', async () => {
            flagMocks.isGithubAppConnectionCredentialsEnabled.mockResolvedValue(true);
            const { nango, execute } = makeNango({ emptyIntegration: true });
            mockConnections({ secret: undefined });

            const result = await GithubAppWebhookRouting.default(nango, appHeaders(signWith('undefined')), body as never, rawBody);

            expect(errType(result)).toBe('webhook_invalid_signature');
            expect(execute).not.toHaveBeenCalled();
        });

        it('rejects a payload without installation id or a request without the app id header', async () => {
            flagMocks.isGithubAppConnectionCredentialsEnabled.mockResolvedValue(true);
            const { nango } = makeNango({ emptyIntegration: true });
            const find = mockConnections();
            const noInstallation = JSON.stringify({ action: 'opened' });

            const result = await GithubAppWebhookRouting.default(
                nango,
                appHeaders(signWith(WEBHOOK_SECRET, noInstallation)),
                JSON.parse(noInstallation),
                noInstallation
            );
            const noHeader = await GithubAppWebhookRouting.default(nango, { 'x-hub-signature-256': signWith(WEBHOOK_SECRET) }, body as never, rawBody);

            expect(errType(result)).toBe('webhook_invalid_signature');
            expect(errType(noHeader)).toBe('webhook_invalid_signature');
            expect(find).not.toHaveBeenCalled();
        });

        it('ignores connection secrets when the flag is off', async () => {
            const { nango, execute } = makeNango({ emptyIntegration: true });
            const find = mockConnections();

            const result = await GithubAppWebhookRouting.default(nango, appHeaders(signWith(WEBHOOK_SECRET)), body as never, rawBody);

            expect(errType(result)).toBe('webhook_invalid_signature');
            expect(find).not.toHaveBeenCalled();
            expect(execute).not.toHaveBeenCalled();
        });

        it('does not look at connections when the integration has an app', async () => {
            flagMocks.isGithubAppConnectionCredentialsEnabled.mockResolvedValue(true);
            const { nango } = makeNango();
            const find = mockConnections();

            const result = await GithubAppWebhookRouting.default(nango, appHeaders(signWith(WEBHOOK_SECRET)), body as never, rawBody);

            expect(errType(result)).toBe('webhook_invalid_signature');
            expect(find).not.toHaveBeenCalled();
        });
    });
});
