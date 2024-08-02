import useSWR from 'swr';
import type { SWRError } from '../utils/api';
import { apiFetch, requestErrorToast, swrFetcher } from '../utils/api';
import type { DeleteTeamUser, GetTeam, PutTeam } from '@nangohq/types';

export function useTeam(env: string) {
    const { data, error, mutate } = useSWR<GetTeam['Success'], SWRError<GetTeam['Errors']>>(`/api/v1/team?env=${env}`, swrFetcher);

    const loading = !data && !error;

    return {
        loading,
        error: error?.json,
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

export async function apiDeleteTeamUser(env: string, params: DeleteTeamUser['Params']) {
    try {
        const res = await apiFetch(`/api/v1/team/users/${params.id}?env=${env}`, {
            method: 'DELETE'
        });

        return {
            res,
            json: (await res.json()) as DeleteTeamUser['Reply']
        };
    } catch {
        requestErrorToast();
    }
}
