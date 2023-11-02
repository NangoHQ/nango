import type { Onboarding } from '../models/Onboarding';
import { schema, dbNamespace } from '../db/database.js';

const TABLE = dbNamespace + 'onboarding_demo_progress';

export const getOnboardingId = async (user_id: number): Promise<number | null> => {
    const result = await schema().from<Onboarding>(TABLE).select('id').where({ user_id });

    if (!result || result.length == 0 || !result[0]) {
        return null;
    }

    return result[0].id;
};

export const initOrUpdateOnboarding = async (user_id: number): Promise<number | null> => {
    const onboardingId = await getOnboardingId(user_id);

    if (onboardingId) {
        await updateOnboardingProgress(onboardingId, 1);

        return onboardingId;
    }

    const result = await schema()
        .from<Onboarding>(TABLE)
        .insert({
            user_id,
            progress: 1,
            sync_data_ready: false,
            complete: false
        })
        .returning('id');

    if (!result || result.length == 0 || !result[0]) {
        return null;
    }

    return result[0].id as number;
};

export const updateOnboardingProgress = async (id: number, progress: number): Promise<void> => {
    await schema()
        .from<Onboarding>(TABLE)
        .update({
            progress
        })
        .where({ id });
};

export const getOnboardingProgress = async (user_id: number): Promise<Pick<Onboarding, 'id' | 'progress'> | null> => {
    const result = await schema().from<Onboarding>(TABLE).select('progress', 'id').where({ user_id });

    if (!result || result.length == 0 || !result[0]) {
        return null;
    }

    return result[0];
};
