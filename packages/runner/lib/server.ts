/* eslint-disable @typescript-eslint/no-misused-promises */
import { initTRPC, TRPCError } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import timeout from 'connect-timeout';
import express from 'express';
import superjson from 'superjson';

import {
    getInternalServiceAuth,
    INTERNAL_SERVICE_AUDIENCE_RUNNER,
    internalServiceAuthMiddleware,
    isNodeBoundAuth,
    isTaskBoundAuth
} from '@nangohq/internal-auth';

import { abort } from './abort.js';
import { jobsClient } from './clients/jobs.js';
import { PersistClient } from './clients/persist.js';
import { abortCheckIntervalMs, envs, heartbeatIntervalMs } from './env.js';
import { exec } from './exec.js';
import { logger } from './logger.js';
import { HttpLocks } from './sdk/locks.js';
import { abortControllers, distributedCoordination, usage } from './state.js';

import type { InternalAuthEnvs, InternalServiceAuth } from '@nangohq/internal-auth';
import type { NangoProps } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

type RunnerContext = {
    auth: InternalServiceAuth | undefined;
    required: boolean;
};

export const t = initTRPC.context<RunnerContext>().create({
    transformer: superjson
});

const router = t.router;
const publicProcedure = t.procedure;

function taskIdFromRawInput(rawInput: unknown): string | undefined {
    if (!rawInput || typeof rawInput !== 'object') {
        return undefined;
    }
    const taskId = (rawInput as { taskId?: unknown }).taskId;
    return typeof taskId === 'string' && taskId.length > 0 ? taskId : undefined;
}

const taskBoundProcedure = t.procedure.use(({ ctx, rawInput, next }) => {
    if (!ctx.required) {
        return next();
    }
    if (isTaskBoundAuth(ctx.auth, taskIdFromRawInput(rawInput))) {
        return next();
    }
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Unauthorized' });
});

const nodeBoundProcedure = t.procedure.use(({ ctx, next }) => {
    if (!ctx.required) {
        return next();
    }
    if (isNodeBoundAuth(ctx.auth, String(envs.RUNNER_NODE_ID))) {
        return next();
    }
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Unauthorized' });
});

interface StartParams {
    taskId: string;
    nangoProps: NangoProps;
    code: string;
    codeParams?: object;
    internalAuthToken?: string;
}

const appRouter = router({
    health: healthProcedure(),
    abort: abortProcedure(),
    start: startProcedure(),
    notifyWhenIdle: notifyWhenIdleProcedure()
});

export type AppRouter = typeof appRouter;

function healthProcedure() {
    return publicProcedure.query(() => {
        return { status: 'ok' };
    });
}

