import type { Onboarding } from '../models/Onboarding';
import { schema, dbNamespace } from '../db/database.js';
import analytics, { AnalyticsTypes } from '../utils/analytics.js';

const TABLE = dbNamespace + 'onboarding_demo_progress';

const mapAnalytics = (progress: number): AnalyticsTypes => {
    switch (progress) {
        case 1:
            return AnalyticsTypes.ONBOARDING_1;
        case 2:
            return AnalyticsTypes.ONBOARDING_2;
        case 3:
            return AnalyticsTypes.ONBOARDING_3;
        case 4:
            return AnalyticsTypes.ONBOARDING_4;
    }

    return AnalyticsTypes.ONBOARDING_0;
};

export const getOnboardingId = async (user_id: number): Promise<number | null> => {
    const result = await schema().from<Onboarding>(TABLE).select('id').where({ user_id });

    if (!result || result.length == 0 || !result[0]) {
        return null;
    }

    return result[0].id;
};

export const initOrUpdateOnboarding = async (user_id: number, account_id: number): Promise<number | null> => {
    const onboardingId = await getOnboardingId(user_id);

    if (onboardingId) {
        await updateOnboardingProgress(onboardingId, 1, user_id, account_id);

        return onboardingId;
    }

    const result = await schema()
        .from<Onboarding>(TABLE)
        .insert({
            user_id,
            progress: 1,
            complete: false
        })
        .returning('id');

    if (!result || result.length == 0 || !result[0]) {
        return null;
    }

    analytics.track(AnalyticsTypes.ONBOARDING_1, account_id, { user_id });

    return result[0].id as number;
};

export const updateOnboardingProgress = async (id: number, progress: number, user_id: number, account_id: number): Promise<void> => {
    await schema()
        .from<Onboarding>(TABLE)
        .update({
            progress,
            complete: progress === 4
        })
        .where({ id });

    if (progress < 5) {
        analytics.track(mapAnalytics(progress), account_id, { user_id });
    }
};

export const getOnboardingProgress = async (user_id: number): Promise<Pick<Onboarding, 'id' | 'progress'> | null> => {
    const result = await schema().from<Onboarding>(TABLE).select('progress', 'id').where({ user_id });

    if (!result || result.length == 0 || !result[0]) {
        return null;
    }

    return result[0];
};
