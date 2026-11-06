import { afterEach, describe, expect, it, vi } from 'vitest';

import * as shared from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { toRunnableSyncConfig } from '../runnableSyncConfig.js';
import { startScript } from './start.js';

import type { LogContext } from '@nangohq/logs';
import type { CatalogTool } from '@nangohq/shared';
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
        expect(remoteFileSpy).toHaveBeenCalledWith(catalogTool.fileLocation);
        expect(localFileSpy).not.toHaveBeenCalled();
        expect(invoke).toHaveBeenCalledWith(
            expect.objectContaining({
                taskId: 'task-1',
                code: script,
                nangoProps: expect.objectContaining({
                    syncConfig: expect.objectContaining({
                        file_location: catalogTool.fileLocation,
                        type: 'action',
                        sdk_version: catalogTool.sdkVersion
                    })
                })
            })
        );
    });
});

const catalogTool: CatalogTool = {
    name: 'create-issue',
    description: 'Create an issue',
    input: 'Issue',
    output: ['Issue'],
    scopes: ['repo'],
    jsonSchema: null,
    version: '1.0.0',
    sdkVersion: '0.69.0-zero',
    fileLocation: 'templates-zero/github/build/github_actions_create-issue.cjs',
    sourceLocation: 'templates-zero/github/actions/create-issue.ts',
    capabilities: { usesRecords: false, usesOutbound: false, usesCheckpoints: false, usesMetadata: false, usesInvoke: false },
    module: 'action'
};

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
    syncConfig: toRunnableSyncConfig(catalogTool, { environmentId: 2, configId: 4 })
} as NangoProps;
