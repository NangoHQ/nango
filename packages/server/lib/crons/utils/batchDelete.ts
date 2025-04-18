import { setTimeout } from 'node:timers/promises';

import type { Logger } from '@nangohq/types';

export interface BatchDeleteOptions {
    name: string;
    deleteFn: () => Promise<number>;
    deadline: Date;
    limit: number;
    logger: Logger;
}

export type BatchDeleteSharedOptions = Omit<BatchDeleteOptions, 'name' | 'deleteFn'>;

export async function batchDelete({ name, deleteFn, deadline, limit, logger }: BatchDeleteOptions) {
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
            // This will propagate up nested batchDeletes and block any subsequent hardDeletes
            throw new Error('time_limit_reached');
        }
        await setTimeout(1000);
    }
}
