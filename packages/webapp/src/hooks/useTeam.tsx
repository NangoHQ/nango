import useSWR from 'swr';

import { apiFetch, swrFetcher } from '../utils/api';

import type { SWRError } from '../utils/api';
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
    const res = await apiFetch(`/api/v1/team?env=${env}`, {
        method: 'PUT',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as PutTeam['Reply']
    };
}

export async function apiDeleteTeamUser(env: string, params: DeleteTeamUser['Params']) {
    const res = await apiFetch(`/api/v1/team/users/${params.id}?env=${env}`, {
        method: 'DELETE'
    });

    return {
        res,
        json: (await res.json()) as DeleteTeamUser['Reply']
    };
}
