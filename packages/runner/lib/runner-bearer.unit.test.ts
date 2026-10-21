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

    it('sends the task token as the bearer and as apiKey, and does not pass secretKey to @nangohq/node', () => {
        const withToken = { ...props, taskAuthToken: 'task-token' };
        expect(runnerBearer(withToken)).toBe('task-token');
        const config = nangoClientConfig(withToken, { isSync: false, dryRun: false });
        expect(config).toMatchObject({ apiKey: 'task-token', isScript: true });
        expect(config).not.toHaveProperty('secretKey');
        const runner = new NangoActionRunner(withToken, { locks: new MapLocks() });
        expect(runner.nango.apiKey).toBe('task-token');
        expect(runner.nango.secretKey).toBeUndefined();
    });
});
