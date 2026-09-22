import { afterEach, describe, expect, it, vi } from 'vitest';

import * as shared from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { startScript } from './start.js';

import type { LogContext } from '@nangohq/logs';
import type { NangoProps } from '@nangohq/types';

const { getRuntimeAdapter } = vi.hoisted(() => ({
    getRuntimeAdapter: vi.fn()
}));

// start.ts imports this module, which parses jobs env at load.
vi.mock('../../runtime/runtimes.js', () => ({
    getRuntimeAdapter
}));

describe('startScript', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('loads a catalog script from object storage and invokes it', async () => {
        const script = 'module.exports = {};';
        const localFileSpy = vi.spyOn(shared.localFileService, 'getIntegrationFile');
        const remoteFileSpy = vi.spyOn(shared.remoteFileService, 'getFile').mockResolvedValue(script);
        const invoke = vi.fn().mockResolvedValue(Ok(true));
        getRuntimeAdapter.mockResolvedValue(Ok({ invoke }));
        vi.spyOn(shared.connectionService, 'trackExecution').mockResolvedValue(Ok(undefined));

        const result = await startScript({
            taskId: 'task-1',
            nangoProps: catalogNangoProps,
            routingContext: { plan: null, features: [] },
            logCtx: { error: vi.fn() } as unknown as LogContext
        });

        expect(result.isOk()).toBe(true);
        expect(remoteFileSpy).toHaveBeenCalledWith('templates-zero/github/build/github_actions_create-issue.cjs');
        expect(localFileSpy).not.toHaveBeenCalled();
        expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'task-1', code: script }));
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
