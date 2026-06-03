import { setTimeout } from 'node:timers/promises';

import type { StrictLogger } from '@nangohq/utils';

/** Thrown by {@link batchDelete} when the time `deadline` is reached mid-drain. */
export class DeletionBudgetExceeded extends Error {
    constructor(message = 'deletion_budget_exceeded') {
        super(message);
        this.name = 'DeletionBudgetExceeded';
    }
}

export interface BatchDeleteOptions {
    name: string;
    deleteFn: () => Promise<number>;
    deadline: Date;
    limit: number;
    logger: StrictLogger;
    /** Delay between batches */
    sleepMs?: number | undefined;
}

export type BatchDeleteSharedOptions = Omit<BatchDeleteOptions, 'name' | 'deleteFn'>;

export async function batchDelete({ name, deleteFn, deadline, limit, logger, sleepMs = 1000 }: BatchDeleteOptions) {
    while (true) {
        const deleted = await deleteFn();
        if (deleted) {
            logger.info(`Deleted ${deleted} ${name}`);
        }
        if (deleted < limit) {
            break;
        }
        if (Date.now() > deadline.getTime()) {
            logger.info(`Time limit reached, stopping`);
            throw new DeletionBudgetExceeded();
        }
        if (sleepMs > 0) {
            await setTimeout(sleepMs);
        }
    }
}
