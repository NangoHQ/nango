import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import { postConnectionCreation } from './post-connection-creation.js';

import type { LogContextGetter } from '@nangohq/logs';
import type * as SharedModule from '@nangohq/shared';
import type { DBConnection, DBEnvironment, DBTeam, RecentlyCreatedConnection } from '@nangohq/types';

const { mockSearch, mockGetByConfig, mockInvoke, mockTriggerOnEventScript } = vi.hoisted(() => ({
    mockSearch: vi.fn(),
    mockGetByConfig: vi.fn(),
    mockInvoke: vi.fn(),
    mockTriggerOnEventScript: vi.fn()
}));

vi.mock('@nangohq/shared', async () => {
    const actual: typeof SharedModule = await vi.importActual('@nangohq/shared');
    return {
        ...actual,
        functionConfigService: { search: mockSearch },
        onEventScriptService: { getByConfig: mockGetByConfig }
    };
});

vi.mock('../../../utils/utils.js', () => ({
    getOrchestrator: () => ({ invokeFunction: mockInvoke, triggerOnEventScript: mockTriggerOnEventScript })
}));

const account = { id: 1 } as DBTeam;
const environment = { id: 2 } as DBEnvironment;
const connection = { id: 3, config_id: 4, connection_id: 'conn', provider_config_key: 'integration' } as DBConnection;
const createdConnection = { account, environment, connection } as RecentlyCreatedConnection;
const logCtx = { operation: {}, attachSpan: vi.fn(), failed: vi.fn() };
const logContextGetter = { create: vi.fn().mockResolvedValue(logCtx) } as unknown as LogContextGetter;
const functionConfig = { config: { id: 5, name: 'eventFn' }, currentVersion: { id: 6, limits: { concurrency: { perConnection: 1 } } } };
const legacyScript = { id: 7, name: 'legacy', file_location: 'legacy.js', version: '1', sdk_version: '1' };

describe('postConnectionCreation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSearch.mockResolvedValue(Ok([functionConfig]));
        mockGetByConfig.mockResolvedValue([legacyScript]);
        mockInvoke.mockResolvedValue(Ok({ data: null }));
        mockTriggerOnEventScript.mockResolvedValue(Ok({ data: null }));
    });

    it('runs matching functions', async () => {
        await postConnectionCreation(createdConnection, 'provider', logContextGetter);

        expect(mockInvoke).toHaveBeenCalledOnce();
        expect(mockGetByConfig).not.toHaveBeenCalled();
        expect(mockTriggerOnEventScript).not.toHaveBeenCalled();
    });

    it('runs legacy when no function matches', async () => {
        mockSearch.mockResolvedValue(Ok([]));

        await postConnectionCreation(createdConnection, 'provider', logContextGetter);

        expect(mockTriggerOnEventScript).toHaveBeenCalledOnce();
        expect(mockInvoke).not.toHaveBeenCalled();
    });
});
