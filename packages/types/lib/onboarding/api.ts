import type { Endpoint } from '../api';

export type PatchOnboarding = Endpoint<{
    Method: 'PATCH';
    Path: '/api/v1/onboarding';
    Querystring: { env: string };
    Success: {
        data: { success: boolean };
    };
}>;