function startProcedure() {
    return taskBoundProcedure
        .input((input) => input as StartParams)
        .mutation(async (arg): Promise<boolean> => {
            const startTime = Date.now();
            const { taskId, nangoProps, code, codeParams, internalAuthToken } = arg.input;
            logger.info('Received task', {
                taskId: taskId,
                env: nangoProps.environmentId,
                connectionId: nangoProps.connectionId,
                syncId: nangoProps.syncId,
                version: nangoProps.syncConfig.version,
                fileLocation: nangoProps.syncConfig.file_location,
                input: codeParams
            });

            const persistClient = distributedCoordination ? new PersistClient({ secretKey: nangoProps.secretKey }) : undefined;

            // The update to sync tracking is atomic, so we can safely try to track and if it fails, we know there is a conflicting sync
            await usage.track(nangoProps, taskId, persistClient ? { persistClient } : undefined);

            // executing in the background and returning immediately
            // sending the result to the jobs service when done
            setImmediate(async () => {
                let lastSuccessHeartbeatAt: number | null = null;
                const abortController = new AbortController();
                abortControllers.set(taskId, abortController);
                const heartbeatTimeoutMs = arg.input.nangoProps.heartbeatTimeoutSecs
                    ? arg.input.nangoProps.heartbeatTimeoutSecs * 1000
                    : heartbeatIntervalMs * 3;

                const abortPoll = distributedCoordination
                    ? setInterval(async () => {
                          try {
                              const abortRes = await persistClient!.getTaskAbort({ environmentId: nangoProps.environmentId, taskId });
                              if (abortRes.isOk() && abortRes.value) {
                                  logger.info('Aborting task via persist poll', { taskId });
                                  abortController.abort();
                                  clearInterval(abortPoll!);
                              }
                          } catch (err) {
                              logger.error('Error checking abort flag', { taskId, error: err });
                          }
                      }, abortCheckIntervalMs)
                    : null;

                const heartbeat = setInterval(async () => {
                    if (lastSuccessHeartbeatAt && lastSuccessHeartbeatAt + heartbeatTimeoutMs < Date.now()) {
                        // Jobs and orchestrator will kill the task if the heartbeat is not successful for too long
                        // This is to prevent the task from hanging indefinitely if we have trouble reaching orch or the opposite
                        logger.error('Heartbeat failed for too long, self killing task', { taskId });
                        abortController.abort();
                        clearInterval(heartbeat);
                        return;
                    }

                    const res = await jobsClient.postHeartbeat({ taskId, internalAuthToken });
                    if (res.isOk()) {
                        lastSuccessHeartbeatAt = Date.now();
                    }
                    try {
                        await usage.trackForConflicts(taskId, { refresh: true });
                    } catch (err) {
                        logger.error('Failed to update conflict tracking with new ttl', { error: err, taskId });
                    }
                }, heartbeatIntervalMs);

                try {
                    const execRes = await exec({
                        nangoProps,
                        code,
                        codeParams,
                        abortController,
                        ...(persistClient ? { locks: new HttpLocks({ persistClient, environmentId: nangoProps.environmentId }) } : {})
                    });

                    const telemetryBag = execRes.isErr() ? execRes.error.telemetryBag : execRes.value.telemetryBag;
                    telemetryBag.durationMs = Date.now() - startTime;
                    const checkpoints = execRes.isErr() ? execRes.error.checkpoints : execRes.value.checkpoints;
                    await jobsClient.putTask({
                        taskId,
                        nangoProps,
                        ...(execRes.isErr() ? { error: execRes.error.toJSON(), telemetryBag } : { output: execRes.value.output as any, telemetryBag }),
                        functionRuntime: 'runner',
                        checkpoints,
                        internalAuthToken
                    });
                } finally {
                    clearInterval(heartbeat);
                    if (abortPoll) {
                        clearInterval(abortPoll);
                    }
                    abortControllers.delete(taskId);
                    await usage.untrack(taskId);
                    logger.info(`Task ${taskId} completed`);
                }
            });
            return true;
        });
}

function abortProcedure() {
    return taskBoundProcedure
        .input((input) => input as { taskId: string })
        .mutation(({ input }) => {
            logger.info('Received cancel', { input });
            return abort(input.taskId);
        });
}

function notifyWhenIdleProcedure() {
    return nodeBoundProcedure.mutation(() => {
        logger.info('Received notifyWhenIdle');
        usage.resetIdleMaxDurationMs();
        return true;
    });
}

function isHealthPath(req: Request): boolean {
    return req.path === '/health' || req.path === '/health/';
}

export function getServer(authEnvs: InternalAuthEnvs = envs): express.Express {
    const app = express();
    app.use(timeout('24h'));
    // Verify-only: never pass a minting secret. Leftover SIGNING_KEY / TOKEN on the process
    // must not authenticate runner dispatch.
    app.use(
        internalServiceAuthMiddleware({
            audience: INTERNAL_SERVICE_AUDIENCE_RUNNER,
            envs: {
                NANGO_INTERNAL_AUTH_REQUIRED: authEnvs.NANGO_INTERNAL_AUTH_REQUIRED,
                NANGO_INTERNAL_AUTH_RUNNER_PUBLIC_KEY: authEnvs.NANGO_INTERNAL_AUTH_RUNNER_PUBLIC_KEY
            },
            skip: isHealthPath
        })
    );
    app.use(
        '/',
        trpcExpress.createExpressMiddleware({
            router: appRouter,
            createContext: ({ res }): RunnerContext => ({
                auth: getInternalServiceAuth(res),
                required: authEnvs.NANGO_INTERNAL_AUTH_REQUIRED
            })
        })
    );
    app.use(haltOnTimedout);
    return app;
}

export const server = getServer();

function haltOnTimedout(req: Request, _res: Response, next: NextFunction) {
    if (!req.timedout) next();
}
