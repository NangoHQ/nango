import { describe, expect, it, vi } from 'vitest';

import { dispatchUserScript, parseExports } from './execDispatch.js';

import type { DBSyncConfig, NangoProps } from '@nangohq/types';

function baseNangoProps(overrides: Partial<NangoProps> = {}): NangoProps {
    return {
        scriptType: 'action',
        host: 'http://localhost:3003',
        connectionId: 'connection-id',
        environmentId: 1,
        environmentName: 'dev',
        providerConfigKey: 'provider-config-key',
        provider: 'provider',
        activityLogId: '1',
        secretKey: 'secret-key',
        nangoConnectionId: 1,
        syncId: 'sync-id',
        syncJobId: 1,
        lastSyncDate: new Date(),
        attributes: {},
        track_deletes: false,
        syncConfig: { sync_name: 's', file_location: '' } as DBSyncConfig,
        debug: false,
        startedAt: new Date(),
        team: { id: 1, name: 'dev' },
        logger: { level: 'off' },
        runnerFlags: {
            validateActionInput: false,
            validateActionOutput: false,
            validateSyncMetadata: false,
            validateSyncRecords: false
        },
        endUser: null,
        heartbeatTimeoutSecs: 30,
        ...overrides
    };
}

describe('dispatchUserScript', () => {
    it('rejects invalid exports', async () => {
        await expect(
            dispatchUserScript({
                nangoProps: baseNangoProps(),
                nango: {
                    telemetryBag: { customLogs: 0, proxyCalls: 0, durationMs: 0, memoryGb: 1 },
                    getCheckpointRange: () => null
                } as never,
                scriptExports: parseExports({ default: 123 }),
                codeParams: {}
            })
        ).rejects.toThrow('Invalid script exports');
    });

    it('runs default action export', async () => {
        const exec = vi.fn((_n: unknown, _p: unknown) => Promise.resolve({ ok: true }));
        const nango = {
            telemetryBag: { customLogs: 0, proxyCalls: 0, durationMs: 0, memoryGb: 1 },
            getCheckpointRange: () => null
        };
        const res = await dispatchUserScript({
            nangoProps: baseNangoProps({ scriptType: 'action' }),
            nango: nango as never,
            scriptExports: parseExports({ default: exec }),
            codeParams: { a: 1 }
        });
        expect(exec).toHaveBeenCalled();
        expect(res.output).toEqual({ ok: true });
    });
});
