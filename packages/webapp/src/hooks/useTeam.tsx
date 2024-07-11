import useSWR from 'swr';
import { apiFetch, requestErrorToast, swrFetcher } from '../utils/api';
import type { GetTeam, PostInvite, PutTeam } from '@nangohq/types';

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

export async function apiPostInvite(env: string, body: PostInvite['Body']) {
    try {
        const res = await apiFetch(`/api/v1/team/invite?env=${env}`, {
            method: 'POST',
            body: JSON.stringify(body)
        });

        return {
            res,
            json: (await res.json()) as PostInvite['Reply']
        };
    } catch {
        requestErrorToast();
    }
}
