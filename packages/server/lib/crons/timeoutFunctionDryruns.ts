import * as cron from 'node-cron';

import { getLocking } from '@nangohq/kvstore';
import { timeoutFunctionDryruns } from '@nangohq/shared';
import { getLogger, report } from '@nangohq/utils';

import type { Lock } from '@nangohq/kvstore';

const logger = getLogger('cron.timeoutFunctionDryruns');
const cronExpression = '* * * * *';
const lockTtlMs = 55 * 1000;

export function timeoutFunctionDryrunsCron(): void {
    cron.schedule(cronExpression, () => {
        exec().catch((err: unknown) => {
            logger.error('Failed to execute function dryrun timeout cron');
            report(new Error('cron_failed_to_timeout_function_dryruns', { cause: err }));
        });
    });
}

export async function exec(): Promise<void> {
    const locking = await getLocking();
    let lock: Lock | undefined;

    try {
        lock = await locking.acquire('lock:functionDryrunsTimeout:cron', lockTtlMs);
    } catch {
        logger.info('Could not acquire lock, skipping');
        return;
    }

    try {
        const count = await timeoutFunctionDryruns();
        if (count > 0) {
            logger.info(`Timed out ${count} function dryruns`);
        }
    } finally {
        await locking.release(lock);
    }
}
