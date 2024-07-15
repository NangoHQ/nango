import useSWR from 'swr';
import { apiFetch, requestErrorToast, swrFetcher } from '../utils/api';
import type { DeleteInvite, DeleteTeamUser, GetTeam, PostInvite, PutTeam } from '@nangohq/types';

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
        const res = await apiFetch(`/api/v1/invite?env=${env}`, {
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

export async function apiDeleteInvite(env: string, body: DeleteInvite['Body']) {
    try {
        const res = await apiFetch(`/api/v1/invite?env=${env}`, {
            method: 'DELETE',
            body: JSON.stringify(body)
        });

        return {
            res,
            json: (await res.json()) as DeleteInvite['Reply']
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
