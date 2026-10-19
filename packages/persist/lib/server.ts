import express from 'express';
import qs from 'qs';

import { TASK_CAPABILITY_SCOPES } from '@nangohq/internal-auth';
import { createRoute } from '@nangohq/utils';

import { authMiddleware } from './middleware/auth.middleware.js';
import { requireTaskCapability } from './middleware/capability.js';
import { connectionOwnershipMiddleware } from './middleware/connectionOwnership.middleware.js';
import { recordsPath } from './records.js';
import { routeHandler as deleteCheckpointHandler } from './routes/environment/environmentId/connection/connectionId/checkpoint/deleteCheckpoint.js';
import {
    routeHandler as getCheckpointHandler,
    route as getCheckpointRoute
} from './routes/environment/environmentId/connection/connectionId/checkpoint/getCheckpoint.js';
import { routeHandler as putCheckpointHandler } from './routes/environment/environmentId/connection/connectionId/checkpoint/putCheckpoint.js';
import { routeHandler as getCursorHandler, route as getCursorRoute } from './routes/environment/environmentId/connection/connectionId/getCursor.js';
import { routeHandler as getRecordsHandler, route as getRecordsRoute } from './routes/environment/environmentId/connection/connectionId/getRecords.js';
import {
    routeHandler as deleteHardRecordsHandler,
    route as deleteHardRecordsRoute
} from './routes/environment/environmentId/connection/connectionId/sync/syncId/job/jobId/deleteHardRecords.js';
import {
    routeHandler as deleteOutdatedRecordsHandler,
    route as deleteOutdatedRecordsRoute
} from './routes/environment/environmentId/connection/connectionId/sync/syncId/job/jobId/deleteOutdatedRecords.js';
import { routeHandler as deleteRecordsHandler } from './routes/environment/environmentId/connection/connectionId/sync/syncId/job/jobId/deleteRecords.js';
import { routeHandler as postRecordsHandler } from './routes/environment/environmentId/connection/connectionId/sync/syncId/job/jobId/postRecords.js';
import { routeHandler as putRecordsHandler } from './routes/environment/environmentId/connection/connectionId/sync/syncId/job/jobId/putRecords.js';
import { routeHandler as postLogHandler } from './routes/environment/environmentId/postLog.js';
import { routeHandler as getRunnerLockHandler } from './routes/environment/environmentId/runner/locks/getLock.js';
import { routeHandler as postRunnerLockReleaseHandler } from './routes/environment/environmentId/runner/locks/postRelease.js';
import { routeHandler as postRunnerLockReleaseAllHandler } from './routes/environment/environmentId/runner/locks/postReleaseAll.js';
import { routeHandler as postRunnerLockTryAcquireHandler } from './routes/environment/environmentId/runner/locks/postTryAcquire.js';
import { routeHandler as deleteSyncConflictHandler } from './routes/environment/environmentId/runner/syncConflict/deleteSyncConflict.js';
import { routeHandler as putSyncConflictHandler } from './routes/environment/environmentId/runner/syncConflict/putSyncConflict.js';
import { routeHandler as getTaskAbortHandler } from './routes/environment/environmentId/runner/task/taskId/getAbort.js';
import { routeHandler as putTaskAbortHandler } from './routes/environment/environmentId/runner/task/taskId/putAbort.js';
import { routeHandler as getHealthHandler } from './routes/getHealth.js';
import { routeHandler as postRunnerTelemetryHandler, route as postRunnerTelemetryRoute } from './routes/runner/telemetry/postTelemetry.js';

import type { ApiError } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

const maxSizeJsonLog = '100kb';
const maxSizeJsonRecords = '100mb';
const maxSizeJsonRunnerTelemetry = '256kb';
const maxSizeJsonRunnerCoordination = '4kb';

export const server = express();

server.set('query parser', (str: string) => {
    return qs.parse(str, { arrayLimit: 100 });
});

server.use('/environment/:environmentId/*splat', authMiddleware);
server.use('/environment/:environmentId/connection/:nangoConnectionId/*splat', connectionOwnershipMiddleware);
server.use('/environment/:environmentId/log', express.json({ limit: maxSizeJsonLog }));
server.use(recordsPath, express.json({ limit: maxSizeJsonRecords }));
server.use(getCursorRoute.path, express.json());
server.use(getRecordsRoute.path, express.json());
server.use(deleteOutdatedRecordsRoute.path, express.json());
server.use(deleteHardRecordsRoute.path, express.json());
server.use(getCheckpointRoute.path, express.json());
server.use(postRunnerTelemetryRoute.path, express.json({ limit: maxSizeJsonRunnerTelemetry }));
server.use('/environment/:environmentId/runner/sync-conflict', express.json({ limit: maxSizeJsonRunnerCoordination }));
server.use('/environment/:environmentId/runner/locks', express.json({ limit: maxSizeJsonRunnerCoordination }));

