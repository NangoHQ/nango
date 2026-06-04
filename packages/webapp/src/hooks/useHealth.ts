import useSWR from 'swr';

import { useStore } from '@/store';

import type { ExecutionEvent, IntegrationHealthMetric } from '@nangohq/types';

export const useIntegrationHealth = () => {
    const env = useStore((state) => state.env);

    return useSWR<IntegrationHealthMetric[]>(`/${env}/health/integrations`);
};

export const useIntegrationTimeline = (integrationId: string | null) => {
    const env = useStore((state) => state.env);

    return useSWR<ExecutionEvent[]>(integrationId ? `/${env}/health/integrations/${integrationId}/timeline` : null);
};
