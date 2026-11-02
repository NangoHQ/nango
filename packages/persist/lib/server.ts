import express from 'express';
import qs from 'qs';

import { INTERNAL_SERVICE_ISSUER_JOBS, keyRegistryFromPublicKeys } from '@nangohq/internal-auth';

import { envs } from './env.js';
import { createPersistRoutes, PERSIST_CAPABILITY } from './middleware/capability.js';
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
import type { Express, NextFunction, Request, Response } from 'express';

const maxSizeJsonLog = '100kb';
const maxSizeJsonRecords = '100mb';
const maxSizeJsonRunnerTelemetry = '256kb';
const maxSizeJsonRunnerCoordination = '4kb';

export const server = express();

server.set('query parser', (str: string) => {
    return qs.parse(str, { arrayLimit: 100 });
});

// Sync-conflict is the one route whose body is parsed before auth. The capability check reads
// syncId from the body, so the parser has to run first. Every other JSON parser is attached
// inside createPersistRoute and runs after auth.
server.use('/environment/:environmentId/runner/sync-conflict', express.json({ limit: maxSizeJsonRunnerCoordination }));

const jsonLog = express.json({ limit: maxSizeJsonLog });
const jsonRecords = express.json({ limit: maxSizeJsonRecords });
const jsonDefault = express.json();
const jsonTelemetry = express.json({ limit: maxSizeJsonRunnerTelemetry });
const jsonCoordination = express.json({ limit: maxSizeJsonRunnerCoordination });

const createPersistRoute = createPersistRoutes(keyRegistryFromPublicKeys(envs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS, INTERNAL_SERVICE_ISSUER_JOBS));

createPersistRoute(server, getHealthHandler, null);
createPersistRoute(server, postLogHandler, 'persist:log', { parseJson: jsonLog });
createPersistRoute(server, postRecordsHandler, 'persist:records', { parseJson: jsonRecords });
createPersistRoute(server, deleteRecordsHandler, 'persist:records', { parseJson: jsonRecords });
createPersistRoute(server, deleteOutdatedRecordsHandler, 'persist:records', { parseJson: jsonDefault });
createPersistRoute(server, deleteHardRecordsHandler, 'persist:records', { parseJson: jsonDefault });
createPersistRoute(server, putRecordsHandler, 'persist:records', { parseJson: jsonRecords });
createPersistRoute(server, getCursorHandler, 'persist:cursor', { parseJson: jsonDefault });
createPersistRoute(server, getRecordsHandler, 'persist:records', { parseJson: jsonDefault });
createPersistRoute(server, getCheckpointHandler, 'persist:checkpoint', { parseJson: jsonDefault });
createPersistRoute(server, putCheckpointHandler, 'persist:checkpoint', { parseJson: jsonDefault });
createPersistRoute(server, deleteCheckpointHandler, 'persist:checkpoint', { parseJson: jsonDefault });
createPersistRoute(server, postRunnerTelemetryHandler, 'persist:telemetry', { parseJson: jsonTelemetry });
createPersistRoute(server, putTaskAbortHandler, 'persist:abort');
createPersistRoute(server, getTaskAbortHandler, 'persist:abort');
createPersistRoute(server, putSyncConflictHandler, 'persist:sync-conflict', { syncIdFromBody: true });
createPersistRoute(server, deleteSyncConflictHandler, 'persist:sync-conflict', { syncIdFromBody: true });
createPersistRoute(server, postRunnerLockTryAcquireHandler, 'persist:locks', { parseJson: jsonCoordination });
createPersistRoute(server, postRunnerLockReleaseHandler, 'persist:locks', { parseJson: jsonCoordination });
createPersistRoute(server, postRunnerLockReleaseAllHandler, 'persist:locks', { parseJson: jsonCoordination });
createPersistRoute(server, getRunnerLockHandler, 'persist:locks', { parseJson: jsonCoordination });

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

interface PersistRouteLayer {
    route?: {
        path?: string | string[];
        stack: { handle: object }[];
    };
}

/**
 * Every `/environment/` route must carry the capability middleware. A route registered with plain
 * `createRoute` has no authentication once the global auth mount is gone.
 */
export function assertPersistRoutesAuthenticated(app: Express = server): void {
    const stack = (app as Express & { router?: { stack?: PersistRouteLayer[] } }).router?.stack;
    if (!stack) {
        throw new Error('persist server has no router stack');
    }
    for (const layer of stack) {
        const route = layer.route;
        if (!route?.path) {
            continue;
        }
        const paths = Array.isArray(route.path) ? route.path : [route.path];
        for (const path of paths) {
            if (!path.startsWith('/environment/')) {
                continue;
            }
            const marked = route.stack.some((entry) => {
                return PERSIST_CAPABILITY in entry.handle && (entry.handle as { [PERSIST_CAPABILITY]?: true })[PERSIST_CAPABILITY] === true;
            });
            if (!marked) {
                throw new Error(`persist route ${path} is not registered with createPersistRoute`);
            }
        }
    }
}

assertPersistRoutesAuthenticated(server);
