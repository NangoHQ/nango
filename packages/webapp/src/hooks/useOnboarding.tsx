import type { PatchOnboarding } from '@nangohq/types';
import { apiFetch } from '../utils/api';

export async function apiPatchOnboarding(env: string) {
    const res = await apiFetch(`/api/v1/onboarding?env=${env}`, {
        method: 'PATCH'
    });

    return {
        res,
        json: (await res.json()) as PatchOnboarding['Reply']
    };
}
