import { afterEach, describe, expect, it, vi } from 'vitest';

import * as shared from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { startScript } from './start.js';

import type { LogContext } from '@nangohq/logs';
import type { NangoProps } from '@nangohq/types';

const { mockGetRuntimeAdapter, mockInvoke } = vi.hoisted(() => ({
    mockGetRuntimeAdapter: vi.fn(),
    mockInvoke: vi.fn()
}));

vi.mock('../../runtime/runtimes.js', () => ({
    getRuntimeAdapter: mockGetRuntimeAdapter
}));

describe('startScript', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        mockGetRuntimeAdapter.mockReset();
        mockInvoke.mockReset();
    });

    it('does not use remote storage for catalog files outside cloud execution', async () => {
        const localFileSpy = vi.spyOn(shared.localFileService, 'getIntegrationFile').mockReturnValue(null);
        const remoteFileSpy = vi.spyOn(shared.remoteFileService, 'getFile').mockRejectedValue(new Error('remote storage should not be used'));
        mockGetRuntimeAdapter.mockResolvedValue(Ok({ invoke: mockInvoke }));

        const result = await startScript({
            taskId: 'task-1',
            nangoProps: catalogNangoProps,
            routingContext: { plan: null, features: [] },
            logCtx: { error: vi.fn() } as unknown as LogContext
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toContain("Error starting function 'create-issue'");
            expect(result.error.message).toContain('Unable to find integration file');
        }
        expect(localFileSpy).toHaveBeenCalled();
        expect(remoteFileSpy).not.toHaveBeenCalled();
        expect(mockGetRuntimeAdapter).not.toHaveBeenCalled();
    });
});

const catalogNangoProps = {
    team: { id: 1 },
    environmentId: 2,
    connectionId: 'connection-1',
    environmentName: 'dev',
    activityLogId: 'activity-1',
    providerConfigKey: 'github',
    provider: 'github',
    nangoConnectionId: 3,
    scriptType: 'action',
    syncConfig: {
        sync_name: 'create-issue',
        file_location: 'templates-zero/github/build/github_actions_create-issue.cjs'
    }
} as NangoProps;
