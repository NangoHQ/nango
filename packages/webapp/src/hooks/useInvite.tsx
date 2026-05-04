import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { teamQueryKey } from './useTeam';
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

export function usePostInvite(env: string) {
    const queryClient = useQueryClient();
    return useMutation<PostInvite['Success'], APIError, PostInvite['Body']>({
        mutationFn: async (body) => {
            const res = await apiFetch(`/api/v1/invite?env=${env}`, {
                method: 'POST',
                body: JSON.stringify(body)
            });
            const json = (await res.json()) as PostInvite['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: teamQueryKey(env) });
        }
    });
}

export function useDeleteInvite(env: string) {
    const queryClient = useQueryClient();
    return useMutation<DeleteInvite['Success'], APIError, DeleteInvite['Body']>({
        mutationFn: async (body) => {
            const res = await apiFetch(`/api/v1/invite?env=${env}`, {
                method: 'DELETE',
                body: JSON.stringify(body)
            });
            const json = (await res.json()) as DeleteInvite['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: teamQueryKey(env) });
        }
    });
}

export function useAcceptInvite() {
    return useMutation<AcceptInvite['Success'], APIError, { token: string }>({
        mutationFn: async ({ token }) => {
            const res = await apiFetch(`/api/v1/invite/${token}`, { method: 'POST' });
            const json = (await res.json()) as AcceptInvite['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        }
    });
}

export function useDeclineInvite() {
    return useMutation<DeclineInvite['Success'], APIError, { token: string }>({
        mutationFn: async ({ token }) => {
            const res = await apiFetch(`/api/v1/invite/${token}`, { method: 'DELETE' });
            const json = (await res.json()) as DeclineInvite['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        }
    });
}
