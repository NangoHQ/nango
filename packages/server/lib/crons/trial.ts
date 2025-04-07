import tracer from 'dd-trace';
import * as cron from 'node-cron';

import db from '@nangohq/database';
import { getLocking } from '@nangohq/kvstore';
import {
    AnalyticsTypes,
    analytics,
    disableScriptConfig,
    environmentService,
    errorNotificationService,
    getExpiredTrials,
    getSyncsByEnvironmentId,
    getTrialsApproachingExpiration,
    syncManager,
    updatePlan,
    userService
} from '@nangohq/shared';
import { flagHasPlan, getLogger, metrics, report } from '@nangohq/utils';

import { sendTrialAlmostOverEmail, sendTrialHasExpired } from '../helpers/email.js';
import { getOrchestrator } from '../utils/utils.js';

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
                console.log(err);
                report(new Error('cron_failed_to_check_trial', { cause: err }));
            }
            metrics.duration(metrics.Types.CRON_TRIAL, Date.now() - start);
        },
        {
            runOnInit: true
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
            lock = await locking.acquire(lockKey, cronMinutes);
        } catch (err) {
            logger.info(`Could not acquire lock, skipping`, err);
            return;
        }

        // Send email to team that are close to expiration
        const res = await getTrialsApproachingExpiration(db.knex, { daysLeft: daysBeforeTrialIsOver });
        if (res.isOk()) {
            for (const plan of res.value) {
                await updatePlan(db.knex, { id: plan.id, trial_end_notified_at: new Date() });

                logger.info('Trial soon to be over for account', plan.account_id);
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

        // Disable all scripts
        const orchestrator = getOrchestrator();
        const plansToPause = await getExpiredTrials(db.knex);
        for (const plan of plansToPause) {
            logger.info('Trial over for account', plan.account_id);

            const envs = await environmentService.getEnvironmentsByAccountId(plan.account_id);

            for (const env of envs) {
                const syncs = await getSyncsByEnvironmentId(env.id);
                logger.info('  pausing', syncs.length, 'syncs in env', env.name);

                for (const sync of syncs) {
                    const updated = await disableScriptConfig({ id: sync.id, environmentId: sync.environment_id });
                    await errorNotificationService.sync.clearBySyncConfig({ sync_config_id: sync.id });
                    if (updated > 0) {
                        await syncManager.pauseSchedules({ syncConfigId: sync.id, environmentId: sync.environment_id, orchestrator });
                    }
                }
            }

            await updatePlan(db.knex, { id: plan.id, trial_expired: true });

            void analytics.track(AnalyticsTypes.ACCOUNT_TRIAL_EXPIRED, plan.account_id);
            const users = await userService.getUsersByAccountId(plan.account_id);

            // Send in parallel
            await Promise.all(
                users.map(async (user) => {
                    if (!user.email_verified) {
                        return;
                    }

                    logger.info('  Sending mail to', user.id);
                    await sendTrialHasExpired({ user });
                })
            );
        }
    } finally {
        if (lock) {
            locking.release(lock);
        }
    }
}
