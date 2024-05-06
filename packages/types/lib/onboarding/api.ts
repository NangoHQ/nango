import type { ApiError, Endpoint } from '../api';
import type { NangoRecord } from '../record/api';

export type GetOnboardingStatus = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/onboarding';
    Querystring: { env: string };
    Error: ApiError<'onboarding_dev_only'> | ApiError<'no_onboarding'> | ApiError<'failed_to_get_records'> | ApiError<'invalid_query_params'>;
    Success: {
        id: number;
        progress: number;
        records: NangoRecord[] | null;
        provider: boolean;
        connection: boolean;
        sync: boolean;
    };
}>;
