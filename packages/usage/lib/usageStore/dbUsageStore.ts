import db from '@nangohq/database';

import type { UsageMetric } from '../metrics.js';
import type { UsageStore } from './usageStore.js';
import type { DBUsage } from '@nangohq/types';

export class DbUsageStore implements UsageStore {
    async getUsage(accountId: number, metric: UsageMetric, month?: Date): Promise<number> {
        month = this.normalizeMonth(month);

        const result = await db.knex.from<DBUsage>('usage').select(metric).where({ accountId, month }).first();
        return result?.[metric] ?? 0;
    }

    async setUsage(accountId: number, metric: UsageMetric, value: number, month?: Date): Promise<number> {
        month = this.normalizeMonth(month);

        const result = await db.knex
            .from('usage')
            .insert({
                month,
                accountId,
                [metric]: value
            })
            .onConflict(['accountId', 'month'])
            .merge({
                [metric]: value
            })
            .returning('*');

        return result[0][metric];
    }

    async incrementUsage(accountId: number, metric: UsageMetric, delta: number, month?: Date): Promise<number> {
        month = this.normalizeMonth(month);

        const result = await db.knex
            .from('usage')
            .insert({
                month,
                accountId,
                [metric]: delta
            })
            .onConflict(['accountId', 'month'])
            .merge({
                [metric]: db.knex.raw(`${metric} + ${delta}`)
            })
            .returning('*');

        return result[0][metric];
    }

    private normalizeMonth(month?: Date): Date {
        month ??= new Date();
        month.setUTCHours(0, 0, 0, 0);
        month.setUTCDate(1);
        return month;
    }
}