createRoute(server, getHealthHandler);
createRoute(server, postLogHandler, { middleware: [requireTaskCapability(TASK_CAPABILITY_SCOPES.persistLog, postLogHandler.path)] });
createRoute(server, postRecordsHandler, { middleware: [requireTaskCapability(TASK_CAPABILITY_SCOPES.persistRecords, postRecordsHandler.path)] });
createRoute(server, deleteRecordsHandler, { middleware: [requireTaskCapability(TASK_CAPABILITY_SCOPES.persistRecords, deleteRecordsHandler.path)] });
createRoute(server, deleteOutdatedRecordsHandler, {
    middleware: [requireTaskCapability(TASK_CAPABILITY_SCOPES.persistRecords, deleteOutdatedRecordsHandler.path)]
});
createRoute(server, deleteHardRecordsHandler, { middleware: [requireTaskCapability(TASK_CAPABILITY_SCOPES.persistRecords, deleteHardRecordsHandler.path)] });
createRoute(server, putRecordsHandler, { middleware: [requireTaskCapability(TASK_CAPABILITY_SCOPES.persistRecords, putRecordsHandler.path)] });
createRoute(server, getCursorHandler, { middleware: [requireTaskCapability(TASK_CAPABILITY_SCOPES.persistCursor, getCursorHandler.path)] });
createRoute(server, getRecordsHandler, { middleware: [requireTaskCapability(TASK_CAPABILITY_SCOPES.persistRecords, getRecordsHandler.path)] });
createRoute(server, getCheckpointHandler, { middleware: [requireTaskCapability(TASK_CAPABILITY_SCOPES.persistCheckpoint, getCheckpointHandler.path)] });
createRoute(server, putCheckpointHandler, { middleware: [requireTaskCapability(TASK_CAPABILITY_SCOPES.persistCheckpoint, putCheckpointHandler.path)] });
createRoute(server, deleteCheckpointHandler, { middleware: [requireTaskCapability(TASK_CAPABILITY_SCOPES.persistCheckpoint, deleteCheckpointHandler.path)] });
createRoute(server, postRunnerTelemetryHandler, {
    middleware: [requireTaskCapability(TASK_CAPABILITY_SCOPES.persistTelemetry, postRunnerTelemetryHandler.path)]
});
createRoute(server, putTaskAbortHandler, { middleware: [requireTaskCapability(TASK_CAPABILITY_SCOPES.persistAbort, putTaskAbortHandler.path)] });
createRoute(server, getTaskAbortHandler, { middleware: [requireTaskCapability(TASK_CAPABILITY_SCOPES.persistAbort, getTaskAbortHandler.path)] });
createRoute(server, putSyncConflictHandler, { middleware: [requireTaskCapability(TASK_CAPABILITY_SCOPES.persistSyncConflict, putSyncConflictHandler.path)] });
createRoute(server, deleteSyncConflictHandler, {
    middleware: [requireTaskCapability(TASK_CAPABILITY_SCOPES.persistSyncConflict, deleteSyncConflictHandler.path)]
});
createRoute(server, postRunnerLockTryAcquireHandler, {
    middleware: [requireTaskCapability(TASK_CAPABILITY_SCOPES.persistLocks, postRunnerLockTryAcquireHandler.path)]
});
createRoute(server, postRunnerLockReleaseHandler, {
    middleware: [requireTaskCapability(TASK_CAPABILITY_SCOPES.persistLocks, postRunnerLockReleaseHandler.path)]
});
createRoute(server, postRunnerLockReleaseAllHandler, {
    middleware: [requireTaskCapability(TASK_CAPABILITY_SCOPES.persistLocks, postRunnerLockReleaseAllHandler.path)]
});
createRoute(server, getRunnerLockHandler, { middleware: [requireTaskCapability(TASK_CAPABILITY_SCOPES.persistLocks, getRunnerLockHandler.path)] });

server.use((_req: Request, res: Response, next: NextFunction) => {
    res.status(404);
    next();
});

server.use((err: unknown, _req: Request, res: Response<ApiError<'request_too_large' | 'server_error'>>, next: NextFunction) => {
    if (err instanceof Error) {
        if (err.message === 'request entity too large') {
            res.status(400).json({ error: { code: 'request_too_large', message: 'Entity too large' } });
            return;
        }
        res.status(500).json({ error: { code: 'server_error', message: err.message } });
    } else if (err) {
        res.status(500).json({ error: { code: 'server_error' } });
    } else {
        next();
    }
});
