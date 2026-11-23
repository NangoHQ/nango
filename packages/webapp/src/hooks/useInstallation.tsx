import { useQuery } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { GetInstallation } from '@nangohq/types';

export function useInstallation({ enabled }: { enabled: boolean }) {
    return useQuery<GetInstallation['Success'], APIError>({
        enabled,
        queryKey: ['installation'],
        queryFn: async (): Promise<GetInstallation['Success']> => {
            const res = await apiFetch('/api/v1/installation', { method: 'GET' });
            const json = (await res.json()) as GetInstallation['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        }
    });
}
