import { expect, describe, it, vi, beforeAll, afterAll } from 'vitest';
import type { DBSyncConfig, NangoProps } from '@nangohq/types';
import { RunnerWorker } from './worker.js';
import express from 'express';
import type { Server } from 'node:http';
import getPort from 'get-port';
import { Locks } from '../sdk/locks.js';

const mockNangoProps: NangoProps = {
    scriptType: 'sync',
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
    syncConfig: {} as DBSyncConfig,
    debug: false,
    startedAt: new Date(),
    team: { id: 1, name: 'dev' },
    runnerFlags: {
        validateActionInput: false,
        validateActionOutput: false,
        validateSyncMetadata: false,
        validateSyncRecords: false
    },
    endUser: null
};
const locks = Locks.create();

const port = await getPort();
const mockServer = express();
mockServer.all('*', (_req, res) => {
    res.sendStatus(200);
});
let mockJobs: Server;

describe('worker', () => {
    beforeAll(() => {
        mockJobs = mockServer.listen(port);
    });

    afterAll(() => {
        mockJobs.close();
    });

    it('should run', async () => {
        let finished = false;
        const code = `
            f = async (nango) => {};
            exports.default = f
        `;
        const worker = new RunnerWorker({
            taskId: 'task-1',
            jobsServiceUrl: `http://localhost:${port}`,
            heartbeatIntervalMs: 30_000,
            memoryCheckIntervalMs: 10_000,
            locksBuffer: locks.getBuffer(),
            nangoProps: mockNangoProps,
            code,
            codeParams: {}
        });
        worker.on('exit', (exitCode) => {
            finished = true;
            expect(worker.taskId).toBe('task-1');
            expect(exitCode).toBe(0);
        });
        worker.start();
        await vi.waitUntil(() => finished, { timeout: 10_000 });
    });

    it('should abort', async () => {
        let finished = false;
        const code = `
            f = async (nango) => {
                while(true) {
                    if (nango.abortSignal.aborted) {
                        throw new Error('aborted');
                    }
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
            };
            exports.default = f
        `;
        const worker = new RunnerWorker({
            taskId: 'task-1',
            jobsServiceUrl: `http://localhost:${port}`,
            heartbeatIntervalMs: 30_000,
            memoryCheckIntervalMs: 10_000,
            locksBuffer: locks.getBuffer(),
            nangoProps: mockNangoProps,
            code,
            codeParams: {}
        });
        worker.on('exit', (exitCode) => {
            finished = true;
            expect(exitCode).toBe(0);
        });
        worker.start();
        worker.abort();
        await vi.waitUntil(() => finished, { timeout: 10_000 });
    });

    it('should report its memory usage', async () => {
        let finished = false;
        const code = `
            f = async (nango) => {
                await new Promise((resolve) => setTimeout(resolve, 1_000));
            };
            exports.default = f
        `;
        const worker = new RunnerWorker({
            taskId: 'task-1',
            jobsServiceUrl: `http://localhost:${port}`,
            heartbeatIntervalMs: 30_000,
            memoryCheckIntervalMs: 100,
            locksBuffer: locks.getBuffer(),
            nangoProps: mockNangoProps,
            code,
            codeParams: {}
        });
        const now = Date.now();
        worker.on('exit', (exitCode) => {
            finished = true;
            expect(exitCode).toBe(0);
            expect(worker.memoryUsage?.memoryInBytes).toBeGreaterThan(0);
            expect(worker.memoryUsage?.measuredAt.getTime()).toBeGreaterThan(now);
        });
        worker.start();
        await vi.waitUntil(() => finished, { timeout: 10_000 });
    });
});
