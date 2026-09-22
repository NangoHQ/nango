import { afterEach, describe, expect, it, vi } from 'vitest';

import * as shared from '@nangohq/shared';

import { startScript } from './start.js';

import type { LogContext } from '@nangohq/logs';
import type { NangoProps } from '@nangohq/types';

// start.ts imports this module, which parses jobs env at load. The test never calls it.
vi.mock('../../runtime/runtimes.js', () => ({
    getRuntimeAdapter: vi.fn()
}));

describe('startScript', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('reads catalog files from object storage even outside cloud execution', async () => {
        const localFileSpy = vi.spyOn(shared.localFileService, 'getIntegrationFile');
        const remoteFileSpy = vi.spyOn(shared.remoteFileService, 'getFile').mockResolvedValue('');

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
        expect(remoteFileSpy).toHaveBeenCalledWith('templates-zero/github/build/github_actions_create-issue.cjs');
        expect(localFileSpy).not.toHaveBeenCalled();
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
