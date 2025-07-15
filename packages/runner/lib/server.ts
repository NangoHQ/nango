/* eslint-disable @typescript-eslint/no-misused-promises */
import { initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import timeout from 'connect-timeout';
import express from 'express';
import superjson from 'superjson';

import { abort } from './abort.js';
import { jobsClient } from './clients/jobs.js';
import { envs, heartbeatIntervalMs } from './env.js';
import { exec } from './exec.js';
import { logger } from './logger.js';
import { RunnerMonitor } from './monitor.js';
import { Locks } from './sdk/locks.js';
import { abortControllers } from './state.js';

import type { NangoProps } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

export const t = initTRPC.create({
    transformer: superjson
});

const router = t.router;
const publicProcedure = t.procedure;

interface StartParams {
    taskId: string;
    nangoProps: NangoProps;
    code: string;
    codeParams?: object;
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

const usage = new RunnerMonitor({ runnerId: envs.RUNNER_NODE_ID });
const locks = new Locks();

function startProcedure() {
    return publicProcedure
        .input((input) => input as StartParams)
        .mutation((arg): boolean => {
            const { taskId, nangoProps, code, codeParams } = arg.input;
            logger.info('Received task', {
                taskId: taskId,
                env: nangoProps.environmentId,
                connectionId: nangoProps.connectionId,
                syncId: nangoProps.syncId,
                version: nangoProps.syncConfig.version,
                fileLocation: nangoProps.syncConfig.file_location,
                input: codeParams
            });

            // Sometimes we can receive the same job (http retry) or a job for the same sync (orchestrator miss scheduling)
            // Here is the last safety net to be sure nothing runs in parallel
            if (usage.hasConflictingSync(nangoProps)) {
                logger.error('Conflicting sync detected', { syncId: nangoProps.syncId });
                throw new Error('Conflicting sync detected');
            }

            usage.track(nangoProps);
            // executing in the background and returning immediately
            // sending the result to the jobs service when done
            setImmediate(async () => {
                let lastSuccessHeartbeatAt: number | null = null;
                const abortController = new AbortController();
                abortControllers.set(taskId, abortController);
                const heartbeatTimeoutMs = arg.input.nangoProps.heartbeatTimeoutSecs
                    ? arg.input.nangoProps.heartbeatTimeoutSecs * 1000
                    : heartbeatIntervalMs * 3;

                const heartbeat = setInterval(async () => {
                    if (lastSuccessHeartbeatAt && lastSuccessHeartbeatAt + heartbeatTimeoutMs < Date.now()) {
                        // Jobs and orchestrator will kill the task if the heartbeat is not successful for too long
                        // This is to prevent the task from hanging indefinitely if we have trouble reaching orch or the opposite
                        logger.error('Heartbeat failed for too long, self killing task', { taskId });
                        abortController.abort();
                        clearInterval(heartbeat);
                        return;
                    }

                    const res = await jobsClient.postHeartbeat({ taskId });
                    if (res.isOk()) {
                        lastSuccessHeartbeatAt = Date.now();
                    }
                }, heartbeatIntervalMs);

                try {
                    const { error, response: output } = await exec({ nangoProps, code, codeParams, abortController, locks });

                    await jobsClient.putTask({
                        taskId,
                        nangoProps,
                        ...(error ? { error } : { output: output as any })
                    });
                } finally {
                    clearInterval(heartbeat);
                    abortControllers.delete(taskId);
                    usage.untrack(nangoProps);
                    logger.info(`Task ${taskId} completed`);
                }
            });
            return true;
        });
}

function abortProcedure() {
    return publicProcedure
        .input((input) => input as { taskId: string })
        .mutation(({ input }) => {
            logger.info('Received cancel', { input });
            return abort(input.taskId);
        });
}

function notifyWhenIdleProcedure() {
    return publicProcedure.mutation(() => {
        logger.info('Received notifyWhenIdle');
        usage.resetIdleMaxDurationMs();
        return true;
    });
}

export const server = express();
server.use(timeout('24h'));
server.use(
    '/',
    trpcExpress.createExpressMiddleware({
        router: appRouter,
        createContext: () => ({})
    })
);
server.use(haltOnTimedout);

function haltOnTimedout(req: Request, _res: Response, next: NextFunction) {
    if (!req.timedout) next();
}
