import type { Onboarding } from '../models/Onboarding';
import db, { schema, dbNamespace } from '../db/database.js';
import analytics, { AnalyticsTypes } from '../utils/analytics.js';
import configService from './config.service';
import type { Config } from '../models';
import { NangoError } from '../utils/error';

export const DEFAULT_GITHUB_CLIENT_ID = process.env['DEFAULT_GITHUB_CLIENT_ID'] || '';
export const DEFAULT_GITHUB_CLIENT_SECRET = process.env['DEFAULT_GITHUB_CLIENT_SECRET'] || '';
export const DEMO_GITHUB_CONFIG_KEY = 'demo-github-integration';

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

export const initOnboarding = async (user_id: number, account_id: number): Promise<number | null> => {
    const onboardingId = await getOnboardingId(user_id);

    if (onboardingId) {
        return onboardingId;
    }

    const result = await schema()
        .from<Required<Onboarding>>(TABLE)
        .insert({
            user_id,
            progress: 0,
            complete: false
        })
        .returning('id');

    if (!result || result.length == 0 || !result[0]) {
        return null;
    }

    void analytics.track(AnalyticsTypes.ONBOARDING_1, account_id, { user_id });

    return result[0].id;
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
        void analytics.track(mapAnalytics(progress), account_id, { user_id });
    }
};

export const getOnboardingProgress = async (user_id: number): Promise<Pick<Onboarding, 'id' | 'progress'> | undefined> => {
    const result = await db.knex.from<Onboarding>(TABLE).select<Pick<Onboarding, 'progress' | 'id'>>('progress', 'id').where({ user_id }).first();
    return result;
};

/**
 * Create Default Provider Config
 * @desc create a default Github config only for the dev environment
 */
export async function createOnboardingProvider(envId: number): Promise<void> {
    const config: Config = {
        environment_id: envId,
        unique_key: DEMO_GITHUB_CONFIG_KEY,
        provider: 'github',
        oauth_client_id: DEFAULT_GITHUB_CLIENT_ID,
        oauth_client_secret: DEFAULT_GITHUB_CLIENT_SECRET,
        oauth_scopes: 'public_repo'
    };

    await configService.createProviderConfig(config);
}

export async function getOnboardingProvider(envId: number): Promise<Config | null> {
    return await configService.getProviderConfig(DEMO_GITHUB_CONFIG_KEY, envId);
}
