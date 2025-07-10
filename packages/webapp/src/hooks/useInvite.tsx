import useSWR from 'swr';

import { apiFetch, swrFetcher } from '../utils/api';

import type { SWRError } from '../utils/api';
import type { AcceptInvite, DeclineInvite, DeleteInvite, GetInvite, PostInvite } from '@nangohq/types';

export function useInvite(token: string | undefined) {
    const { data, error, mutate } = useSWR<GetInvite['Success'], SWRError<GetInvite['Errors']>>(token ? `/api/v1/invite/${token}` : null, swrFetcher);

    const loading = !data && !error;

    return {
        loading,
        error: error?.json,
        data: data?.data,
        mutate
    };
}

export async function apiPostInvite(env: string, body: PostInvite['Body']) {
    const res = await apiFetch(`/api/v1/invite?env=${env}`, {
        method: 'POST',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as PostInvite['Reply']
    };
}

export async function apiDeleteInvite(env: string, body: DeleteInvite['Body']) {
    const res = await apiFetch(`/api/v1/invite?env=${env}`, {
        method: 'DELETE',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as DeleteInvite['Reply']
    };
}

export async function apiAcceptInvite(token: string) {
    const res = await apiFetch(`/api/v1/invite/${token}`, {
        method: 'POST'
    });

    return {
        res,
        json: (await res.json()) as AcceptInvite['Reply']
    };
}

export async function apiDeclineInvite(token: string) {
    const res = await apiFetch(`/api/v1/invite/${token}`, {
        method: 'DELETE'
    });

    return {
        res,
        json: (await res.json()) as DeclineInvite['Reply']
    };
}
