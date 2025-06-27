import { setTimeout } from 'node:timers/promises';

import { describe, expect, it, vi } from 'vitest';

import { SchedulerDaemon } from './daemon.js';
import { getTestDbClient } from '../db/helpers.test.js';

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
});
