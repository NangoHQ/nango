import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { GetConnectUISettings, PutConnectUISettings } from '@nangohq/types';

export function useConnectUISettings(env: string) {
    return useQuery<GetConnectUISettings['Success'], APIError>({
        enabled: Boolean(env),
        queryKey: [env, 'connect-ui-settings'],
        queryFn: async () => {
            const res = await apiFetch(`/api/v1/connect-ui-settings?env=${env}`);

            const json = (await res.json()) as GetConnectUISettings['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        }
    });
}

export function useUpdateConnectUISettings(env: string) {
    const queryClient = useQueryClient();
    return useMutation<PutConnectUISettings['Success'], APIError, PutConnectUISettings['Body']>({
        mutationFn: async (data: PutConnectUISettings['Body']) => {
            const res = await apiFetch(`/api/v1/connect-ui-settings?env=${env}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });

            const json = (await res.json()) as PutConnectUISettings['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: [env, 'connect-ui-settings'] });
        }
    });
}
