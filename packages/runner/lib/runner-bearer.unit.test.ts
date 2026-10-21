import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { Nango } from '@nangohq/node';

import { nangoClientConfig, runnerBearer } from './runner-bearer.js';
import { MapLocks } from './sdk/locks.js';
import { NangoActionRunner } from './sdk/sdk.js';

import type { NangoProps } from '@nangohq/types';

const props = {
    scriptType: 'action',
    secretKey: 'sk',
    providerConfigKey: 'github',
    provider: 'github',
    connectionId: 'connection-1',
    activityLogId: '1',
    team: { id: 1, name: 'team' },
    environmentId: 1,
    environmentName: 'test-env',
    syncConfig: { sync_name: 'action' },
    nangoConnectionId: 1,
    debug: false,
    runnerFlags: {},
    startedAt: new Date(),
    endUser: null,
    logger: { level: 'info' }
} as NangoProps;

describe('runner credential', () => {
    it('sends the secret to persist and to @nangohq/node when there is no task token', () => {
        expect(runnerBearer(props)).toBe('sk');
        expect(nangoClientConfig(props, { isSync: false, dryRun: true })).toMatchObject({ secretKey: 'sk', isScript: true });
        const runner = new NangoActionRunner(props, { locks: new MapLocks() });
        expect(runner.nango.secretKey).toBe('sk');
        expect(runner.nango.apiKey).toBe('sk');

        const customer = new Nango({ secretKey: 'customer' });
        expect(customer.secretKey).toBe('customer');
        expect(customer.apiKey).toBe('customer');
    });

    it('sends the task token as apiKey and keeps the secret as the webhook signing key', () => {
        const withToken = { ...props, taskAuthToken: 'task-token' };
        expect(runnerBearer(withToken)).toBe('task-token');
        const config = nangoClientConfig(withToken, { isSync: false, dryRun: false });
        expect(config).toMatchObject({ apiKey: 'task-token', webhookSigningKey: 'sk', isScript: true });
        expect(config).not.toHaveProperty('secretKey');

        const body = '{"hello":true}';
        const signature = createHmac('sha256', 'sk').update(body).digest('hex');
        const nango = new Nango(config);
        expect(nango.apiKey).toBe('task-token');
        expect(nango.secretKey).toBeUndefined();
        expect(nango.webhookSigningKey).toBe('sk');
        expect(nango.verifyIncomingWebhookRequest(body, { 'x-nango-hmac-sha256': signature })).toBe(true);

        const runner = new NangoActionRunner(withToken, { locks: new MapLocks() });
        expect(runner.nango.apiKey).toBe('task-token');
        expect(runner.nango.webhookSigningKey).toBe('sk');
        expect(runner.nango.secretKey).toBeUndefined();
    });

    it('omits the webhook signing key when the payload has a task token and no secret', () => {
        const { secretKey, ...withoutSecret } = props;
        expect(secretKey).toBe('sk');
        const config = nangoClientConfig({ ...withoutSecret, taskAuthToken: 'task-token' }, { isSync: false, dryRun: true });
        expect(config).toMatchObject({ apiKey: 'task-token' });
        expect(config).not.toHaveProperty('secretKey');
        expect(config).not.toHaveProperty('webhookSigningKey');
    });
});
