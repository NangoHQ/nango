import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handle } from '../../execution/operations/handler.js';
import { routeHandler } from './putTask.js';

import type { NangoProps } from '@nangohq/types';

const { mockGetInternalServiceAuth, mockNangoPropsBoundToTaskAuth } = vi.hoisted(() => ({
    mockGetInternalServiceAuth: vi.fn(),
    mockNangoPropsBoundToTaskAuth: vi.fn()
}));

vi.mock('@nangohq/internal-auth', () => ({
    getInternalServiceAuth: mockGetInternalServiceAuth,
    nangoPropsBoundToTaskAuth: mockNangoPropsBoundToTaskAuth
}));

vi.mock('../../execution/operations/handler.js', () => ({
    handle: vi.fn().mockResolvedValue(undefined)
}));

const handleMock = vi.mocked(handle);

const taskId = '11111111-1111-4111-8111-111111111111';

function nangoProps(overrides: Partial<NangoProps> = {}): NangoProps {
    return {
        scriptType: 'sync',
        environmentId: 7,
        environmentName: 'dev',
        connectionId: 'own-connection',
        nangoConnectionId: 11,
        providerConfigKey: 'github',
        provider: 'github',
        team: { id: 1, name: 'own-account' },
        syncId: taskId,
        syncJobId: 99,
        activityLogId: 'ownLogId0000000000001',
        debug: false,
        startedAt: new Date('2024-02-02T09:59:00.000Z'),
        endUser: null,
        runnerFlags: {} as NangoProps['runnerFlags'],
        logger: { level: 'info' },
        syncConfig: { environment_id: 7 } as NangoProps['syncConfig'],
        ...overrides
    };
}

async function invoke(props: NangoProps) {
    const res = {
        locals: {
            parsedParams: { taskId },
            parsedBody: {
                nangoProps: props,
                output: null,
                telemetryBag: { customLogs: 0, proxyCalls: 0, durationMs: 1000, memoryGb: 1 },
                functionRuntime: 'runner',
                checkpoints: null
            }
        },
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis()
    };
    await routeHandler.handler({} as never, res as never, vi.fn());
    return res;
}

describe('putTask nangoProps binding', () => {
    beforeEach(() => {
        handleMock.mockClear();
        mockGetInternalServiceAuth.mockReset();
        mockNangoPropsBoundToTaskAuth.mockReset();
    });

    it('dispatches when the body is bound to the authenticated task', async () => {
        const props = nangoProps();
        mockGetInternalServiceAuth.mockReturnValue({ op: 'task' });
        mockNangoPropsBoundToTaskAuth.mockReturnValue(true);

        const res = await invoke(props);

        expect(mockNangoPropsBoundToTaskAuth).toHaveBeenCalledWith({ op: 'task' }, { environmentId: 7, nangoConnectionId: 11, syncId: taskId });
        expect(res.status).toHaveBeenCalledWith(204);
        expect(handleMock).toHaveBeenCalledOnce();
    });

    it('rejects a body that is not bound to the authenticated task and does not dispatch', async () => {
        mockGetInternalServiceAuth.mockReturnValue({ op: 'task' });
        mockNangoPropsBoundToTaskAuth.mockReturnValue(false);

        const res = await invoke(
            nangoProps({
                environmentId: 42,
                nangoConnectionId: 9001,
                team: { id: 222, name: 'victim-account' },
                syncId: '22222222-2222-4222-8222-222222222222',
                syncJobId: 55555
            })
        );

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: { code: 'unauthorized', message: 'Unauthorized' } });
        expect(handleMock).not.toHaveBeenCalled();
    });
});
