import express from 'express';
import qs from 'qs';

import { INTERNAL_SERVICE_ISSUER_JOBS, keyRegistryFromPublicKeys } from '@nangohq/internal-auth';
import { createRoute } from '@nangohq/utils';

import { envs } from './env.js';
import { authenticate, authorize, authorizeBodySyncId, rejectTaskCredential } from './middleware/capability.js';
import { connectionOwnershipMiddleware } from './middleware/connectionOwnership.middleware.js';
import { syncJobOwnershipMiddleware } from './middleware/syncJobOwnership.middleware.js';
import { routeHandler as deleteCheckpointHandler } from './routes/environment/environmentId/connection/connectionId/checkpoint/deleteCheckpoint.js';
import { routeHandler as getCheckpointHandler } from './routes/environment/environmentId/connection/connectionId/checkpoint/getCheckpoint.js';
import { routeHandler as putCheckpointHandler } from './routes/environment/environmentId/connection/connectionId/checkpoint/putCheckpoint.js';
import { routeHandler as getCursorHandler } from './routes/environment/environmentId/connection/connectionId/getCursor.js';
import { routeHandler as getRecordsHandler } from './routes/environment/environmentId/connection/connectionId/getRecords.js';
import { routeHandler as deleteHardRecordsHandler } from './routes/environment/environmentId/connection/connectionId/sync/syncId/job/jobId/deleteHardRecords.js';
import { routeHandler as deleteOutdatedRecordsHandler } from './routes/environment/environmentId/connection/connectionId/sync/syncId/job/jobId/deleteOutdatedRecords.js';
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
import { routeHandler as postRunnerTelemetryHandler } from './routes/runner/telemetry/postTelemetry.js';

import type { ApiError } from '@nangohq/types';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

const maxSizeJsonLog = '100kb';
const maxSizeJsonRecords = '100mb';
const maxSizeJsonRunnerTelemetry = '256kb';
const maxSizeJsonRunnerCoordination = '4kb';

export const server = express();

server.set('query parser', (str: string) => {
    return qs.parse(str, { arrayLimit: 100 });
});

const jsonLog = express.json({ limit: maxSizeJsonLog });
const jsonRecords = express.json({ limit: maxSizeJsonRecords });
const jsonDefault = express.json();
const jsonTelemetry = express.json({ limit: maxSizeJsonRunnerTelemetry });
const jsonCoordination = express.json({ limit: maxSizeJsonRunnerCoordination });

// Authentication runs before every /environment route, and before any JSON parser.
// authorize checks scope and path bindings. The body is parsed after that.
const registry = keyRegistryFromPublicKeys(envs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS, INTERNAL_SERVICE_ISSUER_JOBS);
server.use('/environment/:environmentId', authenticate(registry));

createRoute(server, getHealthHandler, { middleware: [rejectTaskCredential] });
createRoute(server, postLogHandler, { middleware: [authorize('persist:log'), jsonLog] });
createRoute(server, postRecordsHandler, { middleware: [authorize('persist:records'), syncJobOwnershipMiddleware as RequestHandler, jsonRecords] });
createRoute(server, putRecordsHandler, { middleware: [authorize('persist:records'), syncJobOwnershipMiddleware as RequestHandler, jsonRecords] });
createRoute(server, deleteRecordsHandler, { middleware: [authorize('persist:records'), syncJobOwnershipMiddleware as RequestHandler, jsonRecords] });
createRoute(server, deleteOutdatedRecordsHandler, { middleware: [authorize('persist:records'), syncJobOwnershipMiddleware as RequestHandler, jsonDefault] });
createRoute(server, deleteHardRecordsHandler, { middleware: [authorize('persist:records'), syncJobOwnershipMiddleware as RequestHandler, jsonDefault] });
createRoute(server, getRecordsHandler, { middleware: [authorize('persist:records'), connectionOwnershipMiddleware as RequestHandler, jsonDefault] });
createRoute(server, getCursorHandler, { middleware: [authorize('persist:cursor'), connectionOwnershipMiddleware as RequestHandler, jsonDefault] });
createRoute(server, getCheckpointHandler, { middleware: [authorize('persist:checkpoint'), connectionOwnershipMiddleware as RequestHandler, jsonDefault] });
createRoute(server, putCheckpointHandler, { middleware: [authorize('persist:checkpoint'), connectionOwnershipMiddleware as RequestHandler, jsonDefault] });
createRoute(server, deleteCheckpointHandler, { middleware: [authorize('persist:checkpoint'), connectionOwnershipMiddleware as RequestHandler, jsonDefault] });
createRoute(server, postRunnerTelemetryHandler, { middleware: [authorize('persist:telemetry'), jsonTelemetry] });
createRoute(server, putTaskAbortHandler, { middleware: [authorize('persist:abort')] });
createRoute(server, getTaskAbortHandler, { middleware: [authorize('persist:abort')] });
createRoute(server, putSyncConflictHandler, { middleware: [authorize('persist:sync-conflict'), jsonCoordination, authorizeBodySyncId] });
createRoute(server, deleteSyncConflictHandler, { middleware: [authorize('persist:sync-conflict'), jsonCoordination, authorizeBodySyncId] });
createRoute(server, postRunnerLockTryAcquireHandler, { middleware: [authorize('persist:locks'), jsonCoordination] });
createRoute(server, postRunnerLockReleaseHandler, { middleware: [authorize('persist:locks'), jsonCoordination] });
createRoute(server, postRunnerLockReleaseAllHandler, { middleware: [authorize('persist:locks'), jsonCoordination] });
createRoute(server, getRunnerLockHandler, { middleware: [authorize('persist:locks'), jsonCoordination] });

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
