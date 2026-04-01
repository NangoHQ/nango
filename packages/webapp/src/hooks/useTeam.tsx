import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { DeleteTeamUser, GetTeam, PatchTeamUser, PutTeam } from '@nangohq/types';

export const teamQueryKey = (env: string) => ['team', env] as const;

export function useTeam(env: string) {
    return useQuery<GetTeam['Success'], APIError>({
        queryKey: teamQueryKey(env),
        queryFn: async () => {
            const res = await apiFetch(`/api/v1/team?env=${env}`, { method: 'GET' });
            const json = (await res.json()) as GetTeam['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        },
        enabled: Boolean(env)
    });
}

export function usePutTeam(env: string) {
    const queryClient = useQueryClient();
    return useMutation<PutTeam['Success'], APIError, PutTeam['Body']>({
        mutationFn: async (body) => {
            const res = await apiFetch(`/api/v1/team?env=${env}`, {
                method: 'PUT',
                body: JSON.stringify(body)
            });
            const json = (await res.json()) as PutTeam['Reply'];
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

export function usePatchTeamUser(env: string) {
    const queryClient = useQueryClient();
    return useMutation<PatchTeamUser['Success'], APIError, PatchTeamUser['Params'] & PatchTeamUser['Body']>({
        mutationFn: async ({ id, role }) => {
            const res = await apiFetch(`/api/v1/team/users/${id}?env=${env}`, {
                method: 'PATCH',
                body: JSON.stringify({ role })
            });
            const json = (await res.json()) as PatchTeamUser['Reply'];
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

export function useDeleteTeamUser(env: string) {
    const queryClient = useQueryClient();
    return useMutation<DeleteTeamUser['Success'], APIError, DeleteTeamUser['Params']>({
        mutationFn: async (params) => {
            const res = await apiFetch(`/api/v1/team/users/${params.id}?env=${env}`, {
                method: 'DELETE'
            });
            const json = (await res.json()) as DeleteTeamUser['Reply'];
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
