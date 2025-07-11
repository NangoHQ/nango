import { apiFetch } from '../utils/api';

import type { PatchOnboarding } from '@nangohq/types';

export async function apiPatchOnboarding(env: string) {
    const res = await apiFetch(`/api/v1/onboarding?env=${env}`, {
        method: 'PATCH'
    });

    return {
        res,
        json: (await res.json()) as PatchOnboarding['Reply']
    };
}
