import db from '@nangohq/database';
import { startOfMonth } from '@nangohq/utils';

import type { UsageMetric } from '../metrics.js';
import type { UsageStore } from './usageStore.js';
import type { DBAccountUsage } from '@nangohq/types';

export class DbUsageStore implements UsageStore {
    async getUsage(accountId: number, metric: UsageMetric, month?: Date): Promise<number> {
        const startOfMonthDate = startOfMonth(month ?? new Date());

        const result = await db.knex.from<DBAccountUsage>('accounts_usage').select(metric).where({ account_id: accountId, month: startOfMonthDate }).first();
        return result?.[metric] ?? 0;
    }

    async setUsage(accountId: number, metric: UsageMetric, value: number, month?: Date): Promise<number> {
        const startOfMonthDate = startOfMonth(month ?? new Date());

        const result = await db.knex
            .from('accounts_usage')
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

        return result[0][metric];
    }

    async incrementUsage(accountId: number, metric: UsageMetric, delta?: number, month?: Date): Promise<number> {
        const startOfMonthDate = startOfMonth(month ?? new Date());
        const incrementValue = delta ?? 1;

        const result = await db.knex
            .from('accounts_usage')
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

        return result[0][metric];
    }
}
