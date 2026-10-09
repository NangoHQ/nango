import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';
import { functionRepoPath } from '../utils/scripts';

import type { FunctionType, GetFunctionCode, GetIntegrationFunction, GetIntegrationFunctions, GetIntegrationTemplates } from '@nangohq/types';

interface UseGetIntegrationFunctionsArgs {
    env: string;
    providerConfigKey: string;
    search?: string;
    type?: GetIntegrationFunctions['Querystring']['type'];
    limit?: number;
}

const DEFAULT_LIMIT = 50;

export function useGetIntegrationFunctions({ env, providerConfigKey, search, type, limit = DEFAULT_LIMIT }: UseGetIntegrationFunctionsArgs) {
    return useInfiniteQuery<GetIntegrationFunctions['Success'], APIError>({
        queryKey: ['integrations', env, providerConfigKey, 'functions', { search, type, limit }],
        queryFn: async ({ pageParam = 0 }): Promise<GetIntegrationFunctions['Success']> => {
            const usp = new URLSearchParams();
            usp.set('env', env);
            usp.set('page', String(pageParam));
            usp.set('limit', String(limit));
            if (search?.trim()) {
                usp.set('search', search.trim());
            }
            if (type) {
                usp.set('type', type);
            }

            const res = await apiFetch(`/api/v1/integrations/${encodeURIComponent(providerConfigKey)}/functions?${usp.toString()}`, {
                method: 'GET'
            });

            const json = (await res.json()) as GetIntegrationFunctions['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        getNextPageParam: (lastPage) => {
            const { total, page, limit: pageLimit } = lastPage.pagination;
            const fetchedCount = (page + 1) * pageLimit;
            return fetchedCount < total ? page + 1 : undefined;
        },
        initialPageParam: 0,
        enabled: Boolean(env && providerConfigKey),
        // Without this, every change to search/type produces a fresh query key with no cached data, which flips
        // `isLoading` true and unmounts the filter/search subtree — the input loses focus mid-keystroke.
        placeholderData: keepPreviousData
    });
}

interface UseGetIntegrationFunctionArgs {
    env: string;
    providerConfigKey: string;
    name: string;
    type?: GetIntegrationFunction['Querystring']['type'];
    enabled?: boolean;
}

export function useGetIntegrationFunction({ env, providerConfigKey, name, type, enabled = true }: UseGetIntegrationFunctionArgs) {
    return useQuery<GetIntegrationFunction['Success'], APIError>({
        queryKey: ['integrations', env, providerConfigKey, 'functions', name, { type }],
        queryFn: async (): Promise<GetIntegrationFunction['Success']> => {
            const usp = new URLSearchParams();
            usp.set('env', env);
            if (type) {
                usp.set('type', type);
            }

            const res = await apiFetch(
                `/api/v1/integrations/${encodeURIComponent(providerConfigKey)}/functions/${encodeURIComponent(name)}?${usp.toString()}`,
                { method: 'GET' }
            );

            const json = (await res.json()) as GetIntegrationFunction['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        enabled: enabled && Boolean(env && providerConfigKey && name)
    });
}

interface UseGetIntegrationFunctionCodeArgs {
    env: string;
    providerConfigKey: string;
    name: string;
    type?: GetFunctionCode['Querystring']['type'];
    enabled?: boolean;
}

export function useGetIntegrationFunctionCode({ env, providerConfigKey, name, type, enabled = true }: UseGetIntegrationFunctionCodeArgs) {
    return useQuery<GetFunctionCode['Success'], APIError>({
        queryKey: ['integrations', env, providerConfigKey, 'functions', name, 'code', { type }],
        queryFn: async (): Promise<GetFunctionCode['Success']> => {
            const usp = new URLSearchParams();
            usp.set('env', env);
            if (type) {
                usp.set('type', type);
            }

            const res = await apiFetch(
                `/api/v1/integrations/${encodeURIComponent(providerConfigKey)}/functions/${encodeURIComponent(name)}/code?${usp.toString()}`,
                { method: 'GET' }
            );

            const json = (await res.json()) as GetFunctionCode['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        enabled: enabled && Boolean(env && providerConfigKey && name)
    });
}

/** Public source for undeployed templates, the same files the old templates page loaded. */
const INTEGRATION_TEMPLATES_RAW_URL = 'https://raw.githubusercontent.com/NangoHQ/integration-templates';

interface UseGetTemplateFunctionCodeArgs {
    provider: string;
    name: string;
    type: FunctionType;
    enabled?: boolean;
}

export function useGetTemplateFunctionCode({ provider, name, type, enabled = true }: UseGetTemplateFunctionCodeArgs) {
    return useQuery<string, Error>({
        queryKey: ['template-code', provider, type, name],
        queryFn: async () => {
            const res = await fetch(`${INTEGRATION_TEMPLATES_RAW_URL}/main/${functionRepoPath({ provider, name, type })}`);
            if (!res.ok) {
                throw new Error(`Failed to load template source (${res.status})`);
            }
            return res.text();
        },
        enabled: enabled && Boolean(provider && name),
        retry: false,
        staleTime: 5 * 60 * 1000
    });
}

interface UseGetIntegrationTemplatesArgs {
    env: string;
    providerConfigKey: string;
}

export function useGetIntegrationTemplates({ env, providerConfigKey }: UseGetIntegrationTemplatesArgs) {
    return useQuery<GetIntegrationTemplates['Success'], APIError>({
        queryKey: ['integrations', env, providerConfigKey, 'templates'],
        queryFn: async (): Promise<GetIntegrationTemplates['Success']> => {
            const usp = new URLSearchParams();
            usp.set('env', env);

            const res = await apiFetch(`/api/v1/integrations/${encodeURIComponent(providerConfigKey)}/templates?${usp.toString()}`, { method: 'GET' });

            const json = (await res.json()) as GetIntegrationTemplates['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        enabled: Boolean(env && providerConfigKey)
    });
}
