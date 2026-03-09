import { useQuery } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { AcceptInvite, DeclineInvite, DeleteInvite, GetInvite, PostInvite } from '@nangohq/types';

export function useInvite(token: string | undefined) {
    return useQuery<
        | {
              status: 200;
              json: GetInvite['Success'];
          }
        | {
              status: 400;
              json: GetInvite['Errors'];
          },
        APIError
    >({
        queryKey: ['invite', token],
        queryFn: async () => {
            const res = await apiFetch(`/api/v1/invite/${token}`);

            if (res.status === 200) {
                return {
                    status: res.status,
                    json: (await res.json()) as GetInvite['Success']
                };
            }

            if (res.status === 400) {
                return {
                    status: res.status,
                    json: (await res.json()) as GetInvite['Errors']
                };
            }

            const json = (await res.json()) as Record<string, unknown>;
            throw new APIError({ res, json });
        },
        enabled: !!token
    });
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
