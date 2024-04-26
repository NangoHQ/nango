import type { Res } from '../api';
import type { NangoRecord } from '../record/api';

export type GetOnboardingStatus = Res<{
    Error: { error: { code: 'onboarding_dev_only' | 'no_onboarding' | 'failed_to_get_records' | 'invalid_query_params' } };
    Success: {
        id: number;
        progress: number;
        records: NangoRecord[] | null;
        provider: boolean;
        connection: boolean;
        sync: boolean;
    };
}>;
