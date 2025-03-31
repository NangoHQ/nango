import tracer from 'dd-trace';
import * as cron from 'node-cron';

import db from '@nangohq/database';
import { getLocking } from '@nangohq/kvstore';
import { AnalyticsTypes, analytics, getTrialCloseToFinish, updatePlan, userService } from '@nangohq/shared';
import { flagHasPlan, getLogger, metrics, report } from '@nangohq/utils';

import { sendTrialAlmostOverEmail } from '../helpers/email.js';

import type { Lock } from '@nangohq/kvstore';

const cronMinutes = 120;
const daysBeforeTrialIsOver = 3;

const logger = getLogger('cron.trial');

export function trialCron(): void {
    if (!flagHasPlan) {
        return;
    }

    cron.schedule(
        `*/${cronMinutes} * * * *`,
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async () => {
            const start = Date.now();
            try {
                await tracer.trace<Promise<void>>('nango.cron.trial', async () => {
                    await exec();
                });

                logger.info('✅ done');
            } catch (err) {
                report(new Error('cron_failed_to_check_trial', { cause: err }));
            }
            metrics.duration(metrics.Types.CRON_TRIAL, Date.now() - start);
        }
    );
}

export async function exec(): Promise<void> {
    const locking = await getLocking();

    logger.info(`Starting`);

    const lockKey = `lock:trial:cron`;
    let lock: Lock | undefined;
    try {
        try {
            lock = await locking.acquire(lockKey, 60 * 1000);
        } catch (err) {
            logger.info(`Could not acquire lock, skipping`, err);
            return;
        }

        // Send email to team that are close to expiration
        const res = await getTrialCloseToFinish(db.knex, { inDays: daysBeforeTrialIsOver });
        if (res.length > 0) {
            for (const plan of res) {
                await updatePlan(db.knex, { id: plan.id, trial_end_notified_at: new Date() });

                logger.info('Trial over for account', plan.account_id);
                void analytics.track(AnalyticsTypes.ACCOUNT_TRIAL_EXPIRING_MAIL, plan.account_id);

                const users = await userService.getUsersByAccountId(plan.account_id);

                // Send in parallel
                await Promise.all(
                    users.map(async (user) => {
                        if (!user.email_verified) {
                            return;
                        }

                        logger.info('  Sending mail to', user.id);
                        await sendTrialAlmostOverEmail({ user, inDays: daysBeforeTrialIsOver });
                    })
                );
            }
        }

        // TODO: Do something when trial end
    } finally {
        if (lock) {
            locking.release(lock);
        }
    }
}
