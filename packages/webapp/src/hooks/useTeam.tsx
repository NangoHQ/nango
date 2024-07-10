import useSWR from 'swr';
import { apiFetch, requestErrorToast, swrFetcher } from '../utils/api';
import type { GetTeam, PutTeam } from '@nangohq/types';

export function useTeam(env: string) {
    const { data, error, mutate } = useSWR<GetTeam['Success'], GetTeam['Errors']>(`/api/v1/team?env=${env}`, swrFetcher);

    const loading = !data && !error;

    return {
        loading,
        error,
        team: data?.data.account,
        users: data?.data.users,
        isAdminTeam: data?.data.isAdminTeam,
        invitedUsers: data?.data.invitedUsers,
        mutate
    };
}

export async function apiPutTeam(env: string, body: PutTeam['Body']) {
    try {
        const res = await apiFetch(`/api/v1/team?env=${env}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });

        return {
            res,
            json: (await res.json()) as PutTeam['Reply']
        };
    } catch {
        requestErrorToast();
    }
}
