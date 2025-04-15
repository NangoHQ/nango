import * as fs from 'fs';
import type { MessagePort } from 'node:worker_threads';
import { Worker, isMainThread } from 'node:worker_threads';
import { report, stringifyError } from '@nangohq/utils';
import { logger } from '../utils/logger.js';
import { setTimeout } from 'node:timers/promises';
import type knex from 'knex';

interface ExpiredTasksMessage {
    ids: string[];
}

export abstract class SchedulerWorker {
    protected workerUrl: URL;
    protected name: string;
    private worker: Worker | null = null;
    constructor({ name, workerUrl, databaseUrl, databaseSchema }: { name: string; workerUrl: URL; databaseUrl: string; databaseSchema: string }) {
        if (isMainThread) {
            this.name = name;
            this.workerUrl = workerUrl;
            if (!fs.existsSync(workerUrl)) {
                throw new Error(`Code for ${name} worker not found at ${workerUrl.href}`);
            }

            const createWorker = () => {
                this.worker = new Worker(workerUrl, { workerData: { url: databaseUrl, schema: databaseSchema } });

                this.worker.on('error', (err) => {
                    report(`${name} worker error: ${stringifyError(err)}`);
                });

                this.worker.on('exit', (code) => {
                    report(`${name} worker exited with code: ${code}. Restarting...`);
                    this.worker?.removeAllListeners();
                    this.worker = null;
                    createWorker();
                    this.start();
                });
            };
            createWorker();
        } else {
            throw new Error(`${name} worker should be instantiated in the main thread`);
        }
    }

    start(): void {
        this.worker?.postMessage('start');
    }

    stop(): void {
        if (this.worker) {
            this.worker.postMessage('stop');
            this.worker = null;
        }
    }

    on(callback: (message: ExpiredTasksMessage) => void): void {
        this.worker?.on('message', callback);
    }
}

export abstract class SchedulerWorkerChild {
    private name: string;
    private tickIntervalMs: number;

    protected db: knex.Knex;
    protected parent: MessagePort;
    protected cancelled: boolean = false;

    constructor({ name, parent, db, tickIntervalMs }: { name: string; parent: MessagePort; db: knex.Knex; tickIntervalMs: number }) {
        if (isMainThread) {
            throw new Error(`${name} should not be instantiated in the main thread`);
        }
        this.name = name;
        this.tickIntervalMs = tickIntervalMs;
        this.db = db;
        this.parent = parent;
        this.parent.on('message', async (msg: 'start' | 'stop') => {
            switch (msg) {
                case 'start':
                    await this.start();
                    break;
                case 'stop':
                    this.stop();
                    break;
            }
        });
    }

    async start(): Promise<void> {
        logger.info(`Starting ${this.name}...`);

        while (!this.cancelled) {
            await this.run();
            await setTimeout(this.tickIntervalMs);
        }
    }

    stop(): void {
        logger.info(`Stopping ${this.name}...`);
        this.cancelled = true;
    }

    abstract run(): Promise<void>;
}
