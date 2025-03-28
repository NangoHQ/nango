import type { DBPlan } from '@nangohq/types';

export function getTestPlan(override?: Partial<DBPlan>): DBPlan {
    return {
        id: 1,
        account_id: 1,
        name: 'free',
        trial_start_at: new Date(),
        trial_end_at: new Date(),
        trial_extension_count: 0,
        max_environments: 2,
        min_sync_frequency: 60,
        max_connection_with_scripts: 3,
        has_sync_variant: true,
        created_at: new Date(),
        updated_at: new Date(),
        ...override
    };
}
