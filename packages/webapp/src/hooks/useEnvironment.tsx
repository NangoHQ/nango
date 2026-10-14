import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';
import { metaQueryKey } from './useMeta';

import type { SlackAdminAuth } from '../utils/slack-connection';
import type {
    ApiError,
    GetEnvironment,
    PatchEnvironment,
    PatchWebhook,
    PostEnvironment,
    PostEnvironmentVariables,
    PostRotateWebhookSigningKey
} from '@nangohq/types';

export const environmentQueryKey = (env: string) => [env, 'environment'] as const;

export function useEnvironment(env: string) {
    return useQuery<GetEnvironment['Success'], APIError>({
        enabled: Boolean(env),
        queryKey: environmentQueryKey(env),
        queryFn: async (): Promise<GetEnvironment['Success']> => {
            const res = await apiFetch(`/api/v1/environments/current?env=${env}`);

            const json = (await res.json()) as GetEnvironment['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        }
    });
}

export function usePatchEnvironment(env: string) {
    const queryClient = useQueryClient();
    return useMutation<PatchEnvironment['Success'], APIError, PatchEnvironment['Body']>({
        mutationFn: async (body) => {
            const res = await apiFetch(`/api/v1/environments?env=${env}`, {
                method: 'PATCH',
                body: JSON.stringify(body)
            });

            const json = (await res.json()) as PatchEnvironment['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: environmentQueryKey(env) });
        }
    });
}

export function useConnectionHmac(env: string, providerConfigKey: string | undefined, connectionId: string, enabled: boolean) {
    return useQuery<string, APIError>({
        enabled: enabled && Boolean(env && providerConfigKey && connectionId),
        queryKey: [env, 'environment', 'hmac', providerConfigKey, connectionId],
        queryFn: async () => {
            const res = await apiFetch(`/api/v1/environment/hmac?env=${env}&connection_id=${connectionId}&provider_config_key=${providerConfigKey}`);

            const json = (await res.json()) as { hmac_digest: string | null } | ApiError<string>;
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json.hmac_digest ?? '';
        }
    });
}

export function useSlackAdminAuth(env: string) {
    return useMutation<SlackAdminAuth, APIError, { connectionId: string }>({
        mutationFn: async ({ connectionId }) => {
            const res = await apiFetch(`/api/v1/environment/admin-auth?connection_id=${connectionId}&env=${env}`);

            const json = (await res.json()) as SlackAdminAuth | ApiError<string>;
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        }
    });
}

export function useDisconnectSlack(env: string) {
    return useMutation<void, APIError, { connectionId: string }>({
        mutationFn: async ({ connectionId }) => {
            const res = await apiFetch(`/api/v1/connections/admin/${connectionId}?env=${env}`, { method: 'DELETE' });
            if (res.status !== 204) {
                throw new APIError({ res, json: (await res.json().catch(() => ({}))) as Record<string, unknown> });
            }
        }
    });
}

export function usePatchWebhook(env: string) {
    const queryClient = useQueryClient();
    return useMutation<PatchWebhook['Success'], APIError, PatchWebhook['Body']>({
        mutationFn: async (body) => {
            const res = await apiFetch(`/api/v1/environments/webhook?env=${env}`, {
                method: 'PATCH',
                body: JSON.stringify(body)
            });

            const json = (await res.json()) as PatchWebhook['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: environmentQueryKey(env) });
        }
    });
}

export function usePostRotateWebhookSigningKey(env: string) {
    const queryClient = useQueryClient();
    return useMutation<PostRotateWebhookSigningKey['Success'], APIError>({
        mutationFn: async () => {
            const res = await apiFetch(`/api/v1/environment/webhook-signing-key/rotate?env=${env}`, {
                method: 'POST'
            });

            const json = (await res.json()) as PostRotateWebhookSigningKey['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: environmentQueryKey(env) });
        }
    });
}

export function usePostVariables(env: string) {
    const queryClient = useQueryClient();
    return useMutation<PostEnvironmentVariables['Success'], APIError, PostEnvironmentVariables['Body']>({
        mutationFn: async (body) => {
            const res = await apiFetch(`/api/v1/environments/variables?env=${env}`, {
                method: 'POST',
                body: JSON.stringify(body)
            });

            const json = (await res.json()) as PostEnvironmentVariables['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: environmentQueryKey(env) });
        }
    });
}

export function usePostEnvironment() {
    const queryClient = useQueryClient();
    return useMutation<PostEnvironment['Success'], APIError, PostEnvironment['Body']>({
        mutationFn: async (body) => {
            const res = await apiFetch('/api/v1/environments', {
                method: 'POST',
                body: JSON.stringify(body)
            });

            const json = (await res.json()) as PostEnvironment['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: metaQueryKey });
        }
    });
}

export function useDeleteEnvironment(env: string) {
    const queryClient = useQueryClient();
    return useMutation<undefined, APIError>({
        mutationFn: async () => {
            const res = await apiFetch(`/api/v1/environments?env=${env}`, {
                method: 'DELETE'
            });

            if (!res.ok) {
                const json = (await res.json()) as Record<string, unknown>;
                throw new APIError({ res, json });
            }
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: metaQueryKey });
        }
    });
}
