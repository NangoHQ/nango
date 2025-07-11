import { setTimeout } from 'node:timers/promises';

import tracer from 'dd-trace';

import { logger } from '../utils/logger.js';

import type knex from 'knex';

export abstract class SchedulerDaemon {
    private name: string;
    private tickIntervalMs: number;
    private abortSignal: AbortSignal;
    private status: 'running' | 'stopped' = 'stopped';
    private onError: (err: Error) => void;

    protected db: knex.Knex;

    constructor({
        name,
        db,
        tickIntervalMs,
        abortSignal,
        onError
    }: {
        name: string;
        db: knex.Knex;
        tickIntervalMs: number;
        abortSignal: AbortSignal;
        onError: (err: Error) => void;
    }) {
        this.name = name;
        this.tickIntervalMs = tickIntervalMs;
        this.db = db;
        this.abortSignal = abortSignal;
        this.onError = onError;
    }

    async start(): Promise<void> {
        try {
            logger.info(`Starting ${this.name}...`);
            if (this.status !== 'stopped') {
                logger.warning(`${this.name} is already running or cancelled. Cannot start.`);
                return;
            }
            this.status = 'running';
            while (!this.abortSignal.aborted) {
                await tracer.trace(`scheduler.${this.name.toLowerCase()}.run`, async () => {
                    await this.run();
                });
                await setTimeout(this.tickIntervalMs);
            }
        } catch (err) {
            this.onError(new Error(`${this.name} daemon error`, { cause: err }));
        } finally {
            this.status = 'stopped';
        }
    }

    async waitUntilStopped(): Promise<void> {
        try {
            while (this.status !== 'stopped') {
                await setTimeout(100); // Wait until the run loop exits
            }
        } catch (err) {
            this.onError(new Error(`${this.name} daemon stop error`, { cause: err }));
        } finally {
            logger.info(`${this.name} stopped.`);
        }
    }

    abstract run(): Promise<void>;
}
