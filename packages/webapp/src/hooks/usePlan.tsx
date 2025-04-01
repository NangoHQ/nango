import { apiFetch } from '../utils/api';

import type { PostPlanExtendTrial } from '@nangohq/types';

export async function apiPostPlanExtendTrial(env: string) {
    const res = await apiFetch(`/api/v1/plan/extend_trial?env=${env}`, {
        method: 'POST'
    });

    return {
        res,
        json: (await res.json()) as PostPlanExtendTrial['Reply']
    };
}
