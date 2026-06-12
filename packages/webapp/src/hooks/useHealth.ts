import useSWR from 'swr';

import { useStore } from '@/store';
import { swrFetcher } from '@/utils/api';

import type { SWRError } from '@/utils/api';
import type { ApiError, ExecutionEvent, IntegrationHealthMetric } from '@nangohq/types';

type HealthError = SWRError<ApiError<'server_error'>>;

export const useIntegrationHealth = () => {
    const env = useStore((state) => state.env);

    return useSWR<IntegrationHealthMetric[], HealthError>(`/api/v1/health/integrations?env=${env}`, swrFetcher);
};

export const useIntegrationTimeline = (integrationId: string | null) => {
    const env = useStore((state) => state.env);

    return useSWR<ExecutionEvent[], HealthError>(
        integrationId ? `/api/v1/health/integrations/${encodeURIComponent(integrationId)}/timeline?env=${env}` : null,
        swrFetcher
    );
};
