import { KnexDatabase } from '@nangohq/database';

interface GrowthAddonPlan {
    growth_features_starts_at: Date | null;
}

export class PlansDatabase {
    private readonly database = new KnexDatabase();

    async areSchedulesInSync(accountId: string, startsAt: Date): Promise<boolean> {
        const plan = await this.database.knex<GrowthAddonPlan>('plans').where('account_id', accountId).select('growth_features_starts_at').first();
        if (!plan) {
            throw new Error(`Expected one plans row for account ${accountId}, found none`);
        }

        return plan.growth_features_starts_at?.getTime() === startsAt.getTime();
    }

    async setGrowthFeaturesStartsAt(accountId: string, startsAt: Date): Promise<void> {
        const updated = await this.database
            .knex('plans')
            .where('account_id', accountId)
            .update({ growth_features_starts_at: startsAt, updated_at: this.database.knex.fn.now() })
            .returning('id');
        if (updated.length !== 1) {
            throw new Error(`Expected one plans row for account ${accountId}, updated ${updated.length}`);
        }
    }

    async destroy(): Promise<void> {
        await this.database.destroy();
    }
}
