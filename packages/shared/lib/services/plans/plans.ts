import ms from 'ms';

import { Err, Ok } from '@nangohq/utils';

import { freePlan, isPotentialDowngrade, plansList } from './definitions.js';
import { productTracking } from '../../utils/productTracking.js';

import type { DBPlan, DBTeam, PlanDefinition } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

export const TRIAL_DURATION = ms('15days');

export async function getPlan(db: Knex, { accountId }: { accountId: number }): Promise<Result<DBPlan>> {
    try {
        const res = await db.from<DBPlan>('plans').select<DBPlan>('*').where('account_id', accountId).first();
        return res ? Ok(res) : Err(new Error('unknown_plan_for_account'));
    } catch (err) {
        return Err(new Error('failed_to_get_plan', { cause: err }));
    }
}

export async function getPlanBy(db: Knex, opts: Partial<Pick<DBPlan, 'stripe_customer_id'>>): Promise<Result<DBPlan>> {
    if (Object.keys(opts).length <= 0) {
        return Err(new Error('getPlanBy_missing_opts'));
    }
    try {
        const query = db.from<DBPlan>('plans').select<DBPlan>('*');
        if (opts.stripe_customer_id) {
            query.where('stripe_customer_id', opts.stripe_customer_id);
        }
        const res = await query.first();
        return res ? Ok(res) : Err(new Error('unknown_plan_for_condition'));
    } catch (err) {
        return Err(new Error('failed_to_get_plan', { cause: err }));
    }
}

export async function createPlan(
    db: Knex,
    { account_id, ...rest }: Pick<DBPlan, 'account_id' | 'name'> & Partial<Omit<DBPlan, 'account_id' | 'created_at' | 'updated_at'>>
): Promise<Result<DBPlan>> {
    try {
        const res = await db
            .from<DBPlan>('plans')
            .insert({
                ...rest,
                created_at: new Date(),
                updated_at: new Date(),
                account_id
            })
            .onConflict('account_id')
            .ignore()
            .returning('*');
        return Ok(res[0]!);
    } catch (err) {
        return Err(new Error('failed_to_create_plan', { cause: err }));
    }
}

export async function updatePlan(db: Knex, { id, ...data }: Pick<DBPlan, 'id'> & Partial<Omit<DBPlan, 'id'>>): Promise<Result<boolean>> {
    try {
        await db
            .from<DBPlan>('plans')
            .where('id', id)
            .update({ ...data, updated_at: new Date() });
        return Ok(true);
    } catch (err) {
        return Err(new Error('failed_to_update_plan', { cause: err }));
    }
}

export async function updatePlanByTeam(
    db: Knex,
    { account_id, ...data }: Pick<DBPlan, 'account_id'> & Partial<Omit<DBPlan, 'id' | 'account_id'>>
): Promise<Result<boolean>> {
    try {
        await db
            .from<DBPlan>('plans')
            .where('account_id', account_id)
            .update({ ...data, updated_at: db.fn.now() });
        return Ok(true);
    } catch (err) {
        return Err(new Error('failed_to_update_plan', { cause: err }));
    }
}

export async function startTrial(db: Knex, plan: DBPlan): Promise<Result<boolean>> {
    return await updatePlan(db, {
        id: plan.id,
        trial_start_at: plan.trial_start_at || new Date(),
        trial_end_at: new Date(Date.now() + TRIAL_DURATION),
        trial_end_notified_at: null,
        trial_extension_count: plan.trial_extension_count + 1,
        trial_expired: false
    });
}

export async function getTrialsApproachingExpiration(db: Knex, { daysLeft }: { daysLeft: number }): Promise<Result<DBPlan[]>> {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() + daysLeft);
    try {
        const res = await db
            .from<DBPlan>('plans')
            .select<DBPlan[]>('plans.*')
            .join('_nango_accounts', '_nango_accounts.id', 'plans.account_id')
            .where('trial_end_at', '<=', dateThreshold.toISOString())
            .whereNull('trial_end_notified_at');
        return Ok(res);
    } catch (err) {
        return Err(new Error('failed_to_get_trials', { cause: err }));
    }
}

export async function getExpiredTrials(db: Knex): Promise<DBPlan[]> {
    return await db
        .from('plans')
        .select<DBPlan[]>('*')
        .where('plans.trial_end_at', '<=', db.raw('NOW()'))
        .where((b) => b.where('plans.trial_expired', false).orWhereNull('plans.trial_expired'));
}

