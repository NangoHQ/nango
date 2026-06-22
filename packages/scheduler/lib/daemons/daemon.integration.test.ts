import { setTimeout } from 'node:timers/promises';

import { describe, expect, it, vi } from 'vitest';

import { getTestDbClient } from '../db/helpers.test.js';
import { SchedulerDaemon } from './daemon.js';

import type knex from 'knex';

const db = getTestDbClient().db;

describe('SchedulerDaemon', () => {
    it('should be abortable', async () => {
        class TestDaemon extends SchedulerDaemon {
            constructor({ db, abortSignal, onError }: { db: knex.Knex; abortSignal: AbortSignal; onError: (err: Error) => void }) {
                super({ name: 'TestDaemon', db, tickIntervalMs: 1000, abortSignal, onError });
            }

            async run(): Promise<void> {}
        }
        const ac = new AbortController();
        const daemon = new TestDaemon({
            db,
            abortSignal: ac.signal,
            onError: () => {}
        });
        void daemon.start();
        ac.abort();
        await daemon.waitUntilStopped();
    });
    it('should execute onError callback on error', async () => {
        class TestDaemon extends SchedulerDaemon {
            constructor({ db, abortSignal, onError }: { db: knex.Knex; abortSignal: AbortSignal; onError: (err: Error) => void }) {
                super({ name: 'TestDaemon', db, tickIntervalMs: 1000, abortSignal, onError });
            }

            async run(): Promise<void> {
                await setTimeout(1);
                throw new Error('Test error');
            }
        }
        const ac = new AbortController();

        const onError = vi.fn(() => {});
        const daemon = new TestDaemon({
            db,
            abortSignal: ac.signal,
            onError
        });
        await daemon.start();
        expect(onError).toHaveBeenCalledOnce();
    });
    it('should keep ticking after an error when continueOnError is true', async () => {
        class TestDaemon extends SchedulerDaemon {
            constructor({ db, abortSignal, onError }: { db: knex.Knex; abortSignal: AbortSignal; onError: (err: Error) => void }) {
                super({ name: 'TestDaemon', db, tickIntervalMs: 20, abortSignal, onError, continueOnError: true });
            }

            async run(): Promise<void> {
                await setTimeout(1);
                throw new Error('Test error');
            }
        }
        const ac = new AbortController();

        const onError = vi.fn(() => {});
        const daemon = new TestDaemon({
            db,
            abortSignal: ac.signal,
            onError
        });
        void daemon.start();
        // The loop must survive repeated tick errors; wait until it has failed several times.
        for (let i = 0; i < 100 && onError.mock.calls.length < 3; i++) {
            await setTimeout(10);
        }
        ac.abort();
        await daemon.waitUntilStopped();
        expect(onError.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
    it('keeps ticking when onError itself throws, if continueOnError is true', async () => {
        class TestDaemon extends SchedulerDaemon {
            constructor({ db, abortSignal, onError }: { db: knex.Knex; abortSignal: AbortSignal; onError: (err: Error) => void }) {
                super({ name: 'TestDaemon', db, tickIntervalMs: 20, abortSignal, onError, continueOnError: true });
            }

            async run(): Promise<void> {
                await setTimeout(1);
                throw new Error('Test error');
            }
        }
        const ac = new AbortController();

        // A reporter that throws must not itself take the daemon down.
        const onError = vi.fn(() => {
            throw new Error('onError failed');
        });
        const daemon = new TestDaemon({
            db,
            abortSignal: ac.signal,
            onError
        });
        void daemon.start();
        for (let i = 0; i < 100 && onError.mock.calls.length < 3; i++) {
            await setTimeout(10);
        }
        ac.abort();
        await daemon.waitUntilStopped();
        expect(onError.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
});
