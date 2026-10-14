import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { productTracking } from '@nangohq/shared';

import { PLAYGROUND_USER_TAG_KEY } from '../services/agentPlaygroundTags.js';
import { connectionCreated } from './hooks.js';

import type { LogContextGetter } from '@nangohq/logs';
import type * as Shared from '@nangohq/shared';
import type { DBConnection, DBEnvironment, DBTeam, IntegrationConfig, RecentlyCreatedConnection } from '@nangohq/types';

vi.mock('@nangohq/shared', async (importOriginal) => {
    const original = await importOriginal<typeof Shared>();
    return {
        ...original,
        errorNotificationService: { auth: { clear: vi.fn() } },
        externalWebhookService: { get: vi.fn().mockResolvedValue(null) },
        pubsub: { publisher: { publish: vi.fn() } }
    };
});

type Capture = (payload: { event: string; distinctId: string; properties: Record<string, unknown>; groups?: Record<string, string> }) => void;

const capture = vi.fn<Capture>();
const realClient = productTracking.client;

const account = { id: 42 } as DBTeam;
const providerConfig = { provider: 'linear', unique_key: 'linear' } as IntegrationConfig;

function created(tags: Record<string, string>, operation: RecentlyCreatedConnection['operation'] = 'creation'): RecentlyCreatedConnection {
    return {
        connection: { id: 1, connection_id: 'conn-1', environment_id: 7, tags } as unknown as DBConnection,
        environment: { id: 7, name: 'dev', is_production: false } as DBEnvironment,
        account,
        auth_mode: 'OAUTH2',
        operation,
        endUser: null
    };
}

async function create(payload: RecentlyCreatedConnection): Promise<void> {
    await connectionCreated(payload, account, providerConfig, {} as LogContextGetter, { initiateSync: false, runPostConnectionScript: false });
}

beforeEach(() => {
    capture.mockClear();
    productTracking.client = { capture, groupIdentify: vi.fn() } as unknown as typeof productTracking.client;
});

afterEach(() => {
    productTracking.client = realClient;
});

describe('connectionCreated', () => {
    it('tracks a new connection for the account', async () => {
        await create(created({}));

        expect(capture).toHaveBeenCalledTimes(1);
        expect(capture.mock.calls[0]?.[0]).toMatchObject({
            event: 'connections:connection_create',
            distinctId: 'account-42',
            properties: { provider: 'linear', is_playground: false, is_success: true, surface: 'server' }
        });
    });

    it('marks a connection the Agent Playground created', async () => {
        await create(created({ [PLAYGROUND_USER_TAG_KEY]: 'user-a' }));

        expect(capture.mock.calls[0]?.[0].properties).toMatchObject({ is_playground: true });
    });

    it('does not track a reconnection', async () => {
        await create(created({}, 'override'));

        expect(capture).not.toHaveBeenCalled();
    });
});