export async function handlePlanChanged(
    db: Knex,
    team: DBTeam,
    { newPlanCode, orbCustomerId, orbSubscriptionId }: { newPlanCode: string; orbCustomerId?: string | undefined; orbSubscriptionId: string }
): Promise<Result<boolean>> {
    const newPlan = plansList.find((p) => p.code === newPlanCode);
    if (!newPlan) {
        return Err('Received a plan not linked to the plansList');
    }

    const currentPlan = await getPlan(db, { accountId: team.id });
    if (currentPlan.isErr()) {
        return Err(new Error('Failed to get current plan', { cause: currentPlan.error }));
    }

    // Plan hasn't changed
    if (currentPlan.value.name === newPlan.code) {
        return Ok(true);
    }

    // Merge current plan flags with new plan defaults
    const mergedFlags = mergeFlags({ currentPlan: currentPlan.value, newPlanDefinition: newPlan });

    // Only update subscription date from free to paid (undefined = no update)
    const isCurrentFree = currentPlan.value.name === freePlan.code;
    const isNewPaid = newPlan.code !== freePlan.code;

    const updated = await updatePlanByTeam(db, {
        account_id: team.id,
        name: newPlan.code,
        orb_subscription_id: orbSubscriptionId,
        orb_future_plan: null,
        orb_future_plan_at: null,
        ...(orbCustomerId ? { orb_customer_id: orbCustomerId } : {}),
        ...(isCurrentFree && isNewPaid ? { orb_subscribed_at: new Date() } : {}),
        ...mergedFlags
    });

    if (updated.isErr()) {
        return Err(new Error('Failed to updated plan', { cause: updated.error }));
    }

    productTracking.track({
        name: 'account:billing:plan_changed',
        team,
        eventProperties: { previousPlan: currentPlan.value.name, newPlan: newPlanCode, orbCustomerId: currentPlan.value.orb_customer_id }
    });

    return Ok(true);
}

export function mergeFlags({ currentPlan, newPlanDefinition }: { currentPlan: DBPlan; newPlanDefinition: PlanDefinition }): PlanDefinition['flags'] {
    // Downgrades always use new plan defaults and reset any overrides
    if (isPotentialDowngrade({ from: currentPlan.name, to: newPlanDefinition.code })) {
        return newPlanDefinition.flags;
    }

    const overrides: Partial<PlanDefinition['flags']> = {};
    const keys = Object.keys(currentPlan) as (keyof DBPlan)[];
    for (const key of keys) {
        const isFlagKey = ((key: keyof DBPlan): key is keyof PlanDefinition['flags'] & keyof DBPlan => {
            return key in newPlanDefinition.flags;
        })(key);

        // Skip keys that are not plan flags
        if (!isFlagKey) continue;

        // Skip undefined values in new plan flags
        if (newPlanDefinition.flags[key] === undefined) continue;

        switch (key) {
            // These are not plan flags, skip them
            case 'stripe_customer_id':
            case 'stripe_payment_id':
            case 'orb_customer_id':
            case 'orb_subscription_id':
            case 'orb_future_plan':
            case 'orb_future_plan_at':
            case 'orb_subscribed_at':
            case 'trial_start_at':
            case 'trial_end_at':
            case 'trial_extension_count':
            case 'trial_end_notified_at':
            case 'trial_expired':
            case 'created_at':
            case 'updated_at':
                break;
            // BOOLEAN FLAGS - keep override if false
            case 'auto_idle': {
                overrides[key] = !currentPlan[key] ? false : newPlanDefinition.flags[key];
                break;
            }
            // BOOLEAN FLAGS - keep override if true
            case 'has_otel':
            case 'has_sync_variants':
            case 'has_webhooks_script':
            case 'has_webhooks_forward':
            case 'can_disable_connect_ui_watermark':
            case 'can_override_docs_connect_url':
            case 'can_customize_connect_ui_theme': {
                overrides[key] = currentPlan[key] ? true : newPlanDefinition.flags[key];
                break;
            }
            // NUMBER FLAGS - keep override if higher, null means unlimited
            case 'webhook_forwards_max':
            case 'monthly_actions_max':
            case 'monthly_active_records_max':
            case 'connections_max':
            case 'records_max':
            case 'proxy_max':
            case 'function_executions_max':
            case 'function_compute_gbms_max':
            case 'function_logs_max': {
                const currentValue = currentPlan[key];
                const newValue = newPlanDefinition.flags[key] || 0;
                if (currentValue === null || currentValue > newValue) {
                    overrides[key] = null;
                }
                break;
            }
            // NUMBER FLAGS - keep override if higher
            case 'environments_max': {
                const currentValue = currentPlan[key];
                const newValue = newPlanDefinition.flags[key] || 0;
                if (currentValue > newValue) {
                    overrides[key] = currentValue;
                }
                break;
            }
            // NUMBER FLAGS - keep override if lower
            case 'sync_frequency_secs_min': {
                const currentValue = currentPlan[key];
                const newValue = newPlanDefinition.flags[key] || 0;
                if (currentValue < newValue) {
                    overrides[key] = currentValue;
                }
                break;
            }
            // SPECIAL CASES
            case 'api_rate_limit_size': {
                const sizeIndex: Record<DBPlan['api_rate_limit_size'], number> = {
                    s: 1,
                    m: 2,
                    l: 3,
                    xl: 4,
                    '2xl': 5,
                    '3xl': 6,
                    '4xl': 7
                };
                const currentIndex = sizeIndex[currentPlan[key]];
                const newIndex = sizeIndex[newPlanDefinition.flags[key]];
                if (currentIndex > newIndex) {
                    overrides[key] = currentPlan[key];
                }
                break;
            }
            default:
                ((_exhaustiveCheck: never) => {
                    throw new Error(`Unhandled plan flag key in mergeFlags: ${key}`);
                })(key);
        }
    }

    return { ...newPlanDefinition.flags, ...overrides };
}
