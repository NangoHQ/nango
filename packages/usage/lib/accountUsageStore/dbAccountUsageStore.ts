import db from '@nangohq/database';
import { startOfMonth } from '@nangohq/utils';

import type { AccountUsageStore, GetUsageParams, IncrementUsageParams, SetUsageParams } from './accountUsageStore.js';
import type { DBAccountUsage } from '@nangohq/types';

/**
 * A database backed account usage store. Directly tied to `accounts_usage` table.
 */
export class DbAccountUsageStore implements AccountUsageStore {
    async getUsage({ accountId, metric, month }: GetUsageParams): Promise<number> {
        const startOfMonthDate = startOfMonth(month ?? new Date());

        const result = await db.knex.from<DBAccountUsage>('accounts_usage').select(metric).where({ account_id: accountId, month: startOfMonthDate }).first();
        return result?.[metric] ?? 0;
    }

    async setUsage({ accountId, metric, value, month }: SetUsageParams): Promise<number> {
        const startOfMonthDate = startOfMonth(month ?? new Date());

        const result = await db.knex
            .from<DBAccountUsage>('accounts_usage')
            .insert({
                month: startOfMonthDate,
                account_id: accountId,
                [metric]: value
            })
            .onConflict(['account_id', 'month'])
            .merge({
                [metric]: value
            })
            .returning('*');

        return result[0]?.[metric] ?? value;
    }

    async incrementUsage({ accountId, metric, delta, month }: IncrementUsageParams): Promise<number> {
        const startOfMonthDate = startOfMonth(month ?? new Date());
        const incrementValue = delta ?? 1;

        const result = await db.knex
            .from<DBAccountUsage>('accounts_usage')
            .insert({
                month: startOfMonthDate,
                account_id: accountId,
                [metric]: incrementValue
            })
            .onConflict(['account_id', 'month'])
            .merge({
                [metric]: db.knex.raw('COALESCE(??, 0) + ?', [metric, incrementValue])
            })
            .returning('*');

        return result[0]?.[metric] ?? 0;
    }
}
